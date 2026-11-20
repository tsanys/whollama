import {
  readJson,
  writeJson,
  getFileAge,
  type CacheMetadata,
} from '../utils/storage.js'
import type { BenchmarkScore } from './types.js'

const BENCHMARKS_FILE = 'benchmarks.json'
const BENCHMARKS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const MIN_CACHED_SCORES = 10
const SCORE_TIERS = new Set(['direct', 'variant', 'family', 'curated', 'none'])

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
  scores: Record<string, BenchmarkScore>
}

export interface BenchmarkCacheRead {
  scores: Record<string, BenchmarkScore>
  cache: CacheMetadata
}

export async function readBenchmarkCache(): Promise<BenchmarkCacheRead | null> {
  const age = await getFileAge(BENCHMARKS_FILE)
  if (age === null) return null
  if (age > BENCHMARKS_TTL_MS) return null

  const cached = await readJson<CachedBenchmarks>(BENCHMARKS_FILE)
  if (!cached?.scores) return null
  if (!isSaneScores(cached.scores)) return null

  return {
    scores: cached.scores,
    cache: { freshness: 'fresh', ageMs: Math.max(0, age) },
  }
}

export async function writeBenchmarkCache(
  scores: Record<string, BenchmarkScore>,
): Promise<void> {
  if (!isSaneScores(scores)) return
  const cached: CachedBenchmarks = {
    timestamp: new Date().toISOString(),
    scores,
  }
  await writeJson(BENCHMARKS_FILE, cached)
}

export async function readStaleBenchmarks(): Promise<BenchmarkCacheRead | null> {
  const age = await getFileAge(BENCHMARKS_FILE)
  if (age === null) return null

  const cached = await readJson<CachedBenchmarks>(BENCHMARKS_FILE)
  if (!cached?.scores) return null
  if (!isSaneScores(cached.scores)) return null
  return {
    scores: cached.scores,
    cache: {
      freshness: age > BENCHMARKS_TTL_MS ? 'stale' : 'fresh',
      ageMs: Math.max(0, age),
    },
  }
}
