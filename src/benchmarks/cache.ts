import { readJson, writeJson, getFileAge } from '../utils/storage.js'
import type { BenchmarkScore } from './types.js'

const BENCHMARKS_FILE = 'benchmarks.json'
const BENCHMARKS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

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

  return cached.scores
}

export async function writeBenchmarkCache(
  scores: Record<string, BenchmarkScore>,
): Promise<void> {
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
  return cached.scores
}
