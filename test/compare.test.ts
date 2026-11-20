import { describe, it, expect } from 'vitest'
import { resolveComparedModels } from '../src/cli/commands/compare.js'
import type { ScoredModel } from '../src/scorer/types.js'

function scored(name: string, score: number, rank = 1): ScoredModel {
  return {
    name,
    family: name.split(':')[0],
    params_b: 7,
    quant: 'Q4_K_M',
    vram_required_gb: 5,
    ram_required_gb: 6,
    tags: ['general'],
    pulls: 10,
    updated_at: new Date().toISOString(),
    source: 'curated',
    rank,
    composite_score: score,
    speed_tps: 20,
    vram_fit: 'full',
    estimated_download_gb: 3.94,
    disk_fit: 'fits',
    benchmark_score: 42.5,
    score_breakdown: { benchmark: 20, vram_fit: 25, speed: 3, recency: 9 },
    benchmark_tier: 'curated',
    pull_command: `ollama pull ${name}`,
  }
}

describe('resolveComparedModels', () => {
  const models = [scored('qwen3:14b', 70), scored('llama3.2:8b', 80)]

  it('matches normalized names and sorts by score with comparison ranks', () => {
    const result = resolveComparedModels(models, ['Qwen3 14B', 'llama3.2:8b'])
    expect(result.map((model) => model.name)).toEqual(['llama3.2:8b', 'qwen3:14b'])
    expect(result.map((model) => model.rank)).toEqual([1, 2])
  })

  it('requires two distinct models and reports unknown catalog names', () => {
    expect(() => resolveComparedModels(models, ['qwen3:14b'])).toThrow(/at least two/)
    expect(() => resolveComparedModels(models, ['qwen3:14b', 'Qwen3 14B'])).toThrow(/once/)
    expect(() => resolveComparedModels(models, ['qwen3:14b', 'missing:1b'])).toThrow(/not found/)
  })
})
