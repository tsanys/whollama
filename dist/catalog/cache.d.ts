import type { OllamaModel } from './types.js';
export declare function readCatalogCache(): Promise<OllamaModel[] | null>;
export declare function writeCatalogCache(models: OllamaModel[]): Promise<void>;
export declare function readStaleCatalog(): Promise<OllamaModel[] | null>;
//# sourceMappingURL=cache.d.ts.map