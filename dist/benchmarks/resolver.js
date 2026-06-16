const QUANT_PATTERN = /(?:Q[2-8]_K_[SML]|Q[2-8]_0|F16|F32)/gi;
const SUFFIX_PATTERN = /\b(instruct|chat|it)\b/gi;
/**
 * Normalize a model name for fuzzy matching.
 * Strip separators, suffixes, and quantization info.
 *
 * "Qwen/Qwen3-14B-Instruct" → "qwen3 14b"
 * "qwen3:14b"               → "qwen3 14b"
 * "llama3.1:70b-Q4_K_M"    → "llama3.1 70b"
 */
export function normalize(name) {
    return name
        .toLowerCase()
        .replace(QUANT_PATTERN, '')
        .replace(SUFFIX_PATTERN, '')
        .replace(/[-_:/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Try to extract a family name from a model name.
 * "qwen3:14b" → "qwen3"
 * "llama3.2:3b" → "llama3.2"
 */
function extractFamily(name) {
    const colonParts = name.split(':');
    const base = colonParts[0];
    // Strip size suffix like "14b" from the base
    return base.replace(/\s+\d+\.?\d*b$/i, '').trim();
}
/**
 * Resolve the best benchmark score for a given model name.
 *
 * Resolution order:
 * 1. direct — exact normalized match in scores map
 * 2. variant — same normalized base name with diff tag
 * 3. family — same family, interpolated by size proximity
 * 4. curated — hardcoded fallback
 * 5. none — score = 0
 */
export function resolveScore(modelName, allScores, curatedScores) {
    const normalized = normalize(modelName);
    // Tier 1: Direct match
    const directScore = allScores.get(normalized);
    if (directScore !== undefined) {
        return {
            model_id: modelName,
            score: directScore,
            tier: 'direct',
            sources: {},
            last_updated: new Date().toISOString(),
        };
    }
    // Try with colon variant
    const tagVariant = modelName.includes(':')
        ? normalize(modelName.replace(/:.+/, ''))
        : null;
    if (tagVariant) {
        const tagScore = allScores.get(tagVariant);
        if (tagScore !== undefined) {
            return {
                model_id: modelName,
                score: tagScore,
                tier: 'variant',
                sources: {},
                last_updated: new Date().toISOString(),
            };
        }
    }
    // Tier 3: Family match — find models in same family
    const family = extractFamily(modelName);
    const familyScores = [];
    for (const [key] of allScores) {
        if (key.startsWith(family)) {
            const matchedScore = allScores.get(key);
            if (matchedScore !== undefined) {
                // Proximity: prefer names that share more characters with modelName
                const sharedLen = [...normalized].filter((c, i) => c === key[i]).length;
                familyScores.push({ key, score: matchedScore, proximity: sharedLen });
            }
        }
    }
    if (familyScores.length > 0) {
        // Pick the closest family member
        familyScores.sort((a, b) => b.proximity - a.proximity);
        return {
            model_id: modelName,
            score: familyScores[0].score,
            tier: 'family',
            sources: {},
            last_updated: new Date().toISOString(),
        };
    }
    // Tier 4: Curated fallback
    if (curatedScores) {
        // Try direct match in curated
        const curatedMatch = curatedScores.get(modelName);
        if (curatedMatch !== undefined) {
            return {
                model_id: modelName,
                score: curatedMatch,
                tier: 'curated',
                sources: {},
                last_updated: new Date().toISOString(),
            };
        }
    }
    // Tier 5: No score
    return {
        model_id: modelName,
        score: 0,
        tier: 'none',
        sources: {},
        last_updated: new Date().toISOString(),
    };
}
//# sourceMappingURL=resolver.js.map