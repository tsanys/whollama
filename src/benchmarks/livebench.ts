import { safeFetchDetailed } from '../utils/fetch.js'
import { normalize } from './resolver.js'
import type {
  BenchmarkRefreshReason,
  BenchmarkRefreshStatus,
} from './types.js'

const SITE = 'https://livebench.ai'
const RELEASE_PATTERN = /["'](20\d{6})["']/g
const MISSING_SCORE_VALUES = new Set(['', '-', 'n/a', 'na'])
const AGGREGATION_METHOD = 'livebench-weighted-suite-mean-v1'

export interface LiveBenchFetchResult extends BenchmarkRefreshStatus {
  scores: Map<string, number>
}

interface LiveBenchCategories {
  suites: Array<[string, string[]]>
  weights: Record<string, number>
}

export interface ParsedLiveBenchTable {
  scores: Map<string, number>
  rowCount: number
  valid: boolean
}

function validReleaseDate(date: string): boolean {
  if (!/^\d{8}$/.test(date)) return false
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6))
  const day = Number(date.slice(6, 8))
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function toIsoDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

function failureReason(
  reason: BenchmarkRefreshReason,
  url: string,
  fetchedAt: string,
  httpStatus?: number,
  latestReleaseDate?: string,
): LiveBenchFetchResult {
  return {
    source: 'livebench',
    state: 'failed',
    url,
    fetched_at: fetchedAt,
    row_count: 0,
    model_count: 0,
    reason,
    ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
    ...(latestReleaseDate ? { latest_release_date: latestReleaseDate } : {}),
    scores: new Map(),
  }
}

function fetchFailureReason(
  failure: Awaited<ReturnType<typeof safeFetchDetailed>>['failure'],
  stage:
    | 'bundle-fetch-failed'
    | 'categories-fetch-failed'
    | 'index-fetch-failed'
    | 'table-fetch-failed',
): BenchmarkRefreshReason {
  switch (failure?.reason) {
    case 'aborted':
      return 'aborted'
    case 'network-error':
      return 'network-error'
    case 'http-error':
      return 'http-error'
    case 'response-too-large':
      return 'response-too-large'
    case 'timeout':
      return 'timeout'
    default:
      return stage
  }
}

function fetchFailureStatus(
  failure: Awaited<ReturnType<typeof safeFetchDetailed>>['failure'],
): number | undefined {
  return failure?.status
}

/** Extract valid LiveBench 2.0 release IDs from the current site bundle. */
export function parseReleaseDates(js: string): string[] {
  const dates = new Set<string>()
  const releaseArray = js.match(/\bYt\s*=\s*\[([^\]]*)\]/)?.[1]
  for (const match of (releaseArray ?? js).matchAll(RELEASE_PATTERN)) {
    const date = match[1]
    if (validReleaseDate(date)) dates.add(date)
  }
  return [...dates].sort((a, b) => b.localeCompare(a))
}

export function parseLiveBenchCategories(
  value: unknown,
): LiveBenchCategories | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const suites: Array<[string, string[]]> = []
  const weightsValue = record._overall_weights
  const weights: Record<string, number> = {}

  if (
    weightsValue !== undefined &&
    (typeof weightsValue !== 'object' ||
      weightsValue === null ||
      Array.isArray(weightsValue))
  ) {
    return null
  }

  for (const [name, value] of Object.entries(record)) {
    if (name.startsWith('_')) continue
    if (
      !name.trim() ||
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((column) => typeof column === 'string' && column.trim())
    ) {
      return null
    }
    suites.push([name, value as string[]])
  }
  if (suites.length === 0) return null
  const suiteNames = new Set(suites.map(([name]) => name))

  if (weightsValue && typeof weightsValue === 'object') {
    for (const [name, weight] of Object.entries(weightsValue)) {
      const numericWeight = Number(weight)
      if (
        suiteNames.has(name) &&
        Number.isFinite(numericWeight) &&
        numericWeight > 0
      ) weights[name] = numericWeight
    }
  }

  return { suites, weights }
}

function parseCsv(csv: string): { rows: string[][]; valid: boolean } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index++) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'
        index++
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) return { rows: [], valid: false }
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      row.push(field)
      field = ''
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      if (character === '\r' && csv[index + 1] === '\n') index++
    } else {
      field += character
    }
  }

  if (quoted) return { rows: [], valid: false }
  row.push(field)
  if (row.some((cell) => cell.length > 0)) rows.push(row)
  return { rows, valid: true }
}

/**
 * Parse the LiveBench 2.0 suite table and mirror its weighted overall score.
 * Each suite is averaged across its declared columns, then available suites
 * are combined using the release's `_overall_weights` (default weight 1).
 */
export function parseLiveBenchTable(
  csv: string,
  categories: LiveBenchCategories,
): ParsedLiveBenchTable {
  const parsed = parseCsv(csv)
  if (!parsed.valid || parsed.rows.length < 2) {
    return { scores: new Map(), rowCount: 0, valid: false }
  }

  const headers = parsed.rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim(),
  )
  if (
    headers[0] !== 'model' ||
    new Set(headers).size !== headers.length ||
    headers.some((header) => !header)
  ) {
    return { scores: new Map(), rowCount: 0, valid: false }
  }

  const categoryColumns = categories.suites.flatMap(([, columns]) => columns)
  const tableColumns = headers.slice(1)
  if (
    new Set(categoryColumns).size !== categoryColumns.length ||
    categoryColumns.length !== tableColumns.length ||
    categoryColumns.some((column) => !tableColumns.includes(column))
  ) {
    return { scores: new Map(), rowCount: 0, valid: false }
  }

  const scores = new Map<string, number>()
  let rowCount = 0

  for (const cells of parsed.rows.slice(1)) {
    if (cells.length !== headers.length) {
      return { scores: new Map(), rowCount, valid: false }
    }
    const modelName = cells[0].trim()
    if (!modelName) continue
    rowCount++

    let weightedTotal = 0
    let totalWeight = 0
    for (const [suite, columns] of categories.suites) {
      const weight = categories.weights[suite] ?? 1
      const suiteScores: number[] = []

      for (const column of columns) {
        const cell = cells[headers.indexOf(column)].trim()
        if (MISSING_SCORE_VALUES.has(cell.toLowerCase())) continue
        const score = Number(cell)
        if (!Number.isFinite(score) || score < 0 || score > 100) {
          return { scores: new Map(), rowCount, valid: false }
        }
        suiteScores.push(score)
      }

      if (suiteScores.length === 0) continue
      const suiteAverage =
        suiteScores.reduce((sum, score) => sum + score, 0) / suiteScores.length
      weightedTotal += suiteAverage * weight
      totalWeight += weight
    }

    if (totalWeight === 0) continue
    const normalizedName = normalize(modelName)
    if (!normalizedName || scores.has(normalizedName)) {
      return { scores: new Map(), rowCount, valid: false }
    }
    scores.set(
      normalizedName,
      Math.round((weightedTotal / totalWeight) * 100) / 100,
    )
  }

  return { scores, rowCount, valid: scores.size > 0 }
}

/** Fetch the latest published LiveBench 2.0 static table and its categories. */
export async function fetchLiveBench(): Promise<LiveBenchFetchResult> {
  const fetchedAt = new Date().toISOString()
  const indexResult = await safeFetchDetailed(`${SITE}/`, {
    timeout: 10000,
    maxResponseBytes: 1024 * 1024,
  })
  if (!indexResult.response) {
    return failureReason(
      fetchFailureReason(indexResult.failure, 'index-fetch-failed'),
      `${SITE}/`,
      fetchedAt,
      fetchFailureStatus(indexResult.failure),
    )
  }

  const html = await indexResult.response.text()
  const bundle = html.match(/static\/js\/main\.([a-f0-9]+)\.js/)?.[1]
  if (!bundle) {
    return failureReason('bundle-not-found', `${SITE}/`, fetchedAt)
  }

  const bundleUrl = `${SITE}/static/js/main.${bundle}.js`
  const bundleResult = await safeFetchDetailed(bundleUrl, {
    timeout: 15000,
    maxResponseBytes: 8 * 1024 * 1024,
  })
  if (!bundleResult.response) {
    return failureReason(
      fetchFailureReason(bundleResult.failure, 'bundle-fetch-failed'),
      bundleUrl,
      fetchedAt,
      fetchFailureStatus(bundleResult.failure),
    )
  }

  const releaseDates = parseReleaseDates(await bundleResult.response.text())
  const releaseId = releaseDates[0]
  if (!releaseId) {
    return failureReason('release-dates-not-found', bundleUrl, fetchedAt)
  }

  const dataDate = toIsoDate(releaseId)
  const tableUrl = `${SITE}/data/${releaseId}/table.csv`
  const categoriesUrl = `${SITE}/data/${releaseId}/categories.json`
  const [tableResult, categoriesResult] = await Promise.all([
    safeFetchDetailed(tableUrl, {
      timeout: 15000,
      maxResponseBytes: 8 * 1024 * 1024,
    }),
    safeFetchDetailed(categoriesUrl, {
      timeout: 15000,
      maxResponseBytes: 1024 * 1024,
      accept: 'application/json',
    }),
  ])

  if (!tableResult.response) {
    return failureReason(
      fetchFailureReason(tableResult.failure, 'table-fetch-failed'),
      tableUrl,
      fetchedAt,
      fetchFailureStatus(tableResult.failure),
      dataDate,
    )
  }
  if (!categoriesResult.response) {
    return failureReason(
      fetchFailureReason(categoriesResult.failure, 'categories-fetch-failed'),
      categoriesUrl,
      fetchedAt,
      fetchFailureStatus(categoriesResult.failure),
      dataDate,
    )
  }

  let categoriesJson: unknown
  try {
    categoriesJson = await categoriesResult.response.json()
  } catch {
    return failureReason(
      'invalid-categories',
      categoriesUrl,
      fetchedAt,
      undefined,
      dataDate,
    )
  }
  const categories = parseLiveBenchCategories(categoriesJson)
  if (!categories) {
    return failureReason(
      'invalid-categories',
      categoriesUrl,
      fetchedAt,
      undefined,
      dataDate,
    )
  }

  const parsed = parseLiveBenchTable(await tableResult.response.text(), categories)
  if (!parsed.valid) {
    return {
      ...failureReason('invalid-table', tableUrl, fetchedAt),
      row_count: parsed.rowCount,
      latest_release_date: dataDate,
    }
  }

  return {
    source: 'livebench',
    state: 'success',
    url: tableUrl,
    latest_release_date: dataDate,
    data_date: dataDate,
    fetched_at: new Date().toISOString(),
    row_count: parsed.rowCount,
    model_count: parsed.scores.size,
    aggregation_method: AGGREGATION_METHOD,
    suite_weights: categories.weights,
    scores: parsed.scores,
  }
}
