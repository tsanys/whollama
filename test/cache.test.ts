import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { BenchmarkScore } from '../src/benchmarks/types.js'
import type { OllamaModel } from '../src/catalog/types.js'

const TMP = mkdtempSync(join(tmpdir(), 'whollama-cache-test-'))
const originalWhollamaDir = process.env.WHOLLAMA_DIR
process.env.WHOLLAMA_DIR = TMP

vi.mock('../src/catalog/scraper.js', () => ({
  scrapeCatalog: vi.fn(async () => []),
}))
vi.mock('../src/benchmarks/livebench.js', () => ({
  fetchLiveBench: vi.fn(async () => ({
    source: 'livebench',
    state: 'failed',
    url: 'https://livebench.ai/',
    row_count: 0,
    model_count: 0,
    reason: 'network-error',
    scores: new Map(),
  })),
}))

const catalogFile = join(TMP, 'catalog.json')
const benchmarksFile = join(TMP, 'benchmarks.json')
const {
  readCatalogCache,
  readStaleCatalog,
  writeCatalogCache,
} = await import('../src/catalog/cache.js')
const {
  readBenchmarkCache,
  readStaleBenchmarks,
  writeBenchmarkCache,
} = await import('../src/benchmarks/cache.js')
const { getCatalog } = await import('../src/catalog/index.js')
const { getBenchmarkScores } = await import('../src/benchmarks/index.js')
const { fetchLiveBench } = await import('../src/benchmarks/livebench.js')

function catalogModels(): OllamaModel[] {
  return Array.from({ length: 12 }, (_, index) => ({
    name: `model-${index}:7b`,
    family: `model-${index}`,
    params_b: 7,
    quant: 'Q4_K_M',
    vram_required_gb: 4,
    ram_required_gb: 5,
    tags: ['general'],
    pulls: 100,
    updated_at: new Date().toISOString(),
    source: 'live',
  }))
}

function benchmarkScores(): Record<string, BenchmarkScore> {
  return Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `model-${index}`,
      {
        model_id: `model-${index}`,
        score: 50 + index,
        tier: 'direct',
        sources: { livebench: 50 + index },
        last_updated: new Date().toISOString(),
      },
    ]),
  )
}

function expire(file: string, ageMs: number): void {
  const oldDate = new Date(Date.now() - ageMs)
  try {
    const cached = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    if (typeof cached.timestamp === 'string') {
      cached.timestamp = oldDate.toISOString()
      writeFileSync(file, JSON.stringify(cached))
    }
  } catch {
    // The file may be intentionally malformed in tests that don't expire it.
  }
  utimesSync(file, oldDate, oldDate)
}

beforeEach(() => {
  rmSync(catalogFile, { force: true })
  rmSync(benchmarksFile, { force: true })
})

afterAll(() => {
  if (originalWhollamaDir === undefined) {
    delete process.env.WHOLLAMA_DIR
  } else {
    process.env.WHOLLAMA_DIR = originalWhollamaDir
  }
  rmSync(TMP, { recursive: true, force: true })
})

describe('catalog cache', () => {
  it('reads valid fresh data with its cache age', async () => {
    await writeCatalogCache(catalogModels())

    const cached = await readCatalogCache()
    expect(cached?.models).toHaveLength(12)
    expect(cached?.models[0].source).toBe('cache')
    expect(cached?.models[0].updated_at).toBeNull()
    expect(cached?.cache.freshness).toBe('fresh')
    expect(cached?.cache.ageMs).toBeGreaterThanOrEqual(0)
  })

  it('treats timestamps from pre-fix caches as unknown', async () => {
    writeFileSync(
      catalogFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        models: catalogModels(),
      }),
    )

    const cached = await readCatalogCache()
    expect(cached?.models.every((model) => model.updated_at === null)).toBe(true)
  })

  it('rejects malformed and fallback-only cached data', async () => {
    writeFileSync(catalogFile, '{bad json')
    expect(await readCatalogCache()).toBeNull()

    const fallbackOnly = catalogModels().map((model) => ({
      ...model,
      name: `${model.family}:latest`,
    }))
    writeFileSync(
      catalogFile,
      JSON.stringify({ timestamp: new Date().toISOString(), models: fallbackOnly }),
    )
    expect(await readCatalogCache()).toBeNull()
    expect(await readStaleCatalog()).toBeNull()

    const malformedModels = catalogModels().map((model) => ({
      ...model,
      name: 42,
    }))
    writeFileSync(
      catalogFile,
      JSON.stringify({ timestamp: new Date().toISOString(), models: malformedModels }),
    )
    expect(await readCatalogCache()).toBeNull()

    const terminalControls = catalogModels().map((model) => ({
      ...model,
      quant: 'Q4_K_M\x1B]0;title\x07',
    }))
    writeFileSync(
      catalogFile,
      JSON.stringify({ timestamp: new Date().toISOString(), models: terminalControls }),
    )
    expect(await readCatalogCache()).toBeNull()

    rmSync(catalogFile, { force: true })
    await writeCatalogCache(fallbackOnly)
    expect(await readCatalogCache()).toBeNull()
  })

  it('uses expired data as stale fallback when offline', async () => {
    await writeCatalogCache(catalogModels())
    expire(catalogFile, 2 * 24 * 60 * 60 * 1_000)

    expect(await readCatalogCache()).toBeNull()
    const stale = await readStaleCatalog()
    expect(stale?.cache.freshness).toBe('stale')
    expect(stale?.cache.ageMs).toBeGreaterThan(24 * 60 * 60 * 1_000)

    const result = await getCatalog({ offline: true })
    expect(result.source).toBe('cache')
    expect(result.cache?.freshness).toBe('stale')
    expect(result.models).toHaveLength(12)
  })
})

describe('benchmark cache', () => {
  it('reads valid fresh data with its cache age', async () => {
    await writeBenchmarkCache(benchmarkScores())

    const cached = await readBenchmarkCache()
    expect(Object.keys(cached?.scores ?? {})).toHaveLength(12)
    expect(cached?.cache.freshness).toBe('fresh')
    expect(cached?.cache.ageMs).toBeGreaterThanOrEqual(0)
  })

  it('migrates legacy multi-source records without averaging source metrics', async () => {
    const legacy = benchmarkScores()
    legacy['model-0'] = {
      ...legacy['model-0'],
      score: 60,
      sources: { livebench: 82, arena_elo: 1180 },
      source_dates: { livebench: '2026-11-06' },
    }
    writeFileSync(
      benchmarksFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        scores: legacy,
      }),
    )

    const cached = await readBenchmarkCache()
    expect(cached?.scores['model-0'].score).toBe(82)
    expect(cached?.scores['model-0'].normalization_status).toBe('primary-source')
    expect(cached?.scores['model-1'].normalization_status).toBe('legacy-unverified')
  })

  it('keeps non-primary legacy metrics marked as unverified', async () => {
    const legacy = benchmarkScores()
    legacy['model-0'] = {
      ...legacy['model-0'],
      sources: { arena_elo: 1180 },
    }
    writeFileSync(
      benchmarksFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        scores: legacy,
      }),
    )

    const cached = await readBenchmarkCache()
    expect(cached?.scores['model-0'].score).toBe(50)
    expect(cached?.scores['model-0'].normalization_status).toBe('legacy-unverified')
  })

  it('accepts LiveBench release scores and keeps their upstream date', async () => {
    const scores = new Map(
      Array.from({ length: 12 }, (_, index) => [
        `live model ${index}`,
        40 + index,
      ]),
    )
    vi.mocked(fetchLiveBench).mockResolvedValueOnce({
      source: 'livebench',
      state: 'success',
      url: 'https://livebench.ai/data/20261106/table.csv',
      latest_release_date: '2026-11-06',
      data_date: '2026-11-06',
      fetched_at: '2026-11-21T00:00:00.000Z',
      row_count: 12,
      model_count: 12,
      aggregation_method: 'livebench-weighted-suite-mean-v1',
      suite_weights: { Coding: 1.5 },
      scores,
    })

    const result = await getBenchmarkScores({ forceRefresh: true })
    expect(result.source).toBe('live')
    expect(result.refresh).toMatchObject({
      state: 'success',
      data_date: '2026-11-06',
      model_count: 12,
      aggregation_method: 'livebench-weighted-suite-mean-v1',
      suite_weights: { Coding: 1.5 },
    })
    expect(result.scores['live model 0']).toMatchObject({
      score: 40,
      sources: { livebench: 40 },
      source_dates: { livebench: '2026-11-06' },
      last_updated: '2026-11-06T00:00:00.000Z',
      normalization_status: 'primary-source',
    })
    const cached = await readBenchmarkCache()
    expect(cached?.refresh).not.toHaveProperty('scores')
    expect(cached?.refresh?.suite_weights).toEqual({ Coding: 1.5 })
  })

  it('rejects an apparently successful release with inadequate model coverage', async () => {
    vi.mocked(fetchLiveBench).mockResolvedValueOnce({
      source: 'livebench',
      state: 'success',
      url: 'https://livebench.ai/data/20261106/table.csv',
      latest_release_date: '2026-11-06',
      data_date: '2026-11-06',
      fetched_at: '2026-11-21T00:00:00.000Z',
      row_count: 2,
      model_count: 2,
      scores: new Map([
        ['live model 0', 40],
        ['live model 1', 60],
      ]),
    })

    const result = await getBenchmarkScores({ forceRefresh: true })
    expect(result.source).toBe('curated')
    expect(result.refresh).toMatchObject({
      state: 'failed',
      reason: 'inadequate-coverage',
      model_count: 2,
    })
  })

  it('rejects malformed and poisoned cached data', async () => {
    writeFileSync(benchmarksFile, '{bad json')
    expect(await readBenchmarkCache()).toBeNull()

    const poisonedScores = benchmarkScores()
    poisonedScores['model-0'] = {
      ...poisonedScores['model-0'],
      score: 1944200,
    }
    writeFileSync(
      benchmarksFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        scores: poisonedScores,
      }),
    )
    expect(await readBenchmarkCache()).toBeNull()
    expect(await readStaleBenchmarks()).toBeNull()

    const malformedScores = benchmarkScores()
    malformedScores['model-0'] = {
      ...malformedScores['model-0'],
      tier: 'unexpected' as BenchmarkScore['tier'],
    }
    writeFileSync(
      benchmarksFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        scores: malformedScores,
      }),
    )
    expect(await readBenchmarkCache()).toBeNull()

    rmSync(benchmarksFile, { force: true })
    await writeBenchmarkCache(poisonedScores)
    expect(await readBenchmarkCache()).toBeNull()
  })

  it('uses expired data as stale fallback when offline', async () => {
    await writeBenchmarkCache(benchmarkScores())
    expire(benchmarksFile, 8 * 24 * 60 * 60 * 1_000)

    expect(await readBenchmarkCache()).toBeNull()
    const stale = await readStaleBenchmarks()
    expect(stale?.cache.freshness).toBe('stale')
    expect(stale?.cache.ageMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1_000)

    const result = await getBenchmarkScores({ offline: true })
    expect(result.source).toBe('cache')
    expect(result.cache?.freshness).toBe('stale')
    expect(Object.keys(result.scores)).toHaveLength(12)
    expect(result.refresh).toMatchObject({
      state: 'skipped',
      reason: 'offline',
    })
  })

  it('reports the failed refresh while returning stale cache data', async () => {
    await writeBenchmarkCache(benchmarkScores())
    expire(benchmarksFile, 8 * 24 * 60 * 60 * 1_000)
    vi.mocked(fetchLiveBench).mockResolvedValueOnce({
      source: 'livebench',
      state: 'failed',
      url: 'https://livebench.ai/',
      row_count: 0,
      model_count: 0,
      reason: 'timeout',
      scores: new Map(),
    })

    const result = await getBenchmarkScores({ forceRefresh: true })
    expect(result.source).toBe('cache')
    expect(result.cache?.freshness).toBe('stale')
    expect(result.refresh).toMatchObject({
      state: 'failed',
      reason: 'timeout',
    })
    const persisted = await readStaleBenchmarks()
    expect(persisted?.cache.freshness).toBe('stale')
    expect(persisted?.cache.ageMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1_000)
    expect(persisted?.refresh?.reason).toBe('timeout')
  })
})
