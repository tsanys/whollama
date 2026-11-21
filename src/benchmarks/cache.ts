import {
  readJson,
  writeJson,
  getFileAge,
  type CacheMetadata,
} from '../utils/storage.js'
import { BENCHMARK_NORMALIZATION_VERSION, normalizeBenchmarkScores } from './normalize.js'
import type {
  BenchmarkRefreshReason,
  BenchmarkRefreshStatus,
  BenchmarkScore,
  BenchmarkSnapshotMetadata,
} from './types.js'

const BENCHMARKS_FILE = 'benchmarks.json'
const BENCHMARKS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const MIN_CACHED_SCORES = 10
const SCORE_TIERS = new Set(['direct', 'variant', 'family', 'curated', 'none'])
const BENCHMARK_SOURCES = new Set(['livebench', 'arena_elo', 'open_llm'])
const REFRESH_AGGREGATION_METHODS = new Set([
  'livebench-weighted-suite-mean-v1',
])

function isSaneScores(scores: unknown): scores is Record<string, BenchmarkScore> {
  if (typeof scores !== 'object' || scores === null || Array.isArray(scores)) {
    return false
  }
  const keys = Object.keys(scores)
  if (keys.length < MIN_CACHED_SCORES) return false
  for (const rawEntry of Object.values(scores)) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
      return false
    }
    const entry = rawEntry as Record<string, unknown>
    if (
      typeof entry.score !== 'number' ||
      !Number.isFinite(entry.score) ||
      entry.score < 0 ||
      entry.score > 100 ||
      typeof entry.tier !== 'string' ||
      !SCORE_TIERS.has(entry.tier) ||
      (entry.model_id !== undefined && typeof entry.model_id !== 'string') ||
      typeof entry.last_updated !== 'string' ||
      !Number.isFinite(Date.parse(entry.last_updated)) ||
      (entry.normalization_status !== undefined &&
        !['primary-source', 'legacy-unverified'].includes(
          String(entry.normalization_status),
        )) ||
      (entry.source_dates !== undefined &&
        (typeof entry.source_dates !== 'object' ||
          entry.source_dates === null ||
          Array.isArray(entry.source_dates) ||
          Object.entries(entry.source_dates as Record<string, unknown>).some(
            ([source, date]) =>
              !BENCHMARK_SOURCES.has(source) || !isDate(date),
          ))) ||
      typeof entry.sources !== 'object' ||
      entry.sources === null ||
      Array.isArray(entry.sources)
    ) {
      return false
    }
    if (
      !Object.values(entry.sources).every(
        (score) => typeof score === 'number' && Number.isFinite(score),
      )
    ) {
      return false
    }
  }
  return true
}

interface CachedBenchmarks {
  timestamp: string
  normalization_version?: string
  scores: Record<string, BenchmarkScore>
  last_refresh?: BenchmarkRefreshStatus
  snapshot?: BenchmarkSnapshotMetadata
}

export interface BenchmarkCacheRead {
  scores: Record<string, BenchmarkScore>
  cache: CacheMetadata
  refresh?: BenchmarkRefreshStatus
  snapshot?: BenchmarkSnapshotMetadata
}

const REFRESH_REASONS = new Set<BenchmarkRefreshReason>([
  'aborted',
  'bundle-fetch-failed',
  'bundle-not-found',
  'categories-fetch-failed',
  'http-error',
  'inadequate-coverage',
  'index-fetch-failed',
  'invalid-categories',
  'invalid-table',
  'network-error',
  'offline',
  'release-dates-not-found',
  'response-too-large',
  'table-fetch-failed',
  'timeout',
])

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function isRefreshStatus(value: unknown): value is BenchmarkRefreshStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const refresh = value as Record<string, unknown>
  if (
    refresh.source !== 'livebench' ||
    !['success', 'failed', 'skipped'].includes(String(refresh.state)) ||
    typeof refresh.url !== 'string' ||
    refresh.url.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(refresh.url) ||
    typeof refresh.row_count !== 'number' ||
    !Number.isSafeInteger(refresh.row_count) ||
    refresh.row_count < 0 ||
    typeof refresh.model_count !== 'number' ||
    !Number.isSafeInteger(refresh.model_count) ||
    refresh.model_count < 0
  ) {
    return false
  }
  try {
    const url = new URL(refresh.url)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'livebench.ai' ||
      url.username ||
      url.password
    ) {
      return false
    }
  } catch {
    return false
  }
  if (
    refresh.reason !== undefined &&
    (typeof refresh.reason !== 'string' ||
      !REFRESH_REASONS.has(refresh.reason as BenchmarkRefreshReason))
  ) {
    return false
  }
  if (
    refresh.http_status !== undefined &&
    (typeof refresh.http_status !== 'number' ||
      !Number.isInteger(refresh.http_status) ||
      refresh.http_status < 100 ||
      refresh.http_status > 599)
  ) {
    return false
  }
  if (
    refresh.aggregation_method !== undefined &&
    (typeof refresh.aggregation_method !== 'string' ||
      !REFRESH_AGGREGATION_METHODS.has(refresh.aggregation_method))
  ) {
    return false
  }
  if (refresh.suite_weights !== undefined) {
    if (
      typeof refresh.suite_weights !== 'object' ||
      refresh.suite_weights === null ||
      Array.isArray(refresh.suite_weights) ||
      Object.keys(refresh.suite_weights).length > 32 ||
      Object.entries(refresh.suite_weights).some(
        ([name, weight]) =>
          !name.trim() ||
          name.length > 64 ||
          /[\u0000-\u001f\u007f]/.test(name) ||
          typeof weight !== 'number' ||
          !Number.isFinite(weight) ||
          weight <= 0 ||
          weight > 1000,
      )
    ) {
      return false
    }
  }
  for (const field of ['latest_release_date', 'data_date'] as const) {
    if (refresh[field] !== undefined && !isDate(refresh[field])) return false
  }
  if (
    refresh.fetched_at !== undefined &&
    (typeof refresh.fetched_at !== 'string' ||
      !Number.isFinite(Date.parse(refresh.fetched_at)))
  ) {
    return false
  }
  return true
}

function isSnapshotMetadata(value: unknown): value is BenchmarkSnapshotMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const metadata = value as Record<string, unknown>
  if (
    !isDate(metadata.as_of) ||
    typeof metadata.as_of_basis !== 'string' ||
    typeof metadata.normalization_version !== 'string' ||
    typeof metadata.weights !== 'object' ||
    metadata.weights === null ||
    Array.isArray(metadata.weights) ||
    typeof metadata.sources !== 'object' ||
    metadata.sources === null ||
    Array.isArray(metadata.sources)
  ) {
    return false
  }
  if (
    metadata.revision !== undefined &&
    typeof metadata.revision !== 'string'
  ) {
    return false
  }
  return true
}

function normalizeContributions(
  scores: Record<string, BenchmarkScore>,
  normalizationVersion?: string,
): Record<string, BenchmarkScore> {
  return normalizationVersion === BENCHMARK_NORMALIZATION_VERSION
    ? scores
    : normalizeBenchmarkScores(scores)
}

async function readCache(
  requireFresh: boolean,
): Promise<BenchmarkCacheRead | null> {
  const fileAge = await getFileAge(BENCHMARKS_FILE)
  if (fileAge === null) return null
  const cached = await readJson<CachedBenchmarks>(BENCHMARKS_FILE)
  if (!cached?.scores) return null
  if (!isSaneScores(cached.scores)) return null
  const timestamp = typeof cached.timestamp === 'string'
    ? Date.parse(cached.timestamp)
    : Number.NaN
  const now = Date.now()
  const age = Number.isFinite(timestamp) && timestamp <= now + 60_000
    ? Math.max(0, now - timestamp)
    : Math.max(0, fileAge)
  if (requireFresh && age > BENCHMARKS_TTL_MS) return null

  const scores = normalizeContributions(
    cached.scores,
    cached.normalization_version,
  )
  if (!isSaneScores(scores)) return null

  return {
    scores,
    cache: {
      freshness: age > BENCHMARKS_TTL_MS ? 'stale' : 'fresh',
      ageMs: Math.max(0, age),
    },
    ...(isRefreshStatus(cached.last_refresh)
      ? { refresh: cached.last_refresh }
      : {}),
    ...(isSnapshotMetadata(cached.snapshot)
      ? { snapshot: cached.snapshot }
      : {}),
  }
}

export async function readBenchmarkCache(): Promise<BenchmarkCacheRead | null> {
  return readCache(true)
}

export async function writeBenchmarkCache(
  scores: Record<string, BenchmarkScore>,
  refresh?: BenchmarkRefreshStatus,
  snapshot?: BenchmarkSnapshotMetadata,
): Promise<void> {
  if (!isSaneScores(scores)) return
  const cached: CachedBenchmarks = {
    timestamp: new Date().toISOString(),
    normalization_version: BENCHMARK_NORMALIZATION_VERSION,
    scores,
    ...(refresh ? { last_refresh: refresh } : {}),
    ...(snapshot ? { snapshot } : {}),
  }
  await writeJson(BENCHMARKS_FILE, cached)
}

export async function writeBenchmarkRefreshStatus(
  refresh: BenchmarkRefreshStatus,
): Promise<void> {
  const cached = await readJson<CachedBenchmarks>(BENCHMARKS_FILE)
  if (!cached || !isSaneScores(cached.scores) || !isRefreshStatus(refresh)) {
    return
  }
  const fileAge = await getFileAge(BENCHMARKS_FILE)
  if (fileAge === null) return
  const now = Date.now()
  const cacheTimestamp = typeof cached.timestamp === 'string'
    ? Date.parse(cached.timestamp)
    : Number.NaN
  const timestamp = Number.isFinite(cacheTimestamp) &&
      cacheTimestamp <= now + 60_000
    ? cached.timestamp
    : new Date(now - Math.max(0, fileAge)).toISOString()
  await writeJson(BENCHMARKS_FILE, {
    ...cached,
    timestamp,
    normalization_version: BENCHMARK_NORMALIZATION_VERSION,
    scores: normalizeContributions(
      cached.scores,
      cached.normalization_version,
    ),
    last_refresh: refresh,
  })
}

export async function readStaleBenchmarks(): Promise<BenchmarkCacheRead | null> {
  return readCache(false)
}
