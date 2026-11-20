interface FetchOptions {
  timeout?: number
  retries?: number
  accept?: string
  signal?: AbortSignal
  maxResponseBytes?: number
}

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_RETRIES = 2
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const RETRY_BASE_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 30_000

function getRetryDelayMs(response: Response, attempt: number): number | null {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter !== null) {
    const seconds = Number(retryAfter)
    const requestedDelay = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - Date.now()

    if (Number.isFinite(requestedDelay) && requestedDelay >= 0) {
      // Do not retry early when the server asks for a delay beyond our cap.
      return requestedDelay <= MAX_RETRY_DELAY_MS
        ? Math.ceil(requestedDelay)
        : null
    }
  }

  const exponentialDelay = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt, 5),
    MAX_RETRY_DELAY_MS,
  )
  return Math.round(exponentialDelay * (0.5 + Math.random() * 0.5))
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  if (ms <= 0) return Promise.resolve(true)

  return new Promise((resolve) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      cleanup()
      resolve(false)
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve(true)
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }

  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(new ArrayBuffer(totalBytes))
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function safeFetch(
  url: string,
  options: FetchOptions = {},
): Promise<Response | null> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const retries = options.retries ?? DEFAULT_RETRIES
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  const accept = options.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'

  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new RangeError('maxResponseBytes must be a positive safe integer')
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) return null

    try {
      const timeoutSignal = AbortSignal.timeout(timeout)
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal

      const response = await fetch(url, {
        signal,
        headers: {
          'User-Agent': 'whollama',
          Accept: accept,
        },
      })

      // Treat HTTP errors as failure so callers fall through to cache/curated
      if (!response.ok) {
        // Retry 429/5xx, give up immediately on 4xx (except 429)
        const retryable = response.status === 429 || response.status >= 500
        if (retryable && attempt < retries) {
          const delay = getRetryDelayMs(response, attempt)
          await response.body?.cancel().catch(() => undefined)
          if (delay === null) return null
          if (!(await waitForRetry(delay, options.signal))) return null
          continue
        }
        await response.body?.cancel().catch(() => undefined)
        return null
      }

      const body = await readBoundedBody(response, maxResponseBytes)
      if (body === null) return null
      const headers = new Headers(response.headers)
      headers.delete('content-length')
      return new Response(body.byteLength > 0 ? body.buffer : null, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch {
      if (options.signal?.aborted || attempt === retries) return null
      const exponentialDelay = Math.min(
        RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt, 5),
        MAX_RETRY_DELAY_MS,
      )
      const delay = Math.round(exponentialDelay * (0.5 + Math.random() * 0.5))
      if (!(await waitForRetry(delay, options.signal))) return null
    }
  }

  return null
}
