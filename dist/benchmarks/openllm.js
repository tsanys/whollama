import { safeFetch } from '../utils/fetch.js';
import { normalizeModelName } from '../utils/constants.js';
/**
 * Fetch scores from Hugging Face Open LLM Leaderboard v2.
 * Try Hugging Face datasets API and raw data endpoints.
 */
export async function fetchOpenLlm() {
    const endpoints = [
        'https://huggingface.co/api/datasets/open-llm-leaderboard/results',
        'https://raw.githubusercontent.com/open-llm-leaderboard/results/main/results.json',
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
        const response = await safeFetch(url, { timeout: 15000 });
        if (!response || !response.ok)
            return new Map();
        const data = await response.json();
        const scores = new Map();
        if (Array.isArray(data)) {
            // Array format: [{ model: "...", average: 0.75, ... }]
            for (const entry of data) {
                if (typeof entry !== 'object' || entry === null)
                    continue;
                const e = entry;
                const name = (e.model ?? e.name);
                const avg = (e.average ?? e.average_score);
                if (name && typeof avg === 'number') {
                    scores.set(normalizeModelName(name), normalizeScore(avg, 0, 1));
                }
            }
        }
        else if (typeof data === 'object' && data !== null) {
            // Object format: { "model_name": { "average": 0.75, ... }, ... }
            const obj = data;
            for (const [modelKey, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    const v = value;
                    const avg = (v.average ?? v.average_score);
                    if (typeof avg === 'number') {
                        scores.set(normalizeModelName(modelKey), normalizeScore(avg, 0, 1));
                    }
                }
                else if (typeof value === 'number') {
                    scores.set(normalizeModelName(modelKey), normalizeScore(value, 0, 1));
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
    const range = max - min;
    if (range <= 0)
        return 50;
    return Math.round(((score - min) / range) * 100 * 10) / 10;
}
//# sourceMappingURL=openllm.js.map