import type { HardwareInfo } from '../hardware/types.js'
import type { OllamaModel } from '../catalog/types.js'
import type { BenchmarkScore } from '../benchmarks/types.js'
import { resolveScore, normalize } from '../benchmarks/resolver.js'
import { getVramFit } from './vram.js'
import { scoreModel } from './composite.js'
import type { ScoredModel } from './types.js'

export interface ScoreOptions {
  topN?: number
  task?: string
  showAll?: boolean
  /** Local bench calibration multiplier for speed estimates (default 1). */
  speedCalibrationRatio?: number
}

export function scoreModels(
  models: OllamaModel[],
  benchmarks: Record<string, BenchmarkScore>,
  hardware: HardwareInfo,
  options: ScoreOptions = {},
): ScoredModel[] {
  const { topN = 10, task, showAll = false, speedCalibrationRatio = 1 } = options

  // Build flat score maps for resolver lookup (model → score)
  // Normalize keys so both catalog names and benchmark keys match.
  // Keep curated entries separate so resolver can return tier 'curated'.
  const allScores = new Map<string, number>()
  const curatedScores = new Map<string, number>()
  for (const [key, bs] of Object.entries(benchmarks)) {
    const id = bs.model_id || key
    const norm = normalize(id)
    if (bs.tier === 'curated') {
      if (!curatedScores.has(norm)) curatedScores.set(norm, bs.score)
    } else {
      allScores.set(norm, bs.score)
    }
  }

  // Filter and score all candidates
  const scored: ScoredModel[] = []

  for (const model of models) {
    // VRAM filter: skip if doesn't fit and not showAll
    if (!showAll) {
      const fit = getVramFit(model, hardware)
      if (fit === 'cpu-only') continue
    }

    // Task filter: skip if task specified and model doesn't have the tag
    if (task && task !== 'general') {
      const tagMap: Record<string, string> = {
        coding: 'code',
        vision: 'vision',
        math: 'math',
        tools: 'tools',
        embedding: 'embedding',
      }
      const mappedTask = tagMap[task] ?? task
      if (!model.tags.includes(mappedTask as never)) continue
    }

    // Resolve benchmark score (live first, curated fallback preserves tier)
    const benchmark = resolveScore(model.name, allScores, curatedScores)

    // Score the model (with local bench calibration when available)
    const scoredModel = scoreModel(model, benchmark, hardware, speedCalibrationRatio)
    scored.push(scoredModel)
  }

  // Sort descending by composite score
  scored.sort((a, b) => b.composite_score - a.composite_score)

  // Assign ranks
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1
  }

  // Return top N
  return scored.slice(0, topN)
}
