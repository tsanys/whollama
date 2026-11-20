import type { OllamaModel } from '../catalog/types.js'
import type { VramFit } from './vram.js'
import type { DiskFit } from './download.js'

export interface ScoreBreakdown {
  benchmark: number
  vram_fit: number
  speed: number
  recency: number
}

export interface ScoredModel extends OllamaModel {
  rank: number
  composite_score: number
  speed_tps: number
  vram_fit: VramFit
  estimated_download_gb: number | null
  disk_fit: DiskFit
  benchmark_score: number | null
  score_breakdown: ScoreBreakdown
  benchmark_tier: string
  pull_command: string
}
