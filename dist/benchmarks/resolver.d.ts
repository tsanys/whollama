import type { BenchmarkScore } from './types.js';
/**
 * Normalize a model name for fuzzy matching.
 * Strip separators, suffixes, and quantization info.
 *
 * "Qwen/Qwen3-14B-Instruct" → "qwen3 14b"
 * "qwen3:14b"               → "qwen3 14b"
 * "llama3.1:70b-Q4_K_M"    → "llama3.1 70b"
 */
export declare function normalize(name: string): string;
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
export declare function resolveScore(modelName: string, allScores: Map<string, number>, curatedScores?: Map<string, number>): BenchmarkScore;
//# sourceMappingURL=resolver.d.ts.map