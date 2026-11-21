import type { BenchmarkScore } from './types.js'

export const BENCHMARK_NORMALIZATION_VERSION = 'livebench-primary-v1'

function isCalendarDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false
  }
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/**
 * Migrate historical records without combining incompatible source metrics.
 * LiveBench is the active primary source. Use its score when present, but only
 * mark a record primary-source when it also carries a valid upstream date.
 * Keep other historical scores for compatibility and mark them unverified.
 */
export function normalizeBenchmarkScores(
  scores: Record<string, BenchmarkScore>,
): Record<string, BenchmarkScore> {
  const normalized: Record<string, BenchmarkScore> = {}
  for (const key of Object.keys(scores).sort((a, b) => a.localeCompare(b))) {
    const entry = scores[key]
    const liveBenchScore = entry.sources?.livebench
    const hasLiveBenchScore =
      typeof liveBenchScore === 'number' &&
      Number.isFinite(liveBenchScore) &&
      liveBenchScore >= 0 &&
      liveBenchScore <= 100
    const hasDatedLiveBenchScore = hasLiveBenchScore &&
      isCalendarDate(entry.source_dates?.livebench)
    normalized[key] = {
      ...entry,
      score: hasLiveBenchScore ? liveBenchScore : entry.score,
      normalization_status: hasDatedLiveBenchScore
        ? 'primary-source'
        : 'legacy-unverified',
    }
  }

  return normalized
}

export function normalizeLiveBenchScores(
  scores: Map<string, number>,
  dataDate: string,
): Record<string, BenchmarkScore> {
  const normalized: Record<string, BenchmarkScore> = {}
  for (const [modelId, score] of scores) {
    if (
      !modelId ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      Object.hasOwn(normalized, modelId)
    ) {
      continue
    }
    normalized[modelId] = {
      model_id: modelId,
      score,
      tier: 'direct',
      sources: { livebench: score },
      source_dates: { livebench: dataDate },
      normalization_status: 'primary-source',
      last_updated: `${dataDate}T00:00:00.000Z`,
    }
  }
  return normalized
}
