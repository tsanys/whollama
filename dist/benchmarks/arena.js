import { safeFetch } from '../utils/fetch.js';
import { normalizeModelName } from '../utils/constants.js';
/**
 * Fetch Chatbot Arena ELO scores from LMSYS public data.
 * Try multiple known endpoints.
 */
export async function fetchArenaElo() {
    const endpoints = [
        'https://lmarena.ai/data/leaderboard.json',
        'https://raw.githubusercontent.com/lm-sys/FastChat/main/fastchat/serve/monitor/elo_results_latest.json',
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
            const eloScores = [];
            for (const entry of data) {
                if (typeof entry !== 'object' || entry === null)
                    continue;
                const e = entry;
                const name = (e.model ?? e.model_name ?? e.name);
                const elo = (e.elo_score ?? e.elo ?? e.score);
                if (name && typeof elo === 'number' && elo > 0) {
                    eloScores.push({ name: normalizeModelName(name), score: elo });
                }
            }
            if (eloScores.length > 0) {
                const sorted = eloScores.sort((a, b) => a.score - b.score);
                const minElo = sorted[0].score;
                const maxElo = sorted[sorted.length - 1].score;
                for (const e of eloScores) {
                    scores.set(e.name, normalizeElo(e.score, minElo, maxElo));
                }
            }
        }
        else if (typeof data === 'object' && data !== null) {
            const obj = data;
            const entries = Object.entries(obj).filter((e) => typeof e[1] === 'number');
            if (entries.length > 0) {
                const sorted = entries.sort(([, a], [, b]) => a - b);
                const minElo = sorted[0][1];
                const maxElo = sorted[sorted.length - 1][1];
                for (const [model, elo] of entries) {
                    scores.set(normalizeModelName(model), normalizeElo(elo, minElo, maxElo));
                }
            }
        }
        return scores;
    }
    catch {
        return new Map();
    }
}
function normalizeElo(elo, minElo, maxElo) {
    const range = maxElo - minElo;
    if (range <= 0)
        return 50;
    return Math.round(((elo - minElo) / range) * 100 * 10) / 10;
}
//# sourceMappingURL=arena.js.map