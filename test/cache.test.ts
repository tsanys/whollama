import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
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
  fetchLiveBench: vi.fn(async () => new Map()),
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
  })
})
