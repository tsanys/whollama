import type { OllamaModel } from '../catalog/types.js'
import type { VramFit } from './vram.js'

export interface ScoredModel extends OllamaModel {
  rank: number
  composite_score: number
  speed_tps: number
  vram_fit: VramFit
  benchmark_tier: string
  pull_command: string
}
