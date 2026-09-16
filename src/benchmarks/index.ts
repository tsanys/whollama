import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { readBenchmarkCache, writeBenchmarkCache, readStaleBenchmarks } from './cache.js'
import { fetchLiveBench } from './livebench.js'
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
  // Single live source (LiveBench dated CSVs). Chatbot Arena and Open LLM
  // Leaderboard endpoints died in 2025-2026 (SPA shells, gated datasets)
  // and were removed; curated data covers the gap (see D1 notes).
  const livebench = await fetchLiveBench()
  if (livebench.size === 0) return null

  const merged: Record<string, BenchmarkScore> = {}
  for (const [normalizedName, score] of livebench) {
    merged[normalizedName] = {
      model_id: normalizedName,
      score,
      tier: 'direct',
      sources: { livebench: score },
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
