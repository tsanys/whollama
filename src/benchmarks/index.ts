import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  readBenchmarkCache,
  readStaleBenchmarks,
  writeBenchmarkCache,
  writeBenchmarkRefreshStatus,
} from './cache.js'
import { fetchLiveBench } from './livebench.js'
import { normalizeBenchmarkScores, normalizeLiveBenchScores } from './normalize.js'
import type {
  BenchmarkRefreshStatus,
  BenchmarkScore,
  BenchmarkSnapshotMetadata,
} from './types.js'
import type { CacheMetadata } from '../utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FALLBACK_PATH = path.resolve(__dirname, '../../data/benchmarks.json')

export interface BenchmarkOptions {
  offline?: boolean
  forceRefresh?: boolean
}

export interface BenchmarkResult {
  scores: Record<string, BenchmarkScore>
  source: 'cache' | 'live' | 'curated'
  cache?: CacheMetadata
  refresh?: BenchmarkRefreshStatus
  snapshot?: BenchmarkSnapshotMetadata
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
      return {
        scores: cached.scores,
        source: 'cache',
        cache: cached.cache,
        ...(cached.refresh ? { refresh: cached.refresh } : {}),
        ...(cached.snapshot ? { snapshot: cached.snapshot } : {}),
      }
    }
  }

  // Step 2: Fetch live data (skip if offline)
  let refresh: BenchmarkRefreshStatus | undefined
  if (!offline) {
    const { scores: liveBenchScores, ...livebench } = await fetchLiveBench()
    refresh = livebench
    if (
      livebench.state === 'success' &&
      livebench.model_count >= MIN_LIVE_SCORES
    ) {
      const liveScores = normalizeLiveBenchScores(
        liveBenchScores,
        livebench.data_date ?? livebench.latest_release_date ?? '',
      )
      // Merge curated fallback for models missing from live (keeps offline value prop)
      const curated = await loadCuratedBenchmarks()
      for (const [key, entry] of Object.entries(curated)) {
        if (!(key in liveScores)) {
          liveScores[key] = { ...entry, tier: 'curated' }
        }
      }
      const migratedScores = normalizeBenchmarkScores(liveScores)
      await writeBenchmarkCache(migratedScores, refresh)
      return { scores: migratedScores, source: 'live', refresh }
    }
    if (livebench.state === 'success') {
      refresh = {
        ...livebench,
        state: 'failed',
        reason: 'inadequate-coverage',
      }
    }
  } else {
    refresh = {
      source: 'livebench',
      state: 'skipped',
      url: 'https://livebench.ai/',
      row_count: 0,
      model_count: 0,
      reason: 'offline',
    }
  }

  if (refresh) await writeBenchmarkRefreshStatus(refresh)

  // Step 3: Stale cache
  const stale = await readStaleBenchmarks()
  if (stale) {
    return {
      scores: stale.scores,
      source: 'cache',
      cache: stale.cache,
      ...(refresh ? { refresh } : stale.refresh ? { refresh: stale.refresh } : {}),
      ...(stale.snapshot ? { snapshot: stale.snapshot } : {}),
    }
  }

  // Step 4: Curated fallback
  const curated = normalizeBenchmarkScores(await loadCuratedBenchmarks())
  return {
    scores: curated,
    source: 'curated',
    ...(refresh ? { refresh } : {}),
  }
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
