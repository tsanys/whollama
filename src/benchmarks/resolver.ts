import type { BenchmarkScore } from './types.js'

const QUANT_PATTERN = /(?:Q[2-8](?:_K_[SML]|_[01])?|F16|F32)/gi
const SUFFIX_PATTERN = /\b(instruct|chat|it)\b/gi

/**
 * Normalize a model name for fuzzy matching.
 * Strip separators, suffixes, and quantization info.
 *
 * "Qwen/Qwen3-14B-Instruct" → "qwen3 14b"
 * "qwen3:14b"               → "qwen3 14b"
 * "llama3.1:70b-Q4_K_M"    → "llama3.1 70b"
 */
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(QUANT_PATTERN, '')
    .replace(SUFFIX_PATTERN, '')
    .replace(/[-_:/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Try to extract a family name from a model name.
 * "qwen3:14b" → "qwen3"
 * "llama3.2:3b" → "llama3.2"
 */
function extractFamily(name: string): string {
  const colonParts = name.split(':')
  const base = colonParts[0]
  // Strip size suffix like "14b" from the base
  return base.replace(/\s+\d+\.?\d*b$/i, '').trim()
}

/**
 * Extract parameter size in billions from a normalized name.
 * "qwen3 14b" → 14, "gemma3n e2b" → 2, "model 334m" → 0.334.
 * Null when no size token is present.
 */
export function extractSizeB(normalized: string): number | null {
  const m = normalized.match(/(\d+(?:\.\d+)?)\s*([bm])\b/i)
  if (!m) return null
  const v = parseFloat(m[1])
  if (!Number.isFinite(v) || v <= 0) return null
  return m[2].toLowerCase() === 'm' ? v / 1000 : v
}

/**
 * Resolve the best benchmark score for a given model name.
 *
 * Resolution order:
 * 1. direct — exact normalized match in scores map
 * 2. variant — same normalized base name with diff tag
 * 3. family — same family, nearest size wins (PRD: interpolated by size)
 * 4. curated — hardcoded fallback
 * 5. none — score = 0
 */
export function resolveScore(
  modelName: string,
  allScores: Map<string, number>,
  curatedScores?: Map<string, number>,
): BenchmarkScore {
  const normalized = normalize(modelName)

  // Tier 1: Direct match
  const directScore = allScores.get(normalized)
  if (directScore !== undefined) {
    return {
      model_id: modelName,
      score: directScore,
      tier: 'direct',
      sources: {},
      last_updated: new Date().toISOString(),
    }
  }

  // Try with colon variant
  const tagVariant = modelName.includes(':')
    ? normalize(modelName.replace(/:.+/, ''))
    : null
  if (tagVariant) {
    const tagScore = allScores.get(tagVariant)
    if (tagScore !== undefined) {
      return {
        model_id: modelName,
        score: tagScore,
        tier: 'variant',
        sources: {},
        last_updated: new Date().toISOString(),
      }
    }
  }

  // Tier 3: Family match — same family, nearest size wins. A 2B model must
  // not inherit a 27B flagship score (the old char-proximity pick did).
  // Name proximity only breaks ties, and decides alone when no sizes parse.
  const family = extractFamily(modelName)
  const modelSize = extractSizeB(normalized)
  const familyScores: Array<{ key: string; score: number; sizeDist: number; proximity: number }> = []

  for (const [key] of allScores) {
    if (key.startsWith(family)) {
      const matchedScore = allScores.get(key)
      if (matchedScore !== undefined) {
        // Proximity: prefer names that share more characters with modelName
        const sharedLen = [...normalized].filter((c, i) => c === key[i]).length
        const candSize = extractSizeB(key)
        const sizeDist =
          modelSize !== null && candSize !== null && candSize > 0
            ? Math.abs(Math.log(candSize / modelSize))
            : Number.POSITIVE_INFINITY
        familyScores.push({ key, score: matchedScore, sizeDist, proximity: sharedLen })
      }
    }
  }

  if (familyScores.length > 0) {
    // Nearest size first; proximity breaks ties (and rules when all
    // distances are +Infinity, preserving the old behavior exactly).
    familyScores.sort((a, b) => a.sizeDist - b.sizeDist || b.proximity - a.proximity)
    return {
      model_id: modelName,
      score: familyScores[0].score,
      tier: 'family',
      sources: {},
      last_updated: new Date().toISOString(),
    }
  }

  // Tier 4: Curated fallback (normalized lookup, not raw modelName)
  if (curatedScores) {
    const curatedDirect = curatedScores.get(normalized)
    if (curatedDirect !== undefined) {
      return {
        model_id: modelName,
        score: curatedDirect,
        tier: 'curated',
        sources: {},
        last_updated: new Date().toISOString(),
      }
    }
    if (tagVariant) {
      const curatedVariant = curatedScores.get(tagVariant)
      if (curatedVariant !== undefined) {
        return {
          model_id: modelName,
          score: curatedVariant,
          tier: 'curated',
          sources: {},
          last_updated: new Date().toISOString(),
        }
      }
    }
  }

  // Tier 5: No score
  return {
    model_id: modelName,
    score: 0,
    tier: 'none',
    sources: {},
    last_updated: new Date().toISOString(),
  }
}
