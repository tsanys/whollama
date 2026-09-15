import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { readBenchmarkCache, writeBenchmarkCache, readStaleBenchmarks } from './cache.js'
import { fetchLiveBench } from './livebench.js'
import { fetchArenaElo } from './arena.js'
import { fetchOpenLlm } from './openllm.js'
import type { BenchmarkScore } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FALLBACK_PATH = path.resolve(__dirname, '../../data/benchmarks.json')

export interface BenchmarkOptions {
  offline?: boolean
  forceRefresh?: boolean
}

export interface BenchmarkResult {
  scores: Record<string, BenchmarkScore>
  source: 'cache' | 'live' | 'curated'
}

export const MIN_LIVE_SCORES = 10

export async function getBenchmarkScores(
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const { offline = false, forceRefresh = false } = options

  // Step 1: Check fresh cache
  if (!forceRefresh) {
    const cached = await readBenchmarkCache()
    if (cached) {
      return { scores: cached, source: 'cache' }
    }
  }

  // Step 2: Fetch live data (skip if offline)
  if (!offline) {
    const liveScores = await fetchLiveScores()
    if (liveScores && Object.keys(liveScores).length >= MIN_LIVE_SCORES) {
      // Merge curated fallback for models missing from live (keeps offline value prop)
      const curated = await loadCuratedBenchmarks()
      for (const [key, entry] of Object.entries(curated)) {
        if (!(key in liveScores)) {
          liveScores[key] = {
            model_id: (entry as BenchmarkScore).model_id ?? key,
            score: (entry as BenchmarkScore).score ?? 0,
            tier: 'curated',
            sources: (entry as BenchmarkScore).sources ?? {},
            last_updated:
              (entry as BenchmarkScore).last_updated ?? new Date().toISOString(),
          }
        }
      }
      await writeBenchmarkCache(liveScores)
      return { scores: liveScores, source: 'live' }
    }
  }

  // Step 3: Stale cache
  const stale = await readStaleBenchmarks()
  if (stale) {
    return { scores: stale, source: 'cache' }
  }

  // Step 4: Curated fallback
  const curated = await loadCuratedBenchmarks()
  return { scores: curated, source: 'curated' }
}

async function fetchLiveScores(): Promise<Record<string, BenchmarkScore> | null> {
  const results = await Promise.allSettled([
    fetchLiveBench(),
    fetchArenaElo(),
    fetchOpenLlm(),
  ])

  const allScores = new Map<string, Map<string, number>>()

  const sourceNames = ['livebench', 'arena_elo', 'open_llm'] as const

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      const sourceMap = result.value
      for (const [model, score] of sourceMap) {
        if (!allScores.has(model)) {
          allScores.set(model, new Map())
        }
        allScores.get(model)!.set(sourceNames[i], score)
      }
    }
  }

  if (allScores.size === 0) return null

  // Merge: average scores across sources
  const merged: Record<string, BenchmarkScore> = {}

  for (const [normalizedName, sources] of allScores) {
    const values = Array.from(sources.values())
    const avg =
      values.reduce((sum, v) => sum + v, 0) / values.length

    // Use the highest tier among matched sources
    const sourceObj: { livebench?: number; arena_elo?: number; open_llm?: number } = {}
    for (const [source, score] of sources) {
      sourceObj[source as keyof typeof sourceObj] = score
    }

    merged[normalizedName] = {
      model_id: normalizedName,
      score: Math.round(avg * 10) / 10,
      tier: 'direct',
      sources: sourceObj,
      last_updated: new Date().toISOString(),
    }
  }

  return merged
}

async function loadCuratedBenchmarks(): Promise<
  Record<string, BenchmarkScore>
> {
  try {
    const data = await fs.readFile(FALLBACK_PATH, 'utf-8')
    const parsed = JSON.parse(data) as Record<string, BenchmarkScore>
    // Normalize entries missing model_id (bundled JSON uses key as id)
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry.model_id) entry.model_id = key
    }
    return parsed
  } catch {
    return {}
  }
}

export { loadCuratedBenchmarks }
