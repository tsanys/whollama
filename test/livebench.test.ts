import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  parseLiveBenchCategories,
  parseLiveBenchTable,
  parseReleaseDates,
} from '../src/benchmarks/livebench.js'

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')
}

describe('parseLiveBenchCategories', () => {
  it('reads suite columns and official overall weights', () => {
    expect(parseLiveBenchCategories({
      reasoning: ['logic', 'math'],
      coding: ['code'],
      _overall_weights: { reasoning: 2, coding: 1 },
    })).toEqual({
      suites: [
        ['reasoning', ['logic', 'math']],
        ['coding', ['code']],
      ],
      weights: { reasoning: 2, coding: 1 },
    })
  })

  it('rejects malformed suite definitions and follows source weight defaults', () => {
    expect(parseLiveBenchCategories(null)).toBeNull()
    expect(parseLiveBenchCategories({ reasoning: [] })).toBeNull()
    expect(parseLiveBenchCategories({
      reasoning: ['logic'],
      _overall_weights: { reasoning: -1 },
    })).toEqual({
      suites: [['reasoning', ['logic']]],
      weights: {},
    })
  })
})

describe('parseLiveBenchTable', () => {
  const categories = parseLiveBenchCategories({
    reasoning: ['logic', 'math'],
    coding: ['code'],
    _overall_weights: { reasoning: 2, coding: 1 },
  })!

  it('computes weighted suite means, skips missing cells, and normalizes names', () => {
    const csv = [
      'model,logic,math,code',
      '"Qwen3:8B",80,100,60',
      'Model-with-missing,80,-,100',
      'Llama3.1:8B,40,50,45',
    ].join('\n')

    const parsed = parseLiveBenchTable(csv, categories)
    expect(parsed.valid).toBe(true)
    expect(parsed.rowCount).toBe(3)
    expect(parsed.scores.get('qwen3 8b')).toBe(80)
    expect(parsed.scores.get('model with missing')).toBeCloseTo(86.67)
    expect(parsed.scores.get('llama3.1 8b')).toBe(45)
  })

  it('parses the current v2 release fixture using its published suite weights', () => {
    const releaseCategories = parseLiveBenchCategories(
      JSON.parse(fixture('livebench-v2-categories.json')),
    )!
    const parsed = parseLiveBenchTable(
      fixture('livebench-v2-table.csv'),
      releaseCategories,
    )
    expect(parsed.valid).toBe(true)
    expect(parsed.rowCount).toBe(2)
    expect(parsed.scores.get('fixture model a')).toBe(61.11)
    expect(parsed.scores.get('fixture model b')).toBe(72.78)
  })

  it('rejects malformed tables, duplicate normalized models, and invalid scores', () => {
    expect(parseLiveBenchTable('model,logic,math,code\n', categories).valid)
      .toBe(false)
    expect(parseLiveBenchTable('garbage', categories).valid).toBe(false)
    expect(parseLiveBenchTable(
      'model,logic,math,code\nmodel,101,80,60',
      categories,
    ).valid).toBe(false)
    expect(parseLiveBenchTable(
      'model,logic,math,code\nFoo:8B,80,80,80\nfoo-8b,70,70,70',
      categories,
    ).valid).toBe(false)
  })

  it('rejects tables that do not match the release category columns', () => {
    const result = parseLiveBenchTable(
      'model,logic,math,code,extra\nFoo,80,80,80,50',
      categories,
    )
    expect(result.valid).toBe(false)
    expect(result.scores.size).toBe(0)
  })
})

describe('parseReleaseDates', () => {
  it('extracts valid release IDs newest-first and deduplicates', () => {
    const js = 'const Yt=["20261014","20261106","20261014","20260230","20260101"]'
    expect(parseReleaseDates(js)).toEqual([
      '20261106',
      '20261014',
      '20260101',
    ])
  })

  it('uses the release list instead of unrelated date-like strings in the bundle', () => {
    expect(parseReleaseDates(
      'const Yt=["20261106"];const unrelated="20261231";',
    )).toEqual(['20261106'])
  })

  it('returns no dates when release IDs are absent', () => {
    expect(parseReleaseDates('const Yt=["2026-11-06"];')).toEqual([])
  })

  it('parses the current v2 bundle fixture', () => {
    expect(parseReleaseDates(fixture('livebench-v2-bundle.js'))).toEqual([
      '20261106',
      '20261025',
      '20261014',
    ])
  })
})
