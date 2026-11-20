const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const UNKNOWN_RECENCY_MULTIPLIER = 0.9

export function recencyMultiplier(updatedAt: string | null): number {
  if (updatedAt === null) return UNKNOWN_RECENCY_MULTIPLIER

  const updated = Date.parse(updatedAt)
  if (!Number.isFinite(updated)) return UNKNOWN_RECENCY_MULTIPLIER

  const now = Date.now()
  const ageMs = now - updated

  if (ageMs <= 0) return 1.0

  const ageMonths = ageMs / MONTH_MS
  const multiplier = 1.0 - (ageMonths / 18) * 0.2

  // Clamp to [0.8, 1.0]
  return Math.max(0.8, Math.min(1.0, multiplier))
}
