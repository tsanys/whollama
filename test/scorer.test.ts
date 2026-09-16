import { describe, it, expect } from 'vitest'
import { estimateVramGb, getVramFit } from '../src/scorer/vram.js'
import { estimateSpeed } from '../src/scorer/speed.js'
import { recencyMultiplier } from '../src/scorer/recency.js'
import { scoreModels } from '../src/scorer/index.js'
import type { HardwareInfo } from '../src/hardware/types.js'
import type { OllamaModel } from '../src/catalog/types.js'
import type { BenchmarkScore } from '../src/benchmarks/types.js'

const hw: HardwareInfo = {
  gpu: { name: 'M1 Pro', vendor: 'apple', vram_gb: 16, bandwidth_gbps: 200, unified: true },
  cpu: { model: 'Apple M1 Pro', cores: 8 },
  ram_gb: 16,
  disk_free_gb: 100,
  os: 'darwin',
}

function model(over: Partial<OllamaModel> = {}): OllamaModel {
  return {
    name: 'qwen3:14b',
    family: 'qwen3',
    params_b: 14,
    quant: 'Q4_K_M',
    vram_required_gb: 9.1,
    ram_required_gb: 11,
    tags: ['general'],
    pulls: 100,
    updated_at: new Date().toISOString(),
    source: 'curated',
    ...over,
  }
}

describe('estimateVramGb', () => {
  it('Q4_K_M 14B ≈ 9.1GB', () => {
    expect(estimateVramGb(14, 'Q4_K_M')).toBeCloseTo(9.06, 1)
  })
  it('Q8_0 uses 8.5 bits', () => {
    expect(estimateVramGb(8, 'Q8_0')).toBeCloseTo(9.77, 1)
  })
  it('unknown quant falls back to 4.5 bits', () => {
    expect(estimateVramGb(7, 'UNKNOWN')).toBeCloseTo(4.53, 1)
  })
})

describe('getVramFit', () => {
  it('apple unified uses 75% RAM', () => {
    expect(getVramFit(model({ vram_required_gb: 10 }), hw)).toBe('full') // 16*0.75=12
    expect(getVramFit(model({ vram_required_gb: 13, ram_required_gb: 15 }), hw)).toBe('partial')
    expect(getVramFit(model({ vram_required_gb: 20, ram_required_gb: 32 }), hw)).toBe('cpu-only')
  })
  it('cpu-only gpu always cpu-only', () => {
    const cpuHw = { ...hw, gpu: { ...hw.gpu, vendor: 'cpu-only' as const } }
    expect(getVramFit(model(), cpuHw)).toBe('cpu-only')
  })
})

describe('estimateSpeed', () => {
  it('smaller model is faster', () => {
    const fast = estimateSpeed(model({ params_b: 3 }), hw)
    const slow = estimateSpeed(model({ params_b: 70 }), hw)
    expect(fast).toBeGreaterThan(slow)
  })
  it('returns 0 for degenerate model', () => {
    expect(estimateSpeed(model({ params_b: 0 }), hw)).toBe(0)
  })
  it('treats expert-count names (16e) as MoE (active params only)', () => {
    const moe = estimateSpeed(model({ name: 'llama4:17b-scout-16e', family: 'llama4', params_b: 17 }), hw)
    const dense = estimateSpeed(model({ name: 'llama4:17b', family: 'llama4', params_b: 17 }), hw)
    expect(moe).toBeGreaterThan(dense)
  })
  it('does not mistake e-prefixed dense sizes (e2b) for MoE', () => {
    const a = estimateSpeed(model({ name: 'gemma3n:e2b', family: 'gemma3n', params_b: 5 }), hw)
    const b = estimateSpeed(model({ name: 'gemma3n:x2b', family: 'gemma3n', params_b: 5 }), hw)
    expect(a).toBe(b)
  })
})

describe('recencyMultiplier', () => {
  it('fresh → ~1.0, old → clamped 0.8', () => {
    // ≈1, not exactly 1: ms truncation between Date.now() calls is racy
    const fresh = recencyMultiplier(new Date().toISOString())
    expect(fresh).toBeLessThanOrEqual(1)
    expect(fresh).toBeGreaterThan(0.99)
    const old = new Date(Date.now() - 24 * 30 * 24 * 3600 * 1000).toISOString()
    expect(recencyMultiplier(old)).toBe(0.8)
  })
})

describe('scoreModels curated wiring', () => {
  it('curated-only model gets tier curated, not none', () => {
    const models = [model({ name: 'gemma3:1b', family: 'gemma3', params_b: 1 })]
    const benchmarks: Record<string, BenchmarkScore> = {
      'gemma3:1b': {
        model_id: 'gemma3:1b',
        score: 42.1,
        tier: 'curated',
        sources: {},
        last_updated: new Date().toISOString(),
      },
    }
    const [scored] = scoreModels(models, benchmarks, hw, { topN: 5 })
    expect(scored.benchmark_tier).toBe('curated')
    expect(scored.composite_score).toBeGreaterThan(0)
  })
  it('filters cpu-only unless showAll', () => {
    const big = model({ name: 'huge:405b', vram_required_gb: 500, ram_required_gb: 500 })
    expect(scoreModels([big], {}, hw)).toHaveLength(0)
    expect(scoreModels([big], {}, hw, { showAll: true })).toHaveLength(1)
  })
})
