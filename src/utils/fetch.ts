interface FetchOptions {
  timeout?: number
  retries?: number
}

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_RETRIES = 2

export async function safeFetch(
  url: string,
  options: FetchOptions = {},
): Promise<Response | null> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const retries = options.retries ?? DEFAULT_RETRIES

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'whollama/0.1.0',
        },
      })
      clearTimeout(timer)
      return response
    } catch {
      if (attempt === retries) {
        return null
      }
      // Wait before retry (exponential backoff)
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }

  return null
}
