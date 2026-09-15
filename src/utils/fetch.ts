interface FetchOptions {
  timeout?: number
  retries?: number
  accept?: string
}

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_RETRIES = 2

export async function safeFetch(
  url: string,
  options: FetchOptions = {},
): Promise<Response | null> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const retries = options.retries ?? DEFAULT_RETRIES
  const accept = options.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'

  for (let attempt = 0; attempt <= retries; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'whollama',
          Accept: accept,
        },
      })
      clearTimeout(timer)
      // Treat HTTP errors as failure so callers fall through to cache/curated
      if (!response.ok) {
        // Retry 429/5xx, give up immediately on 4xx (except 429)
        const retryable = response.status === 429 || response.status >= 500
        if (retryable && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }
        return null
      }
      return response
    } catch {
      if (timer) clearTimeout(timer)
      if (attempt === retries) {
        return null
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }

  return null
}
