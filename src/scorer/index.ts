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
}

export function scoreModels(
  models: OllamaModel[],
  benchmarks: Record<string, BenchmarkScore>,
  hardware: HardwareInfo,
  options: ScoreOptions = {},
): ScoredModel[] {
  const { topN = 10, task, showAll = false } = options

  // Build flat score map for resolver lookup (model → score)
  // Normalize keys so both catalog names and benchmark keys match
  const allScores = new Map<string, number>()
  for (const [key, bs] of Object.entries(benchmarks)) {
    const id = bs.model_id || key
    allScores.set(normalize(id), bs.score)
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

    // Resolve benchmark score
    const benchmark = resolveScore(model.name, allScores)

    // Score the model
    const scoredModel = scoreModel(model, benchmark, hardware)
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
