import { describe, it, expect } from 'vitest'
import { tpsFromEval, calibrationRatio } from '../src/bench/runner.js'
import { scoreModel } from '../src/scorer/composite.js'
import { scoreModels } from '../src/scorer/index.js'
import type { HardwareInfo } from '../src/hardware/types.js'
import type { OllamaModel } from '../src/catalog/types.js'

const hw: HardwareInfo = {
  gpu: { name: 'M1 Pro', vendor: 'apple', vram_gb: 16, bandwidth_gbps: 200, unified: true },
  cpu: { model: 'Apple M1 Pro', cores: 8 },
  ram_gb: 16,
  disk_free_gb: 100,
  os: 'darwin',
}

function model(): OllamaModel {
  return {
    name: 'qwen3:8b',
    family: 'qwen3',
    params_b: 8,
    quant: 'Q4_K_M',
    vram_required_gb: 5.2,
    ram_required_gb: 6.2,
    tags: ['general'],
    pulls: 100,
    updated_at: new Date().toISOString(),
    source: 'curated',
  }
}

describe('tpsFromEval', () => {
  it('converts eval_count/ns to t/s', () => {
    expect(tpsFromEval(64, 2_000_000_000)).toBe(32)
  })
  it('returns 0 on degenerate input', () => {
    expect(tpsFromEval(0, 1e9)).toBe(0)
    expect(tpsFromEval(64, 0)).toBe(0)
    expect(tpsFromEval(NaN, 1e9)).toBe(0)
  })
})

describe('calibrationRatio', () => {
  it('divides measured by estimated', () => {
    expect(calibrationRatio(40, 20)).toBe(2)
  })
  it('clamps to [0.25, 4]', () => {
    expect(calibrationRatio(1000, 10)).toBe(4)
    expect(calibrationRatio(1, 100)).toBe(0.25)
  })
  it('returns 1 on degenerate input', () => {
    expect(calibrationRatio(0, 20)).toBe(1)
    expect(calibrationRatio(20, 0)).toBe(1)
    expect(calibrationRatio(NaN, 20)).toBe(1)
  })
})

describe('calibration in scoring', () => {
  it('scoreModel scales speed by ratio', () => {
    const base = scoreModel(model(), null, hw)
    const fast = scoreModel(model(), null, hw, 2)
    expect(fast.speed_tps).toBe(base.speed_tps * 2)
  })
  it('scoreModels passes ratio through', () => {
    const [a] = scoreModels([model()], {}, hw, { topN: 1, showAll: true })
    const [b] = scoreModels([model()], {}, hw, { topN: 1, showAll: true, speedCalibrationRatio: 0.5 })
    expect(b.speed_tps).toBe(Math.round(a.speed_tps * 0.5))
  })
  it('invalid ratio falls back to 1', () => {
    const base = scoreModel(model(), null, hw)
    expect(scoreModel(model(), null, hw, NaN).speed_tps).toBe(base.speed_tps)
    expect(scoreModel(model(), null, hw, -2).speed_tps).toBe(base.speed_tps)
  })
})
