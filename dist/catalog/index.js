import { readCatalogCache, writeCatalogCache, readStaleCatalog } from './cache.js';
import { scrapeCatalog } from './scraper.js';
import { loadCuratedCatalog } from './fallback.js';
export async function getCatalog(options = {}) {
    const { offline = false, forceRefresh = false, onProgress } = options;
    if (!forceRefresh) {
        const cached = await readCatalogCache();
        if (cached) {
            return { models: cached, source: 'cache' };
        }
    }
    if (!offline) {
        const scraped = await scrapeCatalog(onProgress);
        if (scraped.length > 0) {
            await writeCatalogCache(scraped);
            return { models: scraped, source: 'live' };
        }
    }
    const stale = await readStaleCatalog();
    if (stale) {
        return { models: stale, source: 'cache' };
    }
    const curated = await loadCuratedCatalog();
    return { models: curated, source: 'curated' };
}
//# sourceMappingURL=index.js.map