export type ScoreTier = 'direct' | 'variant' | 'family' | 'curated' | 'none'

export type BenchmarkSource = 'livebench' | 'arena_elo' | 'open_llm'

export interface BenchmarkScore {
  model_id: string
  score: number
  tier: ScoreTier
  sources: Partial<Record<BenchmarkSource, number>>
  source_dates?: Partial<Record<BenchmarkSource, string>>
  normalization_status?: 'primary-source' | 'legacy-unverified'
  last_updated: string
}

export type BenchmarkRefreshState = 'success' | 'failed' | 'skipped'

export type BenchmarkRefreshReason =
  | 'aborted'
  | 'bundle-fetch-failed'
  | 'bundle-not-found'
  | 'categories-fetch-failed'
  | 'invalid-categories'
  | 'invalid-table'
  | 'inadequate-coverage'
  | 'http-error'
  | 'index-fetch-failed'
  | 'network-error'
  | 'offline'
  | 'response-too-large'
  | 'release-dates-not-found'
  | 'table-fetch-failed'
  | 'timeout'

export interface BenchmarkRefreshStatus {
  source: 'livebench'
  state: BenchmarkRefreshState
  url: string
  latest_release_date?: string
  data_date?: string
  fetched_at?: string
  row_count: number
  model_count: number
  reason?: BenchmarkRefreshReason
  http_status?: number
  aggregation_method?: string
  suite_weights?: Record<string, number>
}

export interface BenchmarkSnapshotSource {
  url: string
  data_date?: string
  revision?: string
  terms_status: 'verified' | 'unverified'
}

export interface BenchmarkSnapshotMetadata {
  as_of: string
  as_of_basis: string
  revision?: string
  normalization_version: string
  weights: Partial<Record<BenchmarkSource, number>>
  sources: Partial<Record<BenchmarkSource, BenchmarkSnapshotSource>>
}
