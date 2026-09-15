import { describe, it, expect } from 'vitest'
import { fuzzyScore, filterRanked } from '../src/cli/selector.js'

describe('fuzzyScore', () => {
  it('empty query matches everything with 0', () => {
    expect(fuzzyScore('', 'qwen3:14b')).toBe(0)
  })
  it('returns null on non-subsequence', () => {
    expect(fuzzyScore('xyz', 'qwen3:14b')).toBeNull()
    expect(fuzzyScore('qwen3:14b-extra-long', 'qwen3')).toBeNull()
  })
  it('is case-insensitive', () => {
    expect(fuzzyScore('QWEN', 'qwen3:14b')).not.toBeNull()
  })
  it('prefers prefix over scattered match', () => {
    const prefix = fuzzyScore('qwen', 'qwen3:14b') ?? -Infinity
    const scattered = fuzzyScore('qwen', 'llama-qwen-mix:7b') ?? Infinity
    expect(prefix).toBeGreaterThan(scattered)
  })
  it('prefers consecutive runs', () => {
    const run = fuzzyScore('14b', 'qwen3:14b') ?? -Infinity
    const gap = fuzzyScore('14b', '1-misc-4-big:9b') ?? Infinity
    expect(run).toBeGreaterThan(gap)
  })
})

describe('filterRanked', () => {
  const items = ['qwen3:14b', 'qwen3:8b', 'llama3.2:3b', 'gemma3:12b']
  it('empty query preserves order', () => {
    expect(filterRanked(items, '', (s) => s)).toEqual(items)
  })
  it('filters and ranks best match first', () => {
    const out = filterRanked(items, 'qwen3', (s) => s)
    expect(out).toEqual(['qwen3:14b', 'qwen3:8b'])
  })
  it('returns empty on no match', () => {
    expect(filterRanked(items, 'zzz', (s) => s)).toEqual([])
  })
})
