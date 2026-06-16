import { safeFetch } from '../utils/fetch.js';
import { normalizeModelName } from '../utils/constants.js';
/**
 * Fetch latest scores from LiveBench public data.
 * Try multiple known endpoints, return empty map if all fail.
 */
export async function fetchLiveBench() {
    const endpoints = [
        'https://livebench.ai/api/v1/results',
        'https://raw.githubusercontent.com/livebench/livebench/main/data/latest_results.json',
    ];
    for (const url of endpoints) {
        const result = await tryFetchEndpoint(url);
        if (result.size > 0)
            return result;
    }
    return new Map();
}
async function tryFetchEndpoint(url) {
    try {
        const response = await safeFetch(url, { timeout: 10000 });
        if (!response || !response.ok)
            return new Map();
        const data = await response.json();
        const scores = new Map();
        if (Array.isArray(data)) {
            for (const entry of data) {
                if (entry.model && typeof entry.average_score === 'number') {
                    const normalized = normalizeModelName(entry.model);
                    scores.set(normalized, normalizeScore(entry.average_score, 0, 100));
                }
            }
        }
        else if (typeof data === 'object') {
            // Flat format: { "model_name": score, ... }
            for (const [model, score] of Object.entries(data)) {
                if (typeof score === 'number') {
                    const normalized = normalizeModelName(model);
                    scores.set(normalized, normalizeScore(score, 0, 100));
                }
            }
        }
        return scores;
    }
    catch {
        return new Map();
    }
}
function normalizeScore(score, min, max) {
    if (max === min)
        return 50;
    return Math.round(((score - min) / (max - min)) * 100 * 10) / 10;
}
//# sourceMappingURL=livebench.js.map