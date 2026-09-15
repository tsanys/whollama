import { describe, it, expect } from 'vitest'
import { ellipsize, tableLayout, renderJson } from '../src/cli/display.js'
import type { HardwareInfo } from '../src/hardware/types.js'
import type { ScoredModel } from '../src/scorer/types.js'

const hw: HardwareInfo = {
  gpu: { name: 'Apple M1 Pro', vendor: 'apple', vram_gb: 16, bandwidth_gbps: 200, unified: true },
  cpu: { model: 'Apple M1 Pro', cores: 10 },
  ram_gb: 16,
  disk_free_gb: 342,
  os: 'darwin',
}

function scored(): ScoredModel {
  return {
    name: 'qwen3:14b',
    family: 'qwen3',
    params_b: 14.8,
    quant: 'Q4_K_M',
    vram_required_gb: 9.6,
    ram_required_gb: 11,
    tags: ['general', 'tools'],
    pulls: 2100000,
    updated_at: new Date().toISOString(),
    source: 'curated',
    rank: 1,
    composite_score: 77.1,
    speed_tps: 20,
    vram_fit: 'full',
    benchmark_tier: 'direct',
    pull_command: 'ollama pull qwen3:14b',
  }
}

describe('ellipsize', () => {
  it('passes short strings through', () => {
    expect(ellipsize('abc', 5)).toBe('abc')
  })
  it('truncates with ellipsis', () => {
    expect(ellipsize('abcdef', 5)).toBe('abcd…')
    expect(ellipsize('abcdef', 1)).toBe('a')
    expect(ellipsize('abcdef', 0)).toBe('')
  })
})

describe('tableLayout', () => {
  it('wide terminal keeps classic 7-column layout', () => {
    const l = tableLayout(120)
    expect(l.head).toHaveLength(7)
    expect(l.showTags).toBe(true)
    expect(l.colWidths).toEqual([4, 30, 8, 8, 7, 12, 25])
  })
  it('medium terminal shrinks model/tags columns', () => {
    const l = tableLayout(90)
    expect(l.head).toHaveLength(7)
    expect(l.modelWidth).toBeLessThan(30)
  })
  it('narrow terminal (<80) hides Tags column', () => {
    const l = tableLayout(70)
    expect(l.head).toHaveLength(6)
    expect(l.showTags).toBe(false)
    expect(l.head).not.toContain('Tags')
  })
})

describe('renderJson parity', () => {
  it('includes vendor, os, vram_fit, source (additive, old fields kept)', () => {
    const parsed = JSON.parse(renderJson([scored()], hw))
    expect(parsed.hardware.gpu.vendor).toBe('apple')
    expect(parsed.hardware.os).toBe('darwin')
    expect(parsed.models[0].vram_fit).toBe('full')
    expect(parsed.models[0].source).toBe('curated')
    // legacy fields intact
    expect(parsed.models[0].name).toBe('qwen3:14b')
    expect(parsed.models[0].pull_command).toBe('ollama pull qwen3:14b')
  })
})
