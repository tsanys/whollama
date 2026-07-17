import { readCatalogCache, writeCatalogCache, readStaleCatalog } from './cache.js'
import { scrapeCatalog } from './scraper.js'
import { loadCuratedCatalog } from './fallback.js'
import type { OllamaModel, CatalogProgressCallback } from './types.js'

export interface CatalogOptions {
  offline?: boolean
  forceRefresh?: boolean
  onProgress?: CatalogProgressCallback
}

export interface CatalogResult {
  models: OllamaModel[]
  source: 'cache' | 'live' | 'curated'
}

export async function getCatalog(options: CatalogOptions = {}): Promise<CatalogResult> {
  const { offline = false, forceRefresh = false, onProgress } = options

  if (!forceRefresh) {
    const cached = await readCatalogCache()
    if (cached) {
      return { models: cached, source: 'cache' }
    }
  }

  if (!offline) {
    const scraped = await scrapeCatalog(onProgress)
    if (scraped.length > 0) {
      await writeCatalogCache(scraped)
      return { models: scraped, source: 'live' }
    }
  }

  const stale = await readStaleCatalog()
  if (stale) {
    return { models: stale, source: 'cache' }
  }

  const curated = await loadCuratedCatalog()
  return { models: curated, source: 'curated' }
}
