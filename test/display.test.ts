import { describe, it, expect, vi } from 'vitest'
import {
  ellipsize,
  tableLayout,
  renderJson,
  renderComparisonJson,
  renderComparisonTable,
  formatScoreExplanation,
  renderTable,
  comparisonTableLayout,
} from '../src/cli/display.js'
import type { RecommendationDataSources } from '../src/cli/display.js'
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
    benchmark_score: 60,
    estimated_download_gb: 8.33,
    disk_fit: 'fits',
    score_breakdown: { benchmark: 30, vram_fit: 25, speed: 3, recency: 9.1 },
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
  it('wide terminal keeps tags and shows size and disk columns', () => {
    const l = tableLayout(120)
    expect(l.head).toHaveLength(9)
    expect(l.showTags).toBe(true)
    expect(l.head).toContain('Est. GB')
    expect(l.head).toContain('Disk')
    expect(l.colWidths).toHaveLength(9)
  })
  it('medium terminal hides tags and speed before the size and disk columns', () => {
    const l = tableLayout(90)
    expect(l.head).toHaveLength(7)
    expect(l.showTags).toBe(false)
    expect(l.head).toContain('Est. GB')
    expect(l.head).toContain('Disk')
    expect(l.showSpeed).toBe(false)
  })
  it('narrow terminal prioritizes download size and disk status', () => {
    const l = tableLayout(70)
    expect(l.head).toHaveLength(6)
    expect(l.showTags).toBe(false)
    expect(l.showQuant).toBe(false)
    expect(l.head).toContain('Est. GB')
    expect(l.head).toContain('Disk')
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
    expect(parsed.models[0].benchmark_score).toBe(60)
    expect(parsed.models[0].updated_at).toEqual(expect.any(String))
    expect(parsed.models[0].estimated_download_gb).toBe(8.33)
    expect(parsed.models[0].disk_fit).toBe('fits')
    expect(parsed.models[0].score_breakdown).toEqual(scored().score_breakdown)
    // legacy fields intact
    expect(parsed.models[0].name).toBe('qwen3:14b')
    expect(parsed.models[0].pull_command).toBe('ollama pull qwen3:14b')
  })

  it('reports cache freshness and age as additive data-source metadata', () => {
    const refresh = {
      source: 'livebench' as const,
      state: 'failed' as const,
      url: 'https://livebench.ai/data/20261106/table.csv',
      latest_release_date: '2026-11-06',
      row_count: 0,
      model_count: 0,
      reason: 'timeout' as const,
    }
    const dataSources: RecommendationDataSources = {
      catalog: {
        source: 'cache',
        cache: { freshness: 'stale', ageMs: 172_800_000 },
      },
      benchmarks: {
        source: 'cache',
        cache: { freshness: 'stale', ageMs: 172_800_000 },
        refresh,
      },
    }

    const parsed = JSON.parse(renderJson([scored()], hw, dataSources))
    expect(parsed.data_sources.catalog).toEqual({
      source: 'cache',
      cache: { freshness: 'stale', age_ms: 172_800_000 },
    })
    expect(parsed.data_sources.benchmarks).toEqual({
      source: 'cache',
      cache: { freshness: 'stale', age_ms: 172_800_000 },
      last_refresh: {
        source: 'livebench',
        state: 'failed',
        url: 'https://livebench.ai/data/20261106/table.csv',
        row_count: 0,
        model_count: 0,
        latest_release_date: '2026-11-06',
        reason: 'timeout',
      },
    })
    expect(parsed.models[0].name).toBe('qwen3:14b')
  })

  it('shows benchmark refresh failure beside the cache fallback in terminal output', () => {
    const lines: string[] = []
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.join(' '))
    })
    try {
      const dataSources: RecommendationDataSources = {
        catalog: { source: 'cache' },
        benchmarks: {
          source: 'cache',
          cache: { freshness: 'stale', ageMs: 172_800_000 },
          refresh: {
            source: 'livebench',
            state: 'failed',
            url: 'https://livebench.ai/data/20261106/table.csv',
            row_count: 0,
            model_count: 0,
            reason: 'timeout',
          },
        },
      }
      renderTable([scored()], hw, undefined, dataSources)
      expect(lines.join('\n')).toContain('stale cache (2d old)')
      expect(lines.join('\n')).toContain('LiveBench refresh failed (timeout)')
    } finally {
      log.mockRestore()
    }
  })

  it('marks comparison output and explains the score factors', () => {
    const parsed = JSON.parse(renderComparisonJson([scored()], hw))
    expect(parsed.command).toBe('compare')
    expect(parsed.models[0].score_breakdown).toEqual(scored().score_breakdown)
    expect(formatScoreExplanation(scored())).toContain('Benchmark direct')
    expect(formatScoreExplanation(scored())).toContain('VRAM full')
    expect(
      formatScoreExplanation({
        ...scored(),
        updated_at: null,
        score_breakdown: { ...scored().score_breakdown, recency: 9 },
      }),
    ).toContain('recency unknown date, neutral (9.0/10)')
  })

  it('prints the estimated download size and disk status in the table', () => {
    const lines: string[] = []
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.join(' '))
    })
    try {
      renderTable([scored()], hw)
      expect(lines.join('\n')).toContain('~8.3 GB')
      expect(lines.join('\n')).toContain('Fits')
      lines.length = 0
      renderTable([{ ...scored(), disk_fit: 'insufficient' }], hw)
      expect(lines.join('\n')).toContain('Not enough')
    } finally {
      log.mockRestore()
    }
  })

  it('keeps benchmark and hardware fit visible in comparison layouts', () => {
    const narrow = comparisonTableLayout(80)
    expect(narrow.head).toContain('Bench')
    expect(narrow.head).toContain('VRAM fit')
    expect(narrow.head).toContain('Est. GB')
    expect(narrow.head).toContain('Disk')

    const lines: string[] = []
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.join(' '))
    })
    try {
      renderComparisonTable([
        scored(),
        { ...scored(), name: 'llama3.2:3b', rank: 2 },
      ], hw)
      expect(lines.join('\n')).toContain('Model Comparison')
      expect(lines.join('\n')).toContain('qwen3:14b')
      expect(lines.join('\n')).toContain('llama3.2:3b')
      expect(lines.join('\n')).toContain('60.0')
      expect(lines.join('\n')).toContain('full')
      expect(lines.join('\n')).toContain('~8.3 GB')
    } finally {
      log.mockRestore()
    }
  })
})
