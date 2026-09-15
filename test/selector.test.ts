import { describe, it, expect } from 'vitest'
import { fuzzyScore, filterRanked, parseSelectionAnswer } from '../src/cli/selector.js'

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

describe('parseSelectionAnswer', () => {
  it('maps 1-based input to 0-based index', () => {
    expect(parseSelectionAnswer('1', 5)).toBe(0)
    expect(parseSelectionAnswer('3', 5)).toBe(2)
    expect(parseSelectionAnswer(' 2 ', 5)).toBe(1)
  })
  it('returns null for quit/out-of-range/garbage', () => {
    expect(parseSelectionAnswer('q', 5)).toBeNull()
    expect(parseSelectionAnswer('', 5)).toBeNull()
    expect(parseSelectionAnswer('0', 5)).toBeNull()
    expect(parseSelectionAnswer('6', 5)).toBeNull()
    expect(parseSelectionAnswer('-1', 5)).toBeNull()
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
