import { describe, it, expect } from 'vitest'
import { normalize, resolveScore, extractSizeB } from '../src/benchmarks/resolver.js'

describe('normalize', () => {
  it('qwen3:14b → qwen3 14b', () => {
    expect(normalize('qwen3:14b')).toBe('qwen3 14b')
  })
  it('strips quant + instruct suffix', () => {
    expect(normalize('llama3.1:70b-Q4_K_M')).toBe('llama3.1 70b')
    expect(normalize('Qwen/Qwen3-14B-Instruct')).toBe('qwen qwen3 14b')
  })
})

describe('resolveScore', () => {
  const live = new Map([['qwen3 14b', 82.1]])
  const curated = new Map([['gemma3 1b', 42.1]])

  it('direct match → tier direct', () => {
    const r = resolveScore('qwen3:14b', live, curated)
    expect(r.tier).toBe('direct')
    expect(r.score).toBe(82.1)
  })
  it('curated fallback uses normalized key (not raw modelName)', () => {
    const r = resolveScore('gemma3:1b', new Map(), curated)
    expect(r.tier).toBe('curated')
    expect(r.score).toBe(42.1)
  })
  it('variant match → tier variant', () => {
    const m = new Map([['qwen3', 70]])
    const r = resolveScore('qwen3:14b', m)
    expect(r.tier).toBe('variant')
  })
  it('none when no match', () => {
    const r = resolveScore('unknown-xyz:99b', new Map(), new Map())
    expect(r.tier).toBe('none')
    expect(r.score).toBe(0)
  })
})

describe('extractSizeB', () => {
  it('parses B and M sizes', () => {
    expect(extractSizeB('qwen3 14b')).toBe(14)
    expect(extractSizeB('llama3.1 70b')).toBe(70)
    expect(extractSizeB('gemma3n e2b')).toBe(2)
    expect(extractSizeB('model 334m')).toBe(0.334)
  })
  it('returns null without a size token (never matches family version digits)', () => {
    expect(extractSizeB('qwen3')).toBeNull()
    expect(extractSizeB('llama3.1')).toBeNull()
    expect(extractSizeB('latest')).toBeNull()
  })
})

describe('resolveScore family tier (size-aware)', () => {
  it('picks nearest size, not most similar name', () => {
    const scores = new Map([
      ['gemma3 27b', 81],
      ['gemma3 4b', 57],
    ])
    const r = resolveScore('gemma3:9b', scores)
    expect(r.tier).toBe('family')
    expect(r.score).toBe(57)
  })
  it('small model does not inherit flagship score (reported gemma:2b case)', () => {
    const scores = new Map([
      ['gemma 3 27b it', 71.8],
      ['gemma 2b it', 45],
    ])
    const r = resolveScore('gemma:2b-instruct-q3_K_S', scores)
    expect(r.tier).toBe('family')
    expect(r.score).toBe(45)
  })
  it('falls back to name proximity when sizes are unparseable', () => {
    const scores = new Map([
      ['qwen3x custom edition', 60],
      ['qwen3x other', 70],
    ])
    const r = resolveScore('qwen3x:custom-build', scores)
    expect(r.tier).toBe('family')
    // 'qwen3x custom build' shares a longer prefix with 'qwen3x custom edition'
    expect(r.score).toBe(60)
  })
})
