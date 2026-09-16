import { safeFetch } from '../utils/fetch.js'
import { normalize } from './resolver.js'

const SITE = 'https://livebench.ai'

// Last-known table dates (newest first). The live list is discovered from
// the site bundle at runtime; this chain is the fallback if discovery fails.
const KNOWN_TABLES = ['2026_06_25', '2025_05_30', '2025_04_25', '2025_04_02', '2024_11_25']
const MAX_TABLES = 4

/**
 * Fetch LiveBench scores from the site's public dated CSV tables
 * (verified 2026-09: `table_<YYYY_MM_DD>.csv`, model + 0-100 task columns).
 * Newer tables win per model. Empty map if all fail.
 */
export async function fetchLiveBench(): Promise<Map<string, number>> {
  let dates: string[]
  try {
    dates = await discoverTableDates()
  } catch {
    dates = []
  }
  const chain = [...dates.slice(-MAX_TABLES), ...KNOWN_TABLES]
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .slice(0, MAX_TABLES)

  const merged = new Map<string, number>()
  for (const d of chain) {
    const table = await fetchTable(d)
    for (const [name, score] of table) {
      if (!merged.has(name)) merged.set(name, score)
    }
  }
  return merged
}

/** Discover available table dates from the site's JS bundle. */
export async function discoverTableDates(): Promise<string[]> {
  const index = await safeFetch(`${SITE}/`, { timeout: 10000 })
  if (!index || !index.ok) return []
  const html = await index.text()
  const bundle = html.match(/static\/js\/main\.([a-f0-9]+)\.js/)?.[1]
  if (!bundle) return []
  const js = await safeFetch(`${SITE}/static/js/main.${bundle}.js`, { timeout: 15000 })
  if (!js || !js.ok) return []
  return parseBundleDates(await js.text())
}

/** Extract the `pe=["YYYY-MM-DD", ...]` table-date list from bundle source. */
export function parseBundleDates(js: string): string[] {
  const m = js.match(/pe=\[([^\]]*)\]/)
  if (!m) return []
  return [...m[1].matchAll(/"(\d{4}-\d{2}-\d{2})"/g)]
    .map((x) => x[1].replaceAll('-', '_'))
    .filter((d, i, arr) => arr.indexOf(d) === i)
}

async function fetchTable(date: string): Promise<Map<string, number>> {
  try {
    const response = await safeFetch(`${SITE}/table_${date}.csv`, { timeout: 15000 })
    if (!response || !response.ok) return new Map()
    return parseTableCsv(await response.text())
  } catch {
    return new Map()
  }
}

/**
 * Parse one table CSV: first column `model`, remaining columns 0-100 task
 * scores. Score = unweighted mean of numeric cells (mirrors the site),
 * rounded to 1 decimal. Keys use the shared name normalizer.
 */
export function parseTableCsv(csv: string): Map<string, number> {
  const scores = new Map<string, number>()
  const lines = csv.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    if (cells.length < 2) continue
    const name = cells[0].trim().replace(/^"|"$/g, '')
    if (!name) continue
    let sum = 0
    let n = 0
    for (let j = 1; j < cells.length; j++) {
      const v = parseFloat(cells[j])
      if (Number.isFinite(v)) {
        sum += v
        n++
      }
    }
    if (n === 0) continue
    scores.set(normalize(name), Math.round((sum / n) * 10) / 10)
  }
  return scores
}
