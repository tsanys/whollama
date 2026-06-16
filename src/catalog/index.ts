import { readCatalogCache, writeCatalogCache, readStaleCatalog } from './cache.js'
import { scrapeCatalog } from './scraper.js'
import { loadCuratedCatalog } from './fallback.js'
import type { OllamaModel } from './types.js'

export interface CatalogOptions {
  offline?: boolean
  forceRefresh?: boolean
}

export interface CatalogResult {
  models: OllamaModel[]
  source: 'cache' | 'live' | 'curated'
}

export async function getCatalog(options: CatalogOptions = {}): Promise<CatalogResult> {
  const { offline = false, forceRefresh = false } = options

  // Step 1: Check fresh cache (unless force refresh)
  if (!forceRefresh) {
    const cached = await readCatalogCache()
    if (cached) {
      return { models: cached, source: 'cache' }
    }
  }

  // Step 2: Attempt live scrape (skip if offline)
  if (!offline) {
    const scraped = await scrapeCatalog()
    if (scraped.length > 0) {
      // Write to cache in the background
      await writeCatalogCache(scraped)
      return { models: scraped, source: 'live' }
    }
  }

  // Step 3: Fall back to stale cache
  const stale = await readStaleCatalog()
  if (stale) {
    return { models: stale, source: 'cache' }
  }

  // Step 4: Load curated fallback
  const curated = await loadCuratedCatalog()
  return { models: curated, source: 'curated' }
}
