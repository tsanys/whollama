import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseTableCsv, parseBundleDates } from '../src/benchmarks/livebench.js'

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')
}

describe('parseTableCsv (livebench.ai table format)', () => {
  it('means task columns, skips blanks, normalizes names', () => {
    const scores = parseTableCsv(fixture('livebench-table.csv'))
    // (80+90+70+60)/4 = 75
    expect(scores.get('qwen3 32b')).toBe(75)
    // empty cell skipped: (70+80+50)/3 = 66.7
    expect(scores.get('gpt oss 120b')).toBe(66.7)
    expect(scores.get('llama3.1 8b')).toBe(45)
    // nameless row skipped
    expect(scores.size).toBe(3)
  })
  it('returns empty map for header-only/garbage', () => {
    expect(parseTableCsv('model,a,b\n')).toEqual(new Map())
    expect(parseTableCsv('')).toEqual(new Map())
  })
})

describe('parseBundleDates', () => {
  it('extracts newest-last date list, underscores, dedupes', () => {
    const js = 'const pe=["2025-05-30","2025-05-30","2026-06-25"];var x="2024-01-01";'
    expect(parseBundleDates(js)).toEqual(['2025_05_30', '2026_06_25'])
  })
  it('returns [] when absent', () => {
    expect(parseBundleDates('var a = 1;')).toEqual([])
  })
})
