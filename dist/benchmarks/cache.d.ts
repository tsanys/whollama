import type { BenchmarkScore } from './types.js';
export declare function readBenchmarkCache(): Promise<Record<string, BenchmarkScore> | null>;
export declare function writeBenchmarkCache(scores: Record<string, BenchmarkScore>): Promise<void>;
export declare function readStaleBenchmarks(): Promise<Record<string, BenchmarkScore> | null>;
//# sourceMappingURL=cache.d.ts.map