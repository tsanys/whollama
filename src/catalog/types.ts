export type ModelTag = 'tools' | 'vision' | 'code' | 'math' | 'embedding' | 'general'

export type CatalogSource = 'live' | 'cache' | 'curated'

export interface CatalogCacheMetadata {
  freshness: 'fresh' | 'stale'
  ageMs: number
}

export type CatalogProgressCallback = (current: number, total: number, modelName: string) => void

export interface OllamaModel {
  name: string
  family: string
  params_b: number
  quant: string
  vram_required_gb: number
  ram_required_gb: number
  tags: ModelTag[]
  pulls: number
  updated_at: string
  source: CatalogSource
}
