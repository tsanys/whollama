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
const MODEL_TAGS = new Set(['tools', 'vision', 'code', 'math', 'embedding', 'general'])
const SAFE_MODEL_NAME = /^[A-Za-z0-9._:/-]{1,128}$/

function isValidModel(value: unknown): value is OllamaModel {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const model = value as Record<string, unknown>
  const source = model.source
  const updatedAt = model.updated_at
  const safeText = (text: unknown): text is string =>
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= 256 &&
    !/[\x00-\x1f\x7f-\x9f]/.test(text)

  return (
    typeof model.name === 'string' &&
    SAFE_MODEL_NAME.test(model.name) &&
    safeText(model.family) &&
    typeof model.params_b === 'number' &&
    Number.isFinite(model.params_b) &&
    model.params_b > 0 &&
    typeof model.quant === 'string' &&
    model.quant.length > 0 &&
    model.quant.length <= 32 &&
    !/[\x00-\x1f\x7f-\x9f]/.test(model.quant) &&
    typeof model.vram_required_gb === 'number' &&
    Number.isFinite(model.vram_required_gb) &&
    model.vram_required_gb >= 0 &&
    typeof model.ram_required_gb === 'number' &&
    Number.isFinite(model.ram_required_gb) &&
    model.ram_required_gb >= 0 &&
    Array.isArray(model.tags) &&
    model.tags.length > 0 &&
    model.tags.every((tag) => typeof tag === 'string' && MODEL_TAGS.has(tag)) &&
    typeof model.pulls === 'number' &&
    Number.isFinite(model.pulls) &&
    model.pulls >= 0 &&
    (updatedAt === null ||
      (typeof updatedAt === 'string' && Number.isFinite(Date.parse(updatedAt)))) &&
    (source === 'live' || source === 'cache' || source === 'curated')
  )
}

function isSaneCatalog(models: unknown): models is OllamaModel[] {
  if (!Array.isArray(models) || models.length < MIN_CACHED_MODELS) return false
  if (!models.every(isValidModel)) return false
  // Reject poisoned caches from old scraper fallback (all 7B :latest)
  const fallbackLike = models.filter(
    (m) => m.name?.endsWith(':latest') && m.params_b === 7 && m.quant === 'Q4_K_M',
  ).length
  if (fallbackLike / models.length > 0.9) return false
  return true
}

interface CachedCatalog {
  timestamp: string
  updated_at_source?: 'catalog' | 'scrape'
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
    models: cached.models.map((m) => ({
      ...m,
      updated_at: cached.updated_at_source === 'catalog' ? m.updated_at : null,
      source: 'cache' as const,
    })),
    cache: { freshness: 'fresh', ageMs: Math.max(0, age) },
  }
}

export async function writeCatalogCache(models: OllamaModel[]): Promise<void> {
  if (!isSaneCatalog(models)) return
  const cached: CachedCatalog = {
    timestamp: new Date().toISOString(),
    updated_at_source: 'scrape',
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
    models: cached.models.map((m) => ({
      ...m,
      updated_at: cached.updated_at_source === 'catalog' ? m.updated_at : null,
      source: 'cache' as const,
    })),
    cache: {
      freshness: age > CATALOG_TTL_MS ? 'stale' : 'fresh',
      ageMs: Math.max(0, age),
    },
  }
}
