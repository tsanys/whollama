import { parse as parseHTML, HTMLElement } from 'node-html-parser'
import { safeFetch } from '../utils/fetch.js'
import type { OllamaModel, ModelTag } from './types.js'

interface ScrapedModelInfo {
  name: string
  description: string
  pulls: number
  tags: ModelTag[]
}

function parsePulls(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '')
  if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1_000_000
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1_000
  return parseFloat(cleaned) || 0
}

function parseTags(labelEls: string[]): ModelTag[] {
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
  return tags
}

async function scrapeListPage(
  url: string,
): Promise<ScrapedModelInfo[]> {
  const response = await safeFetch(url)
  if (!response || !response.ok) return []

  const html = await response.text()
  const root = parseHTML(html)
  const items: ScrapedModelInfo[] = []

  // Try various selectors for model list items
  const listItems = root.querySelectorAll('li')

  for (const li of listItems) {
    const link = li.querySelector('a[href^="/library/"]')
    if (!link) continue

    const href = link.getAttribute('href')
    if (!href) continue
    const name = href.replace('/library/', '').split('?')[0]
    if (!name || name.includes('/tags')) continue

    const p = li.querySelector('p')
    const description = p?.textContent?.trim() ?? ''

    // Get size labels and metadata from spans
    const spans = li.querySelectorAll('span')
    const texts = spans.map((s: HTMLElement) => s.textContent?.trim() ?? '')

    let pulls = 0
    for (const t of texts) {
      if (/[0-9.]+[MK]/.test(t) || /[0-9,]+/.test(t)) {
        pulls = parsePulls(t)
        break
      }
    }

    // Tag labels (often in nested spans or as visible text)
    const tags = parseTags(texts)

    items.push({ name, description, pulls, tags })
  }

  return items
}

async function scrapeTagVariants(
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

  // Look for tag rows in the tags page
  const rows = root.querySelectorAll('tr')
  for (const row of rows) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 3) continue

    const tagName = cells[0]?.textContent?.trim()
    if (!tagName || tagName === 'Tags') continue

    // Parse the tag
    const quantMatch = tagName.match(
      /(Q[2-8]_K_[SML]|Q[2-8]_0|F16|F32)/i,
    )
    const sizeMatch = tagName.match(/(\d+\.?\d*)\s*B/i)

    if (quantMatch && sizeMatch) {
      variants.push({
        name: `${modelName}:${tagName.replace(/^.*?:?/, '')}`,
        params_b: parseFloat(sizeMatch[1]),
        quant: quantMatch[1].toUpperCase(),
      })
    }
  }

  return variants
}

export async function scrapeCatalog(): Promise<OllamaModel[]> {
  const baseUrl = 'https://ollama.com/library?sort=popular'

  // Scrape first 2 pages (most popular models)
  const pages = [baseUrl, `${baseUrl}&page=2`]
  const pageResults = await Promise.all(
    pages.map((url) => scrapeListPage(url)),
  )
  const allItems = pageResults.flat()

  if (allItems.length === 0) return []

  // For each model, fetch tag variants (rate-limited)
  const models: OllamaModel[] = []

  for (const item of allItems) {
    try {
      const variants = await scrapeTagVariants(item.name)

      if (variants.length > 0) {
        for (const v of variants) {
          // Estimate VRAM based on params and quant
          const vramGb = v.params_b * 0.65 // rough estimate
          const ramGb = v.params_b * 0.75

          models.push({
            name: `${item.name}:${v.name.split(':').pop() ?? 'latest'}`,
            family: item.name,
            params_b: v.params_b,
            quant: v.quant,
            vram_required_gb: parseFloat(vramGb.toFixed(1)),
            ram_required_gb: parseFloat(ramGb.toFixed(1)),
            tags: item.tags,
            pulls: item.pulls || 0,
            updated_at: new Date().toISOString(),
            source: 'live',
          })
        }
      } else {
        // No tag variants found — add as a single entry
        const vramGb = 4.0 // rough estimate for unknown
        const ramGb = 5.0
        models.push({
          name: `${item.name}:latest`,
          family: item.name,
          params_b: 7.0,
          quant: 'Q4_K_M',
          vram_required_gb: vramGb,
          ram_required_gb: ramGb,
          tags: item.tags,
          pulls: item.pulls || 0,
          updated_at: new Date().toISOString(),
          source: 'live',
        })
      }

      // Rate limit: 1 request per second
      await new Promise((r) => setTimeout(r, 1100))
    } catch {
      // Skip this model, continue with next
      continue
    }
  }

  return models
}
