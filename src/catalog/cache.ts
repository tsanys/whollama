import {
  readJson,
  writeJson,
  getFileAge,
  type CacheMetadata,
} from '../utils/storage.js'
import type { OllamaModel } from './types.js'

const CATALOG_FILE = 'catalog.json'
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
export const MIN_CACHED_MODELS = 10

function isSaneCatalog(models: OllamaModel[]): boolean {
  if (!Array.isArray(models) || models.length < MIN_CACHED_MODELS) return false
  // Reject poisoned caches from old scraper fallback (all 7B :latest)
  const fallbackLike = models.filter(
    (m) => m.name?.endsWith(':latest') && m.params_b === 7 && m.quant === 'Q4_K_M',
  ).length
  if (fallbackLike / models.length > 0.9) return false
  return true
}

interface CachedCatalog {
  timestamp: string
  models: OllamaModel[]
}

export interface CatalogCacheRead {
  models: OllamaModel[]
  cache: CacheMetadata
}

export async function readCatalogCache(): Promise<CatalogCacheRead | null> {
  const age = await getFileAge(CATALOG_FILE)
  if (age === null) return null

  // If cache is too old, return null so scraper runs
  if (age > CATALOG_TTL_MS) return null

  const cached = await readJson<CachedCatalog>(CATALOG_FILE)
  if (!cached?.models) return null
  if (!isSaneCatalog(cached.models)) return null

  return {
    models: cached.models.map((m) => ({ ...m, source: 'cache' as const })),
    cache: { freshness: 'fresh', ageMs: Math.max(0, age) },
  }
}

export async function writeCatalogCache(models: OllamaModel[]): Promise<void> {
  if (!isSaneCatalog(models)) return
  const cached: CachedCatalog = {
    timestamp: new Date().toISOString(),
    models,
  }
  await writeJson(CATALOG_FILE, cached)
}

export async function readStaleCatalog(): Promise<CatalogCacheRead | null> {
  const age = await getFileAge(CATALOG_FILE)
  if (age === null) return null

  const cached = await readJson<CachedCatalog>(CATALOG_FILE)
  if (!cached?.models) return null
  if (!isSaneCatalog(cached.models)) return null
  return {
    models: cached.models.map((m) => ({ ...m, source: 'cache' as const })),
    cache: {
      freshness: age > CATALOG_TTL_MS ? 'stale' : 'fresh',
      ageMs: Math.max(0, age),
    },
  }
}
