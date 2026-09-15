import { readJson, writeJson, getFileAge } from '../utils/storage.js'
import type { BenchmarkScore } from './types.js'

const BENCHMARKS_FILE = 'benchmarks.json'
const BENCHMARKS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const MIN_CACHED_SCORES = 10

function isSaneScores(scores: Record<string, BenchmarkScore>): boolean {
  const keys = Object.keys(scores)
  if (keys.length < MIN_CACHED_SCORES) return false
  // Reject poisoned caches (e.g. downloads/likes ingested as scores >100)
  for (const entry of Object.values(scores)) {
    if (typeof entry?.score !== 'number' || !Number.isFinite(entry.score)) return false
    if (entry.score < 0 || entry.score > 100) return false
  }
  return true
}

interface CachedBenchmarks {
  timestamp: string
  scores: Record<string, BenchmarkScore>
}

export async function readBenchmarkCache(): Promise<
  Record<string, BenchmarkScore> | null
> {
  const age = await getFileAge(BENCHMARKS_FILE)
  if (age === null) return null
  if (age > BENCHMARKS_TTL_MS) return null

  const cached = await readJson<CachedBenchmarks>(BENCHMARKS_FILE)
  if (!cached?.scores) return null
  if (!isSaneScores(cached.scores)) return null

  return cached.scores
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

export async function readStaleBenchmarks(): Promise<
  Record<string, BenchmarkScore> | null
> {
  const cached = await readJson<CachedBenchmarks>(BENCHMARKS_FILE)
  if (!cached?.scores) return null
  if (!isSaneScores(cached.scores)) return null
  return cached.scores
}
