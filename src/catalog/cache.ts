import { readJson, writeJson, getFileAge } from '../utils/storage.js'
import type { OllamaModel } from './types.js'

const CATALOG_FILE = 'catalog.json'
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedCatalog {
  timestamp: string
  models: OllamaModel[]
}

export async function readCatalogCache(): Promise<OllamaModel[] | null> {
  const age = await getFileAge(CATALOG_FILE)
  if (age === null) return null

  // If cache is too old, return null so scraper runs
  if (age > CATALOG_TTL_MS) return null

  const cached = await readJson<CachedCatalog>(CATALOG_FILE)
  if (!cached?.models) return null

  return cached.models.map((m) => ({ ...m, source: 'cache' as const }))
}

export async function writeCatalogCache(models: OllamaModel[]): Promise<void> {
  const cached: CachedCatalog = {
    timestamp: new Date().toISOString(),
    models,
  }
  await writeJson(CATALOG_FILE, cached)
}

export async function readStaleCatalog(): Promise<OllamaModel[] | null> {
  const cached = await readJson<CachedCatalog>(CATALOG_FILE)
  if (!cached?.models) return null
  return cached.models.map((m) => ({ ...m, source: 'cache' as const }))
}
