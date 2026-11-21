interface FetchOptions {
  timeout?: number
  retries?: number
  accept?: string
  signal?: AbortSignal
  maxResponseBytes?: number
}

export type SafeFetchFailureReason =
  | 'http-error'
  | 'network-error'
  | 'timeout'
  | 'response-too-large'
  | 'aborted'

export interface SafeFetchFailure {
  reason: SafeFetchFailureReason
  status?: number
}

export interface SafeFetchResult {
  response: Response | null
  failure?: SafeFetchFailure
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

export async function safeFetchDetailed(
  url: string,
  options: FetchOptions = {},
): Promise<SafeFetchResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const retries = options.retries ?? DEFAULT_RETRIES
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  const accept = options.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'

  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new RangeError('maxResponseBytes must be a positive safe integer')
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) {
      return { response: null, failure: { reason: 'aborted' } }
    }

    let timeoutSignal: AbortSignal | undefined
    try {
      timeoutSignal = AbortSignal.timeout(timeout)
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
          if (delay === null) {
            return {
              response: null,
              failure: { reason: 'http-error', status: response.status },
            }
          }
          if (!(await waitForRetry(delay, options.signal))) {
            return { response: null, failure: { reason: 'aborted' } }
          }
          continue
        }
        await response.body?.cancel().catch(() => undefined)
        return {
          response: null,
          failure: { reason: 'http-error', status: response.status },
        }
      }

      const body = await readBoundedBody(response, maxResponseBytes)
      if (body === null) {
        return {
          response: null,
          failure: {
            reason: 'response-too-large',
            status: response.status,
          },
        }
      }
      const headers = new Headers(response.headers)
      headers.delete('content-length')
      return {
        response: new Response(body.byteLength > 0 ? body.buffer : null, {
          status: response.status,
          statusText: response.statusText,
          headers,
        }),
      }
    } catch (error) {
      if (options.signal?.aborted) {
        return { response: null, failure: { reason: 'aborted' } }
      }
      if (attempt === retries) {
        const isTimeout =
          timeoutSignal?.aborted ||
          (error instanceof Error && error.name === 'TimeoutError')
        return {
          response: null,
          failure: { reason: isTimeout ? 'timeout' : 'network-error' },
        }
      }
      const exponentialDelay = Math.min(
        RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt, 5),
        MAX_RETRY_DELAY_MS,
      )
      const delay = Math.round(exponentialDelay * (0.5 + Math.random() * 0.5))
      if (!(await waitForRetry(delay, options.signal))) {
        return { response: null, failure: { reason: 'aborted' } }
      }
    }
  }

  return { response: null, failure: { reason: 'network-error' } }
}

export async function safeFetch(
  url: string,
  options: FetchOptions = {},
): Promise<Response | null> {
  const result = await safeFetchDetailed(url, options)
  return result.response
}
