import { readJson, writeJson, getFileAge } from '../utils/storage.js';
const CATALOG_FILE = 'catalog.json';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export async function readCatalogCache() {
    const age = await getFileAge(CATALOG_FILE);
    if (age === null)
        return null;
    // If cache is too old, return null so scraper runs
    if (age > CATALOG_TTL_MS)
        return null;
    const cached = await readJson(CATALOG_FILE);
    if (!cached?.models)
        return null;
    return cached.models.map((m) => ({ ...m, source: 'cache' }));
}
export async function writeCatalogCache(models) {
    const cached = {
        timestamp: new Date().toISOString(),
        models,
    };
    await writeJson(CATALOG_FILE, cached);
}
export async function readStaleCatalog() {
    const cached = await readJson(CATALOG_FILE);
    if (!cached?.models)
        return null;
    return cached.models.map((m) => ({ ...m, source: 'cache' }));
}
//# sourceMappingURL=cache.js.map