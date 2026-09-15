import { safeFetch } from '../utils/fetch.js'
import { normalizeModelName } from '../utils/constants.js'

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
        if (name && typeof avg === 'number' && Number.isFinite(avg)) {
          const norm = normalizeAverage(avg)
          if (norm !== null) scores.set(normalizeModelName(name), norm)
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      // Object format: { "model_name": { "average": 0.75, ... }, ... }
      // NOTE: never treat bare numbers as scores — HF API top-level
      // numeric fields are metadata (downloads, likes) not model scores.
      const obj = data as Record<string, unknown>
      for (const [modelKey, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          const v = value as Record<string, unknown>
          const avg = (v.average ?? v.average_score) as number | undefined
          if (typeof avg === 'number' && Number.isFinite(avg)) {
            const norm = normalizeAverage(avg)
            if (norm !== null) scores.set(normalizeModelName(modelKey), norm)
          }
        }
        // bare numbers ignored by design (see NOTE above)
      }
    }

    return scores
  } catch {
    return new Map()
  }
}

function normalizeAverage(avg: number): number | null {
  // 0..1 scale (expected) → 0..100; 1..100 scale → as-is; else metadata → reject
  if (avg >= 0 && avg <= 1) return normalizeScore(avg, 0, 1)
  if (avg > 1 && avg <= 100) return Math.round(avg * 10) / 10
  return null
}

function normalizeScore(score: number, min: number, max: number): number {
  const range = max - min
  if (range <= 0) return 50
  return Math.round(((score - min) / range) * 100 * 10) / 10
}
