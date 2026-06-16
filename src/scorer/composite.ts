import type { HardwareInfo } from '../hardware/types.js'
import type { OllamaModel } from '../catalog/types.js'
import type { BenchmarkScore } from '../benchmarks/types.js'
import { getVramFit } from './vram.js'
import type { VramFit } from './vram.js'
import { estimateSpeed } from './speed.js'
import { recencyMultiplier } from './recency.js'
import type { ScoredModel } from './types.js'

const TIER_DISCOUNT: Record<string, number> = {
  direct: 1.0,
  variant: 0.85,
  family: 0.7,
  curated: 0.5,
  none: 0.0,
}

const VRAM_FIT_BONUS: Record<VramFit, number> = {
  full: 1.0,
  partial: 0.6,
  'cpu-only': 0.3,
}

export function scoreModel(
  model: OllamaModel,
  benchmark: BenchmarkScore | null,
  hardware: HardwareInfo,
): ScoredModel {
  const vramFit = getVramFit(model, hardware)
  const recency = recencyMultiplier(model.updated_at)
  const speedEstimate = estimateSpeed(model, hardware)
  // Normalize speed relative to a reference (100 t/s max)
  const speedNorm = Math.min(speedEstimate / 100, 1.0)

  // Benchmark quality: score × tier confidence discount
  const rawBenchmarkScore = benchmark?.score ?? 0
  const tierDiscount = TIER_DISCOUNT[benchmark?.tier ?? 'none'] ?? 0
  const benchmarkQuality = (rawBenchmarkScore / 100) * tierDiscount

  // VRAM fit score
  const vramScore = VRAM_FIT_BONUS[vramFit]

  // Composite: benchmark_quality × 0.5 + vram_fit × 0.25 + speed × 0.15 + recency × 0.10
  const compositeScore =
    benchmarkQuality * 50 +
    vramScore * 25 +
    speedNorm * 15 +
    recency * 10

  return {
    ...model,
    rank: 0,
    composite_score: Math.round(compositeScore * 10) / 10,
    speed_tps: speedEstimate,
    vram_fit: vramFit,
    benchmark_tier: benchmark?.tier ?? 'none',
    pull_command: `ollama pull ${model.name}`,
  } as ScoredModel
}
