import type { HardwareInfo } from '../hardware/types.js';
import type { OllamaModel } from '../catalog/types.js';
import type { BenchmarkScore } from '../benchmarks/types.js';
import type { ScoredModel } from './types.js';
export interface ScoreOptions {
    topN?: number;
    task?: string;
    showAll?: boolean;
}
export declare function scoreModels(models: OllamaModel[], benchmarks: Record<string, BenchmarkScore>, hardware: HardwareInfo, options?: ScoreOptions): ScoredModel[];
//# sourceMappingURL=index.d.ts.map