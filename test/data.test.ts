import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { estimateVramGb } from '../src/scorer/vram.js'
import { QUANT_BITS } from '../src/utils/constants.js'
import type { OllamaModel } from '../src/catalog/types.js'
import type { BenchmarkScore } from '../src/benchmarks/types.js'

const catalog = JSON.parse(
  readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf-8'),
) as OllamaModel[]
const benchmarks = JSON.parse(
  readFileSync(new URL('../data/benchmarks.json', import.meta.url), 'utf-8'),
) as Record<string, BenchmarkScore>

const KNOWN_TAGS = new Set(['tools', 'vision', 'code', 'math', 'embedding', 'general'])
const KNOWN_TIERS = new Set(['direct', 'variant', 'family', 'curated', 'none'])

describe('data/catalog.json', () => {
  it('has unique names and valid schema', () => {
    const names = catalog.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
    for (const m of catalog) {
      expect(typeof m.name).toBe('string')
      expect(typeof m.family).toBe('string')
      expect(m.params_b).toBeGreaterThan(0)
      expect(QUANT_BITS[m.quant]).toBeDefined()
      expect(m.tags.length).toBeGreaterThan(0)
      for (const t of m.tags) expect(KNOWN_TAGS.has(t)).toBe(true)
      expect(m.pulls).toBeGreaterThanOrEqual(0)
      expect(Number.isNaN(Date.parse(m.updated_at))).toBe(false)
    }
  })
  it('vram is consistent with the estimator formula used at runtime', () => {
    // Legacy entries (pre-2026) were hand-tuned and may drift ≤1.5% from the
    // formula — tolerance catches gross errors (wrong params/quant factor),
    // not last-digit rounding. New entries must match exactly.
    for (const m of catalog) {
      const expected = parseFloat(estimateVramGb(m.params_b, m.quant).toFixed(1));
      const drift = Math.abs(m.vram_required_gb - expected);
      if (new Date(m.updated_at).getFullYear() >= 2026) {
        expect(m.vram_required_gb).toBe(expected);
      } else {
        expect(drift).toBeLessThanOrEqual(Math.max(0.2, expected * 0.015));
      }
      expect(m.ram_required_gb).toBeGreaterThanOrEqual(m.vram_required_gb);
    }
  })
})

describe('data/benchmarks.json', () => {
  it('scores are sane 0-100 with known tiers and dates', () => {
    for (const b of Object.values(benchmarks)) {
      expect(Number.isFinite(b.score)).toBe(true)
      expect(b.score).toBeGreaterThanOrEqual(0)
      expect(b.score).toBeLessThanOrEqual(100)
      expect(KNOWN_TIERS.has(b.tier)).toBe(true)
      expect(typeof b.sources).toBe('object')
      expect(Number.isNaN(Date.parse(b.last_updated))).toBe(false)
    }
  })
  it('every catalog model has a benchmark entry', () => {
    const missing = catalog.map((m) => m.name).filter((n) => !benchmarks[n])
    expect(missing).toEqual([])
  })
})
