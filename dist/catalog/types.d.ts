export type ModelTag = 'tools' | 'vision' | 'code' | 'math' | 'embedding' | 'general';
export type CatalogSource = 'live' | 'cache' | 'curated';
export interface OllamaModel {
    name: string;
    family: string;
    params_b: number;
    quant: string;
    vram_required_gb: number;
    ram_required_gb: number;
    tags: ModelTag[];
    pulls: number;
    updated_at: string;
    source: CatalogSource;
}
//# sourceMappingURL=types.d.ts.map