import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, readdirSync, rmSync } from 'fs'
import { safeFetch } from '../src/utils/fetch.js'

// Isolate ALL storage IO in this file to a temp dir (never ~/.whollama).
const TMP = mkdtempSync(join(tmpdir(), 'whollama-utils-test-'))
process.env.WHOLLAMA_DIR = TMP
const storage = await import('../src/utils/storage.js')

function okJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('safeFetch', () => {
  it('returns ok responses and sends UA + default Accept', async () => {
    const fetchMock = vi.fn(async () => okJson({ a: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await safeFetch('https://example.com/x')
    expect(res).not.toBeNull()
    await expect(res?.json()).resolves.toEqual({ a: 1 })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(init.headers['User-Agent']).toBe('whollama')
    expect(init.headers['Accept']).toContain('text/html')
  })
  it('honors accept override', async () => {
    const fetchMock = vi.fn(async () => okJson({}))
    vi.stubGlobal('fetch', fetchMock)
    await safeFetch('https://example.com/x', { accept: 'application/json' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(init.headers['Accept']).toBe('application/json')
  })
  it('404 returns null without retry', async () => {
    const fetchMock = vi.fn(async () => okJson({}, 404))
    vi.stubGlobal('fetch', fetchMock)
    expect(await safeFetch('https://example.com/x')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('retries 500 then returns success', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(okJson({}, 500))
      .mockResolvedValueOnce(okJson({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await safeFetch('https://example.com/x', { retries: 1 })
    expect(res).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('honors Retry-After for 429 responses', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(okJson({}, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(okJson({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = safeFetch('https://example.com/x', { retries: 1 })
    await vi.advanceTimersByTimeAsync(1_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
  it('does not retry when Retry-After exceeds the bounded delay', async () => {
    const fetchMock = vi.fn(async () =>
      okJson({}, 429, { 'Retry-After': '120' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await safeFetch('https://example.com/x')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('aborts an in-flight request when its caller signal is aborted', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = safeFetch('https://example.com/x', {
      retries: 2,
      signal: controller.signal,
    })
    controller.abort()

    await expect(result).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('aborts during retry backoff without starting another request', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => okJson({}, 503))
    vi.stubGlobal('fetch', fetchMock)

    const result = safeFetch('https://example.com/x', {
      retries: 2,
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort()

    await expect(result).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
  it('gives up after retries on persistent throw', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('down')
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await safeFetch('https://example.com/x', { retries: 0 })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects a body that exceeds its byte limit while streaming', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('too large'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))

    await expect(
      safeFetch('https://example.com/x', {
        maxResponseBytes: 4,
        retries: 0,
      }),
    ).resolves.toBeNull()
  })
  it('rejects a response whose declared size exceeds its byte limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('small', { headers: { 'content-length': '100' } }),
      ),
    )

    await expect(
      safeFetch('https://example.com/x', {
        maxResponseBytes: 4,
        retries: 0,
      }),
    ).resolves.toBeNull()
  })
  it('aborts a hanging request after timeout', async () => {
    // A spec-compliant fetch rejects on abort — the mock must too,
    // otherwise await never settles and the timeout is unobservable.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const t0 = Date.now()
    expect(await safeFetch('https://example.com/x', { timeout: 30, retries: 0 })).toBeNull()
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})

describe('storage (isolated tmp dir)', () => {
  it('rejects path traversal without touching fs', async () => {
    for (const bad of ['../evil.json', 'a/b.json', 'a\\b.json', '..']) {
      expect(await storage.readJson(bad)).toBeNull()
      await storage.writeJson(bad, { x: 1 })
    }
    expect(readdirSync(TMP)).toEqual([])
  })
  it('roundtrips write → read', async () => {
    await storage.writeJson('rt.json', { a: [1, 2], b: 'x' })
    expect(await storage.readJson('rt.json')).toEqual({ a: [1, 2], b: 'x' })
  })
  it('readJson rejects invalid JSON and scalars', async () => {
    const { writeFileSync } = await import('fs')
    writeFileSync(join(TMP, 'bad.json'), 'not json{{{')
    writeFileSync(join(TMP, 'scalar.json'), '42')
    expect(await storage.readJson('bad.json')).toBeNull()
    expect(await storage.readJson('scalar.json')).toBeNull()
    expect(await storage.readJson('missing.json')).toBeNull()
  })
  it('readJson rejects files larger than the configured cap', async () => {
    const { writeFileSync } = await import('fs')
    writeFileSync(join(TMP, 'large.json'), '{"payload":"12345"}')

    expect(await storage.readJson('large.json', 8)).toBeNull()
  })
  it('writeJson swallows serialization failures', async () => {
    await expect(storage.writeJson('never.json', undefined)).resolves.toBeUndefined()
    expect(readdirSync(TMP).includes('never.json')).toBe(false)
  })
  it('getFileAge: null when missing, ~0 when just written', async () => {
    expect(await storage.getFileAge('nope.json')).toBeNull()
    expect(await storage.getFileAge('../outside.json')).toBeNull()
    await storage.writeJson('aged.json', { t: 1 })
    const age = await storage.getFileAge('aged.json')
    expect(typeof age).toBe('number')
    // fs mtime granularity can beat Date.now() by sub-ms → allow tiny negative
    expect(Math.abs(age as number)).toBeLessThan(5000)
  })
  it('getWhollamaDir follows WHOLLAMA_DIR', () => {
    expect(storage.getWhollamaDir()).toBe(TMP)
  })
})

beforeAll(() => {
  expect(process.env.WHOLLAMA_DIR).toBe(TMP)
})
