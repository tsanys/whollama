import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readBenchmarkCache, writeBenchmarkCache, readStaleBenchmarks } from './cache.js';
import { fetchLiveBench } from './livebench.js';
import { fetchArenaElo } from './arena.js';
import { fetchOpenLlm } from './openllm.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_PATH = path.resolve(__dirname, '../../data/benchmarks.json');
export async function getBenchmarkScores(options = {}) {
    const { offline = false, forceRefresh = false } = options;
    // Step 1: Check fresh cache
    if (!forceRefresh) {
        const cached = await readBenchmarkCache();
        if (cached) {
            return { scores: cached, source: 'cache' };
        }
    }
    // Step 2: Fetch live data (skip if offline)
    if (!offline) {
        const liveScores = await fetchLiveScores();
        if (liveScores) {
            await writeBenchmarkCache(liveScores);
            return { scores: liveScores, source: 'live' };
        }
    }
    // Step 3: Stale cache
    const stale = await readStaleBenchmarks();
    if (stale) {
        return { scores: stale, source: 'cache' };
    }
    // Step 4: Curated fallback
    const curated = await loadCuratedBenchmarks();
    return { scores: curated, source: 'curated' };
}
async function fetchLiveScores() {
    const results = await Promise.allSettled([
        fetchLiveBench(),
        fetchArenaElo(),
        fetchOpenLlm(),
    ]);
    const allScores = new Map();
    const sourceNames = ['livebench', 'arena_elo', 'open_llm'];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
            const sourceMap = result.value;
            for (const [model, score] of sourceMap) {
                if (!allScores.has(model)) {
                    allScores.set(model, new Map());
                }
                allScores.get(model).set(sourceNames[i], score);
            }
        }
    }
    if (allScores.size === 0)
        return null;
    // Merge: average scores across sources
    const merged = {};
    for (const [normalizedName, sources] of allScores) {
        const values = Array.from(sources.values());
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        // Use the highest tier among matched sources
        const sourceObj = {};
        for (const [source, score] of sources) {
            sourceObj[source] = score;
        }
        merged[normalizedName] = {
            model_id: normalizedName,
            score: Math.round(avg * 10) / 10,
            tier: 'direct',
            sources: sourceObj,
            last_updated: new Date().toISOString(),
        };
    }
    return merged;
}
async function loadCuratedBenchmarks() {
    try {
        const data = await fs.readFile(FALLBACK_PATH, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return {};
    }
}
//# sourceMappingURL=index.js.map