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
export function extractPulls(texts: string[]): number {
  // Pass 1: explicit pulls label, e.g. "1.2M Pulls", "850K pulls", "1,234 pulls"
  for (const t of texts) {
    if (/pulls?/i.test(t)) {
      const v = parsePulls(t)
      if (v > 0) return v
    }
  }
  // Pass 1b: label split across sibling spans (site markup puts the number
  // and the word "Pulls" in adjacent spans), e.g. ["119.5M", "Pulls"]
  for (let i = 0; i + 1 < texts.length; i++) {
    const joined = `${texts[i]} ${texts[i + 1]}`
    if (/pulls?/i.test(joined)) {
      const v = parsePulls(joined)
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

import { MIN_CACHED_MODELS } from './cache.js'

/** Dedupe models by normalized name, keep-first (site pagination overlaps). */
export function dedupeModels(models: OllamaModel[]): OllamaModel[] {
  const seen = new Set<string>()
  return models.filter((m) => {
    const key = m.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Dedupe scraped list items by family name, keep-first. */
export function dedupeItems(items: ScrapedModelInfo[]): ScrapedModelInfo[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

/** Size prefix of a tag: `14b`, `0.6b`, `270m` (millions → ÷1000), `e4b` (vendor prefix). */
export const TAG_SIZE_PATTERN = /^(?:[a-z]+)?(\d+(?:\.\d+)?)\s*([bBmM])\b/i
/** Quant suffix of a tag (site uses lowercase): `q4_K_M`, `q8_0`, `fp16`, `bf16`. */
export const TAG_QUANT_PATTERN = /(q\d+_K_[SML]|q\d+_\d+|fp16|bf16)$/i

export interface TagVariant {
  name: string
  params_b: number
  quant: string
}

/**
 * Parse one tag name (e.g. `14b`, `0.6b-q4_K_M`, `235b-a22b-q4_K_M`,
 * `270m-it-q8_0`) into a sized variant. Returns null for aliases without
 * a size prefix (`latest`, `instruct`, ...). Unknown quants fall back to
 * Ollama's default Q4_K_M.
 */
export function parseTagVariant(modelName: string, tag: string): TagVariant | null {
  const sizeMatch = tag.match(TAG_SIZE_PATTERN)
  if (!sizeMatch) return null
  let params_b = parseFloat(sizeMatch[1])
  if (sizeMatch[2].toLowerCase() === 'm') params_b = params_b / 1000
  if (!Number.isFinite(params_b) || params_b <= 0) return null

  const quantMatch = tag.match(TAG_QUANT_PATTERN)
  const quant = quantMatch ? quantMatch[1].toUpperCase() : 'Q4_K_M'
  return { name: `${modelName}:${tag}`, params_b, quant }
}

/**
 * Pure tags-page → variants parser (exported for unit tests with fixtures).
 * Reads `<a href="/library/<model>:<tag>">` links — the site's current
 * markup (no tables since the 2026 redesign).
 */
export function parseTagsPageHtml(modelName: string, html: string): TagVariant[] {
  const root = parseHTML(html)
  const want = modelName.toLowerCase()
  const seen = new Set<string>()
  const variants: TagVariant[] = []

  for (const a of root.querySelectorAll('a')) {
    const href = (a.getAttribute('href') ?? '').split('?')[0]
    const m = href.match(/^\/library\/([^/:]+):([^/]+)$/)
    if (!m) continue
    if (m[1].toLowerCase() !== want) continue
    const tag = sanitizeScraped(m[2])
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    const v = parseTagVariant(modelName, tag)
    if (v) variants.push(v)
  }

  return variants
}

export async function scrapeTagVariants(modelName: string): Promise<TagVariant[]> {
  const url = `https://ollama.com/library/${modelName}/tags`
  // Ask for JSON: the site serves `{"tags": [...]}` via content negotiation,
  // which is smaller and immune to markup churn. HTML is the fallback.
  const response = await safeFetch(url, { accept: 'application/json' })
  if (!response || !response.ok) return []

  const text = await response.text()
  const fromJson = parseTagsJson(modelName, text)
  if (fromJson) return fromJson
  return parseTagsPageHtml(modelName, text)
}

/** Parse a `{"tags": [...]}` body. Null = not JSON (caller tries HTML). */
export function parseTagsJson(modelName: string, text: string): TagVariant[] | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const tags = (data as { tags?: unknown }).tags
  if (!Array.isArray(tags)) return null

  const seen = new Set<string>()
  const variants: TagVariant[] = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    const tag = sanitizeScraped(raw)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    const v = parseTagVariant(modelName, tag)
    if (v) variants.push(v)
  }
  return variants
}

export function modelFromVariants(
  item: ScrapedModelInfo,
  variants: TagVariant[],
): OllamaModel[] {
  // No sized variants → skip the model entirely. Emitting a fake 7B `:latest`
  // entry poisons ranking (every model looks identical); the caller falls
  // through to stale cache → curated catalog instead.
  if (variants.length === 0) return []
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
  // Single list page: the site ignores `&page=N` (page 2 returns the same
  // 240 models), so extra pages only produce duplicates.
  const baseUrl = 'https://ollama.com/library?sort=popular'

  const allItems = dedupeItems(await scrapeListPage(baseUrl))

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

  const deduped = dedupeModels(models)
  // A tiny result means the markup changed again — report failure so the
  // caller falls through to stale cache → curated catalog instead of
  // caching a broken sliver.
  if (deduped.length < MIN_CACHED_MODELS) return []
  return deduped
}
