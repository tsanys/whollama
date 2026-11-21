import { getCatalog } from '../../catalog/index.js'
import { getBenchmarkScores } from '../../benchmarks/index.js'
import { startSpinner, stopSpinner } from '../spinner.js'

export interface UpdateOptions {
  offline?: boolean
  verbose?: boolean
}

function formatCacheAge(ageMs: number): string {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000)
  if (minutes < 1) return 'under 1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  // Force refresh catalog
  startSpinner('Refreshing model catalog...')
  const catalog = await getCatalog({ forceRefresh: true, offline: options.offline })
  stopSpinner(`Catalog refreshed: ${catalog.models.length} models (${catalog.source})`)

  // Force refresh benchmarks
  startSpinner('Refreshing benchmark scores...')
  const benchmarks = await getBenchmarkScores({ forceRefresh: true, offline: options.offline })
  const benchmarkCount = Object.keys(benchmarks.scores).length
  const refreshSummary = benchmarks.refresh
    ? benchmarks.refresh.state === 'success'
      ? `LiveBench ${benchmarks.refresh.data_date ?? 'updated'}`
      : benchmarks.refresh.state === 'skipped'
        ? `LiveBench refresh skipped (${benchmarks.refresh.reason ?? 'offline'})`
        : `LiveBench refresh failed (${benchmarks.refresh.reason ?? 'unknown'}${benchmarks.refresh.http_status ? `, HTTP ${benchmarks.refresh.http_status}` : ''}${benchmarks.refresh.latest_release_date ? `, release ${benchmarks.refresh.latest_release_date}` : ''})`
    : 'LiveBench refresh status unavailable'
  const benchmarkSource = benchmarks.cache
    ? `${benchmarks.cache.freshness} cache (${formatCacheAge(benchmarks.cache.ageMs)} old)`
    : benchmarks.source
  const benchmarkOutcome = benchmarks.source === 'live'
    ? `Benchmarks updated: ${benchmarkCount} entries (${refreshSummary})`
    : `Using ${benchmarkSource} benchmark fallback: ${benchmarkCount} entries (${refreshSummary})`
  const refreshReport = benchmarks.source === 'live'
    ? refreshSummary
    : `${refreshSummary}; using ${benchmarkSource} fallback`
  stopSpinner(benchmarkOutcome)

  console.log(`\nUpdate complete.`)
  console.log(`  Models:     ${catalog.models.length}`)
  console.log(`  Benchmarks: ${benchmarkCount} (${benchmarkSource})`)
  console.log(`  Benchmark refresh: ${refreshReport}`)
  console.log()
}
