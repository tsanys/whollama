import { readJson, writeJson, getFileAge } from '../utils/storage.js';
const BENCHMARKS_FILE = 'benchmarks.json';
const BENCHMARKS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export async function readBenchmarkCache() {
    const age = await getFileAge(BENCHMARKS_FILE);
    if (age === null)
        return null;
    if (age > BENCHMARKS_TTL_MS)
        return null;
    const cached = await readJson(BENCHMARKS_FILE);
    if (!cached?.scores)
        return null;
    return cached.scores;
}
export async function writeBenchmarkCache(scores) {
    const cached = {
        timestamp: new Date().toISOString(),
        scores,
    };
    await writeJson(BENCHMARKS_FILE, cached);
}
export async function readStaleBenchmarks() {
    const cached = await readJson(BENCHMARKS_FILE);
    if (!cached?.scores)
        return null;
    return cached.scores;
}
//# sourceMappingURL=cache.js.map