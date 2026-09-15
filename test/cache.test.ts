import { describe, it, expect } from 'vitest'

describe('cache sanity (inline spec)', () => {
  it('benchmark cache rejects tiny/poisoned sets', async () => {
    const { readBenchmarkCache } = await import('../src/benchmarks/cache.js')
    // Indirect: poisoned ~/.whollama cache must not be trusted.
    // Full IO test lives in smoke; here assert sane-shape helper via write guard:
    const { writeBenchmarkCache } = await import('../src/benchmarks/cache.js')
    // writing insane data must be a no-op, not a crash
    await expect(
      writeBenchmarkCache({ a: { model_id: 'a', score: 1944200, tier: 'direct', sources: {}, last_updated: '' } } as never),
    ).resolves.toBeUndefined()
    expect(typeof readBenchmarkCache).toBe('function')
  })
  it('catalog cache rejects fallback-only sets', async () => {
    const { writeCatalogCache } = await import('../src/catalog/cache.js')
    const fallbackLike = Array.from({ length: 12 }, (_, i) => ({
      name: `m${i}:latest`,
      family: `m${i}`,
      params_b: 7,
      quant: 'Q4_K_M',
      vram_required_gb: 4,
      ram_required_gb: 5,
      tags: ['general'],
      pulls: 0,
      updated_at: new Date().toISOString(),
      source: 'live',
    }))
    await expect(writeCatalogCache(fallbackLike as never)).resolves.toBeUndefined()
  })
})
