import type { OllamaModel } from './types.js';
export interface CatalogOptions {
    offline?: boolean;
    forceRefresh?: boolean;
}
export interface CatalogResult {
    models: OllamaModel[];
    source: 'cache' | 'live' | 'curated';
}
export declare function getCatalog(options?: CatalogOptions): Promise<CatalogResult>;
//# sourceMappingURL=index.d.ts.map