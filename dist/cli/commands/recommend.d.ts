import type { ScoredModel } from '../../scorer/types.js';
export interface RecommendOptions {
    top?: number;
    task?: string;
    json?: boolean;
    offline?: boolean;
    verbose?: boolean;
    gpu?: string;
    ram?: number;
    vram?: number;
}
export declare function recommendCommand(options: RecommendOptions): Promise<ScoredModel[]>;
//# sourceMappingURL=recommend.d.ts.map