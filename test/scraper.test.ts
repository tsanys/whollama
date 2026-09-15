import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  parsePulls,
  parseTags,
  sanitizeScraped,
  extractPulls,
  modelFromVariants,
  parseCatalogListHtml,
  parseTagVariant,
  parseTagsPageHtml,
  parseTagsJson,
  dedupeModels,
  dedupeItems,
} from '../src/catalog/scraper.js'

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')
}

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

describe('parseTagVariant', () => {
  it('parses plain size tags (default quant Q4_K_M)', () => {
    expect(parseTagVariant('qwen3', '14b')).toEqual({ name: 'qwen3:14b', params_b: 14, quant: 'Q4_K_M' })
    expect(parseTagVariant('qwen3', '0.6b')).toMatchObject({ params_b: 0.6, quant: 'Q4_K_M' })
  })
  it('parses lowercase quant suffixes', () => {
    expect(parseTagVariant('qwen3', '0.6b-q4_K_M')).toMatchObject({ params_b: 0.6, quant: 'Q4_K_M' })
    expect(parseTagVariant('qwen3', '0.6b-fp16')).toMatchObject({ params_b: 0.6, quant: 'FP16' })
    expect(parseTagVariant('qwen3', '8b-q8_0')).toMatchObject({ params_b: 8, quant: 'Q8_0' })
  })
  it('parses MoE tags by total params', () => {
    expect(parseTagVariant('qwen3', '235b-a22b-q4_K_M')).toMatchObject({ params_b: 235, quant: 'Q4_K_M' })
  })
  it('parses million-param tags (270m → 0.27B)', () => {
    expect(parseTagVariant('gemma3', '270m')).toMatchObject({ params_b: 0.27 })
    expect(parseTagVariant('gemma3', '270m-it-q8_0')).toMatchObject({ params_b: 0.27, quant: 'Q8_0' })
  })
  it('falls back to Q4_K_M for unknown quants', () => {
    expect(parseTagVariant('gemma3', '270m-it-qat')).toMatchObject({ params_b: 0.27, quant: 'Q4_K_M' })
  })
  it('returns null for aliases without size', () => {
    expect(parseTagVariant('qwen3', 'latest')).toBeNull()
    expect(parseTagVariant('qwen3', 'instruct')).toBeNull()
    expect(parseTagVariant('qwen3', '')).toBeNull()
  })
})

describe('parseTagsPageHtml (real-markup fixtures)', () => {
  it('qwen3: 4 sized variants, latest skipped, decoys ignored, dupes deduped', () => {
    const variants = parseTagsPageHtml('qwen3', fixture('ollama-tags-qwen3.html'))
    const names = variants.map((v) => v.name)
    expect(names).toEqual([
      'qwen3:14b',
      'qwen3:0.6b-q4_K_M',
      'qwen3:0.6b-fp16',
      'qwen3:235b-a22b-q4_K_M',
    ])
    expect(variants[0]).toMatchObject({ params_b: 14, quant: 'Q4_K_M' })
    expect(variants[2]).toMatchObject({ params_b: 0.6, quant: 'FP16' })
  })
  it('gemma3: 270m family parsed, latest skipped', () => {
    const variants = parseTagsPageHtml('gemma3', fixture('ollama-tags-gemma3.html'))
    expect(variants).toHaveLength(4)
    expect(variants[0]).toMatchObject({ name: 'gemma3:270m', params_b: 0.27, quant: 'Q4_K_M' })
    expect(variants[3]).toMatchObject({ name: 'gemma3:270m-it-bf16', quant: 'BF16' })
  })
  it('model names match case-insensitively', () => {
    const variants = parseTagsPageHtml('Qwen3', fixture('ollama-tags-qwen3.html'))
    expect(variants).toHaveLength(4)
  })
})

describe('parseTagsJson (content-negotiated body)', () => {
  it('parses {"tags": [...]} like the live site serves', () => {
    const body = JSON.stringify({ tags: ['14b', '0.6b-q4_K_M', 'latest', '14b', 42, null] })
    const variants = parseTagsJson('qwen3', body)
    expect(variants).toEqual([
      { name: 'qwen3:14b', params_b: 14, quant: 'Q4_K_M' },
      { name: 'qwen3:0.6b-q4_K_M', params_b: 0.6, quant: 'Q4_K_M' },
    ])
  })
  it('returns null for non-JSON (caller falls back to HTML)', () => {
    expect(parseTagsJson('qwen3', '<html>nope</html>')).toBeNull()
    expect(parseTagsJson('qwen3', JSON.stringify({ models: [] }))).toBeNull()
  })
})
describe('extractPulls', () => {
  it('matches label split across sibling spans (site markup)', () => {
    expect(extractPulls(['119.5M', ' Pulls'])).toBe(119_500_000)
    expect(extractPulls(['1,234', 'pulls'])).toBe(1234)
  })
})

describe('dedupe', () => {
  it('dedupeModels keeps first, case-insensitive', () => {
    const a = { name: 'Qwen3:14b' }
    const b = { name: 'qwen3:14b' }
    const c = { name: 'llama3.2:3b' }
    expect(dedupeModels([a, b, c] as never[]).map((m) => m.name)).toEqual(['Qwen3:14b', 'llama3.2:3b'])
  })
  it('dedupeItems keeps first family', () => {
    const items = [{ name: 'qwen3' }, { name: 'QWEN3' }, { name: 'llama3.1' }]
    expect(dedupeItems(items as never[]).map((i) => i.name)).toEqual(['qwen3', 'llama3.1'])
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
  it('returns [] when no sized variants (no fake 7B entry)', () => {
    const item = { name: 'qwen3', description: '', pulls: 0, tags: ['general'] as never[] }
    expect(modelFromVariants(item as never, [])).toEqual([])
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
