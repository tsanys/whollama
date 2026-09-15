import { parse as parseHTML, HTMLElement } from 'node-html-parser'
import { safeFetch } from '../utils/fetch.js'
import { estimateVramGb } from '../scorer/vram.js'
import type { OllamaModel, ModelTag, CatalogProgressCallback } from './types.js'

export interface CatalogSource {
  name: string
  fetch(onProgress?: CatalogProgressCallback): Promise<OllamaModel[]>
}

interface ScrapedModelInfo {
  name: string
  description: string
  pulls: number
  tags: ModelTag[]
}

/** Strip ANSI escapes + control chars from scraped strings (terminal injection hardening). */
export function sanitizeScraped(text: string): string {
  return text
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

export function parsePulls(text: string): number {
  const match = text.trim().match(/([\d,.]+)\s*([MK])?\b/i)
  if (!match) return 0
  const num = parseFloat(match[1].replace(/,/g, ''))
  if (!Number.isFinite(num)) return 0
  const suffix = (match[2] ?? '').toUpperCase()
  if (suffix === 'M') return Math.round(num * 1_000_000)
  if (suffix === 'K') return Math.round(num * 1_000)
  return Math.round(num)
}

export function parseTags(labelEls: string[]): ModelTag[] {
  const tags: ModelTag[] = []
  for (const text of labelEls) {
    const lower = text.toLowerCase()
    if (lower.includes('tools')) tags.push('tools')
    if (lower.includes('vision')) tags.push('vision')
    if (lower.includes('code')) tags.push('code')
    if (lower.includes('math')) tags.push('math')
    if (lower.includes('embed')) tags.push('embedding')
  }
  if (tags.length === 0) tags.push('general')
  return [...new Set(tags)]
}

/** Prefer spans that explicitly mention pulls; avoid matching description numbers like "7B". */
function extractPulls(texts: string[]): number {
  // Pass 1: explicit pulls label, e.g. "1.2M Pulls", "850K pulls", "1,234 pulls"
  for (const t of texts) {
    if (/pulls?/i.test(t)) {
      const v = parsePulls(t)
      if (v > 0) return v
    }
  }
  // Pass 2: compact "1.2M" / "850K" without label (must have M/K suffix)
  for (const t of texts) {
    if (/^\s*[\d,.]+\s*[MK]\s*$/i.test(t.trim())) {
      const v = parsePulls(t)
      if (v > 0) return v
    }
  }
  return 0
}

async function scrapeListPage(
  url: string,
): Promise<ScrapedModelInfo[]> {
  const response = await safeFetch(url)
  if (!response || !response.ok) return []

  const html = await response.text()
  return parseCatalogListHtml(html)
}

/** Pure HTML → items parser (exported for unit tests with fixtures). */
export function parseCatalogListHtml(html: string): ScrapedModelInfo[] {
  const root = parseHTML(html)
  const items: ScrapedModelInfo[] = []

  const listItems = root.querySelectorAll('li')

  for (const li of listItems) {
    const link = li.querySelector('a[href^="/library/"]')
    if (!link) continue

    const href = link.getAttribute('href')
    if (!href) continue
    const name = href.replace('/library/', '').split('?')[0]
    if (!name || name.includes('/tags')) continue

    const p = li.querySelector('p')
    const description = sanitizeScraped(p?.textContent?.trim() ?? '')

    const spans = li.querySelectorAll('span')
    const texts = spans.map((s: HTMLElement) =>
      sanitizeScraped(s.textContent?.trim() ?? ''),
    )

    const pulls = extractPulls(texts)

    const tags = parseTags(texts)

    items.push({ name, description, pulls, tags })
  }

  return items
}

export const QUANT_TAG_PATTERN = /(Q[2-8](?:_K_[SML]|_[01])?|F16|F32)/i
export const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*[bB]\b/

export async function scrapeTagVariants(
  modelName: string,
): Promise<
  Array<{ name: string; params_b: number; quant: string }>
> {
  const url = `https://ollama.com/library/${modelName}/tags`
  const response = await safeFetch(url)
  if (!response || !response.ok) return []

  const html = await response.text()
  const root = parseHTML(html)
  const variants: Array<{ name: string; params_b: number; quant: string }> = []

  const rows = root.querySelectorAll('tr')
  for (const row of rows) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 3) continue

    const tagName = sanitizeScraped(cells[0]?.textContent?.trim() ?? '')
    if (!tagName || tagName === 'Tags') continue

    const quantMatch = tagName.match(QUANT_TAG_PATTERN)
    const sizeMatch = tagName.match(SIZE_PATTERN)

    if (quantMatch && sizeMatch) {
      variants.push({
        name: `${modelName}:${tagName}`,
        params_b: parseFloat(sizeMatch[1]),
        quant: quantMatch[1].toUpperCase(),
      })
    }
  }

  return variants
}

export function modelFromVariants(
  item: ScrapedModelInfo,
  variants: Array<{ name: string; params_b: number; quant: string }>,
): OllamaModel[] {
  if (variants.length > 0) {
    return variants.map((v) => {
      const vramGb = estimateVramGb(v.params_b, v.quant)
      const ramGb = vramGb * 1.2
      return {
        name: sanitizeScraped(`${item.name}:${v.name.split(':').pop() ?? 'latest'}`),
        family: sanitizeScraped(item.name),
        params_b: v.params_b,
        quant: v.quant,
        vram_required_gb: parseFloat(vramGb.toFixed(1)),
        ram_required_gb: parseFloat(ramGb.toFixed(1)),
        tags: item.tags,
        pulls: item.pulls || 0,
        updated_at: new Date().toISOString(),
        source: 'live' as const,
      }
    })
  }

  return [{
    name: `${item.name}:latest`,
    family: item.name,
    params_b: 7.0,
    quant: 'Q4_K_M',
    vram_required_gb: 4.0,
    ram_required_gb: 5.0,
    tags: item.tags,
    pulls: item.pulls || 0,
    updated_at: new Date().toISOString(),
    source: 'live' as const,
  }]
}

async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

const CONCURRENCY = 5
const SCRAPE_OVERALL_TIMEOUT_MS = 45_000

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export class HtmlScrapeSource implements CatalogSource {
  name = 'live-html'
  fetch(onProgress?: CatalogProgressCallback): Promise<OllamaModel[]> {
    return scrapeCatalog(onProgress)
  }
}

export async function scrapeCatalog(
  onProgress?: CatalogProgressCallback,
): Promise<OllamaModel[]> {
  return withTimeout(scrapeCatalogInner(onProgress), SCRAPE_OVERALL_TIMEOUT_MS, [])
}

async function scrapeCatalogInner(
  onProgress?: CatalogProgressCallback,
): Promise<OllamaModel[]> {
  const baseUrl = 'https://ollama.com/library?sort=popular'

  const pages = [baseUrl, `${baseUrl}&page=2`]
  const pageResults = await Promise.all(
    pages.map((url) => scrapeListPage(url)),
  )
  const allItems = pageResults.flat()

  if (allItems.length === 0) return []

  const models: OllamaModel[] = []

  const results = await concurrentMap(
    allItems,
    async (item, index) => {
      if (onProgress) onProgress(index + 1, allItems.length, item.name)

      try {
        const variants = await scrapeTagVariants(item.name)
        return modelFromVariants(item, variants)
      } catch {
        return modelFromVariants(item, [])
      }
    },
    CONCURRENCY,
  )

  for (const batch of results) {
    models.push(...batch)
  }

  return models
}
