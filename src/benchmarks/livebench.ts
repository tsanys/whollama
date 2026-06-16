import { safeFetch } from '../utils/fetch.js'

interface LiveBenchResult {
  model: string
  average_score?: number
  [key: string]: unknown
}

/**
 * Fetch latest scores from LiveBench public data.
 * Try multiple known endpoints, return empty map if all fail.
 */
export async function fetchLiveBench(): Promise<Map<string, number>> {
  const endpoints = [
    'https://livebench.ai/api/v1/results',
    'https://raw.githubusercontent.com/livebench/livebench/main/data/latest_results.json',
  ]

  for (const url of endpoints) {
    const result = await tryFetchEndpoint(url)
    if (result.size > 0) return result
  }

  return new Map()
}

async function tryFetchEndpoint(url: string): Promise<Map<string, number>> {
  try {
    const response = await safeFetch(url, { timeout: 10000 })
    if (!response || !response.ok) return new Map()

    const data: LiveBenchResult[] | Record<string, number> =
      await response.json()

    const scores = new Map<string, number>()

    if (Array.isArray(data)) {
      for (const entry of data) {
        if (entry.model && typeof entry.average_score === 'number') {
          const normalized = normalizeModelName(entry.model)
          scores.set(normalized, normalizeScore(entry.average_score, 0, 100))
        }
      }
    } else if (typeof data === 'object') {
      // Flat format: { "model_name": score, ... }
      for (const [model, score] of Object.entries(data)) {
        if (typeof score === 'number') {
          const normalized = normalizeModelName(model)
          scores.set(normalized, normalizeScore(score, 0, 100))
        }
      }
    }

    return scores
  } catch {
    return new Map()
  }
}

function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\/:]/g, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeScore(
  score: number,
  min: number,
  max: number,
): number {
  if (max === min) return 50
  return Math.round(((score - min) / (max - min)) * 100 * 10) / 10
}
