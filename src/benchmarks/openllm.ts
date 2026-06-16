import { safeFetch } from '../utils/fetch.js'

/**
 * Fetch scores from Hugging Face Open LLM Leaderboard v2.
 * Try Hugging Face datasets API and raw data endpoints.
 */
export async function fetchOpenLlm(): Promise<Map<string, number>> {
  const endpoints = [
    'https://huggingface.co/api/datasets/open-llm-leaderboard/results',
    'https://raw.githubusercontent.com/open-llm-leaderboard/results/main/results.json',
  ]

  for (const url of endpoints) {
    const result = await tryFetchEndpoint(url)
    if (result.size > 0) return result
  }

  return new Map()
}

async function tryFetchEndpoint(url: string): Promise<Map<string, number>> {
  try {
    const response = await safeFetch(url, { timeout: 15000 })
    if (!response || !response.ok) return new Map()

    const data: unknown = await response.json()
    const scores = new Map<string, number>()

    if (Array.isArray(data)) {
      // Array format: [{ model: "...", average: 0.75, ... }]
      for (const entry of data) {
        if (typeof entry !== 'object' || entry === null) continue
        const e = entry as Record<string, unknown>
        const name = (e.model ?? e.name) as string | undefined
        const avg = (e.average ?? e.average_score) as number | undefined
        if (name && typeof avg === 'number') {
          scores.set(normalizeModelName(name), normalizeScore(avg, 0, 1))
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      // Object format: { "model_name": { "average": 0.75, ... }, ... }
      const obj = data as Record<string, unknown>
      for (const [modelKey, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          const v = value as Record<string, unknown>
          const avg = (v.average ?? v.average_score) as number | undefined
          if (typeof avg === 'number') {
            scores.set(normalizeModelName(modelKey), normalizeScore(avg, 0, 1))
          }
        } else if (typeof value === 'number') {
          scores.set(normalizeModelName(modelKey), normalizeScore(value, 0, 1))
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

function normalizeScore(score: number, min: number, max: number): number {
  const range = max - min
  if (range <= 0) return 50
  return Math.round(((score - min) / range) * 100 * 10) / 10
}
