import { resolveScore, normalize } from '../benchmarks/resolver.js';
import { getVramFit } from './vram.js';
import { scoreModel } from './composite.js';
export function scoreModels(models, benchmarks, hardware, options = {}) {
    const { topN = 10, task, showAll = false } = options;
    // Build flat score map for resolver lookup (model → score)
    // Normalize keys so both catalog names and benchmark keys match
    const allScores = new Map();
    for (const [key, bs] of Object.entries(benchmarks)) {
        const id = bs.model_id || key;
        allScores.set(normalize(id), bs.score);
    }
    // Filter and score all candidates
    const scored = [];
    for (const model of models) {
        // VRAM filter: skip if doesn't fit and not showAll
        if (!showAll) {
            const fit = getVramFit(model, hardware);
            if (fit === 'cpu-only')
                continue;
        }
        // Task filter: skip if task specified and model doesn't have the tag
        if (task && task !== 'general') {
            if (!model.tags.includes(task))
                continue;
        }
        // Resolve benchmark score
        const benchmark = resolveScore(model.name, allScores);
        // Score the model
        const scoredModel = scoreModel(model, benchmark, hardware);
        scored.push(scoredModel);
    }
    // Sort descending by composite score
    scored.sort((a, b) => b.composite_score - a.composite_score);
    // Assign ranks
    for (let i = 0; i < scored.length; i++) {
        scored[i].rank = i + 1;
    }
    // Return top N
    return scored.slice(0, topN);
}
//# sourceMappingURL=index.js.map