import type { BenchmarkScore } from './types.js';
export interface BenchmarkOptions {
    offline?: boolean;
    forceRefresh?: boolean;
}
export interface BenchmarkResult {
    scores: Record<string, BenchmarkScore>;
    source: 'cache' | 'live' | 'curated';
}
export declare function getBenchmarkScores(options?: BenchmarkOptions): Promise<BenchmarkResult>;
//# sourceMappingURL=index.d.ts.map