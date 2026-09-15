import { describe, it, expect } from 'vitest'
import {
  parsePulls,
  parseTags,
  sanitizeScraped,
  modelFromVariants,
  parseCatalogListHtml,
  QUANT_TAG_PATTERN,
  SIZE_PATTERN,
} from '../src/catalog/scraper.js'

describe('parsePulls', () => {
  it('parses M suffix to millions', () => {
    expect(parsePulls('1.2M')).toBe(1_200_000)
    expect(parsePulls('1.2M Pulls')).toBe(1_200_000)
    expect(parsePulls('3.2M')).toBe(3_200_000)
  })
  it('parses K suffix to thousands', () => {
    expect(parsePulls('850K')).toBe(850_000)
    expect(parsePulls('12.5K pulls')).toBe(12_500)
  })
  it('parses plain numbers with commas', () => {
    expect(parsePulls('1,234')).toBe(1234)
    expect(parsePulls('3200000')).toBe(3_200_000)
  })
  it('returns 0 for non-numeric', () => {
    expect(parsePulls('no data')).toBe(0)
    expect(parsePulls('')).toBe(0)
  })
  it('ignores size labels like 7B (not pulls)', () => {
    // "7B" is a size, not a pulls count → must be 0 so extractPulls skips it
    expect(parsePulls('7B')).toBe(0)
    expect(parsePulls('14B')).toBe(0)
  })
})

describe('parseTags', () => {
  it('detects known tags, dedupes, defaults to general', () => {
    expect(parseTags(['Tools', 'Vision'])).toEqual(['tools', 'vision'])
    expect(parseTags(['Tools', 'tools'])).toEqual(['tools'])
    expect(parseTags(['random label'])).toEqual(['general'])
    expect(parseTags(['Embedding model'])).toEqual(['embedding'])
  })
})

describe('sanitizeScraped', () => {
  it('strips ANSI escapes and control chars', () => {
    expect(sanitizeScraped('\x1B[31mred\x1B[0m model')).toBe('red model')
    expect(sanitizeScraped('a\x00b\x1Fc')).toBe('abc')
  })
})

describe('quant/size patterns', () => {
  it('matches broad quant family', () => {
    for (const q of ['Q4_K_M', 'Q4_0', 'Q5_0', 'Q3_K_S', 'Q5_K_S', 'Q6_K', 'Q8_0', 'F16', 'F32']) {
      expect(`14b-instruct-${q.toLowerCase()}`.match(QUANT_TAG_PATTERN)).toBeTruthy()
    }
  })
  it('extracts size in B', () => {
    expect('14b-instruct-q4_K_M'.match(SIZE_PATTERN)?.[1]).toBe('14')
    expect('0.6b-q4_K_M'.match(SIZE_PATTERN)?.[1]).toBe('0.6')
  })
})

describe('modelFromVariants', () => {
  it('uses unified VRAM formula (not hardcoded 0.65)', () => {
    const item = {
      name: 'qwen3',
      description: '',
      pulls: 100,
      tags: ['general'] as const,
    }
    // Q8_0 = 8.5 bits → 8B * 8.5/8 * 1.15 ≈ 10.4GB, old 0.65 would give 5.2GB
    const [m] = modelFromVariants(item as never, [
      { name: 'qwen3:8b', params_b: 8, quant: 'Q8_0' },
    ])
    expect(m.vram_required_gb).toBeGreaterThan(9)
    expect(m.ram_required_gb).toBeGreaterThan(m.vram_required_gb)
    expect(m.name).toBe('qwen3:8b')
  })
  it('keeps tag name verbatim (no greedy strip)', () => {
    const item = { name: 'qwen3', description: '', pulls: 0, tags: ['general'] as never[] }
    const [m] = modelFromVariants(item as never, [
      { name: 'qwen3:14b-instruct-q4_K_M', params_b: 14, quant: 'Q4_K_M' },
    ])
    expect(m.name).toBe('qwen3:14b-instruct-q4_K_M')
  })
})

describe('parseCatalogListHtml', () => {
  it('prefers explicit pulls label over description numbers', () => {
    const html = `<ul>
      <li><a href="/library/qwen3">q</a><p>A 7B model for testing</p>
        <span>7B</span><span>1.2M Pulls</span><span>Tools</span></li>
      <li><a href="/library/llama3.2">l</a><p>desc</p>
        <span>3B</span><span>850K</span></li>
    </ul>`
    const items = parseCatalogListHtml(html)
    expect(items).toHaveLength(2)
    expect(items[0].pulls).toBe(1_200_000)
    expect(items[1].pulls).toBe(850_000)
    expect(items[0].tags).toContain('tools')
  })
  it('returns 0 pulls when only description numbers exist', () => {
    const html = `<ul><li><a href="/library/foo">f</a><p>7B model</p><span>7B</span></li></ul>`
    const items = parseCatalogListHtml(html)
    expect(items[0].pulls).toBe(0)
  })
  it('skips /tags links', () => {
    const html = `<ul><li><a href="/library/foo/tags">t</a></li></ul>`
    expect(parseCatalogListHtml(html)).toHaveLength(0)
  })
})
