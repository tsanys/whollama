import Table from 'cli-table3'
import chalk from 'chalk'
import type { HardwareInfo } from '../hardware/types.js'
import type { ScoredModel } from '../scorer/types.js'
import type { CacheMetadata } from '../utils/storage.js'

export interface DataSourceStatus {
  source: 'cache' | 'live' | 'curated'
  cache?: CacheMetadata
}

export interface RecommendationDataSources {
  catalog: DataSourceStatus
  benchmarks: DataSourceStatus
}

interface TableLayout {
  head: string[]
  colWidths: number[]
  showTags: boolean
  showQuant: boolean
  showSpeed: boolean
  modelWidth: number
  tagsWidth: number
}

interface ComparisonTableLayout {
  head: string[]
  colWidths: number[]
  modelWidth: number
  showParams: boolean
  showSpeed: boolean
}

function termWidth(): number {
  const w = process.stdout.columns
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 80
}

function formatCacheAge(ageMs: number): string {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000)
  if (minutes < 1) return 'under 1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function formatDataSource(name: string, data: DataSourceStatus): string {
  if (data.source !== 'cache' || !data.cache) {
    return `${name}: ${data.source}`
  }
  return `${name}: ${data.cache.freshness} cache (${formatCacheAge(data.cache.ageMs)} old)`
}

function formatDataSources(dataSources: RecommendationDataSources): string {
  return [
    formatDataSource('catalog', dataSources.catalog),
    formatDataSource('benchmarks', dataSources.benchmarks),
  ].join(' · ')
}

function serializeDataSource(data: DataSourceStatus): Record<string, unknown> {
  return {
    source: data.source,
    ...(data.cache
      ? {
          cache: {
            freshness: data.cache.freshness,
            age_ms: data.cache.ageMs,
          },
        }
      : {}),
  }
}

export function ellipsize(s: string, max: number): string {
  if (max <= 0) return ''
  if (s.length <= max) return s
  if (max === 1) return s.slice(0, 1)
  return `${s.slice(0, max - 1)}…`
}

function renderHardwareBox(hardware: HardwareInfo, width = termWidth()): string {
  const { gpu, cpu, ram_gb, disk_free_gb } = hardware
  const gpuLine = gpu.unified
    ? `GPU: ${gpu.name} | ${gpu.vram_gb} GB unified  BW: ${gpu.bandwidth_gbps} GB/s`
    : gpu.vendor === 'cpu-only'
      ? `CPU: ${cpu.model} (${cpu.cores} cores) | No GPU detected`
      : `GPU: ${gpu.name} | ${gpu.vram_gb} GB VRAM  BW: ${gpu.bandwidth_gbps} GB/s`

  const diskLabel = disk_free_gb === null ? 'unavailable' : `${disk_free_gb} GB free`
  const ramLine = `RAM: ${ram_gb} GB  •  Disk: ${diskLabel}`

  // Clamp to terminal width so long GPU names don't overflow narrow terminals
  const maxBox = Math.max(40, Math.min(width, 100))
  const natural = Math.max(gpuLine.length + 4, ramLine.length + 4, 60)
  const boxWidth = Math.min(natural, maxBox)
  const inner = boxWidth - 4
  const top = `╭${'─'.repeat(boxWidth - 2)}╮`
  const bottom = `╰${'─'.repeat(boxWidth - 2)}╯`
  const gpuPadded = `│ ${ellipsize(gpuLine, inner).padEnd(inner)} │`
  const ramPadded = `│ ${ellipsize(ramLine, inner).padEnd(inner)} │`

  return chalk.blue(`${top}\n${gpuPadded}\n${ramPadded}\n${bottom}`)
}

export function tableLayout(width = termWidth()): TableLayout {
  if (width < 90) {
    const modelWidth = Math.max(12, width - 52)
    return {
      head: ['#', 'Model', 'Params', 'Est. GB', 'Disk', 'Score'],
      colWidths: [4, modelWidth, 8, 9, 12, 7],
      showTags: false,
      showQuant: false,
      showSpeed: false,
      modelWidth,
      tagsWidth: 0,
    }
  }
  if (width < 120) {
    const modelWidth = Math.max(14, width - 62)
    return {
      head: ['#', 'Model', 'Params', 'Quant', 'Est. GB', 'Disk', 'Score'],
      colWidths: [4, modelWidth, 8, 8, 9, 12, 7],
      showTags: false,
      showQuant: true,
      showSpeed: false,
      modelWidth,
      tagsWidth: 0,
    }
  }
  const modelWidth = Math.max(16, Math.min(30, width - 96))
  const tagsWidth = 18
  return {
    head: ['#', 'Model', 'Params', 'Quant', 'Est. GB', 'Disk', 'Score', 'Speed', 'Tags'],
    colWidths: [4, modelWidth, 8, 8, 9, 12, 7, 12, tagsWidth],
    showTags: true,
    showQuant: true,
    showSpeed: true,
    modelWidth,
    tagsWidth,
  }
}

export function renderTable(
  results: ScoredModel[],
  hardware: HardwareInfo,
  task?: string,
  dataSources?: RecommendationDataSources,
  explain = false,
): void {
  renderResultsTable(
    results,
    hardware,
    `Recommended Models${task ? ` (task: ${task})` : ''}`,
    dataSources,
    explain,
    true,
  )
}

export function renderComparisonTable(
  results: ScoredModel[],
  hardware: HardwareInfo,
  dataSources?: RecommendationDataSources,
): void {
  console.log()
  console.log(renderHardwareBox(hardware))
  if (dataSources) {
    console.log(chalk.dim(`  Data: ${formatDataSources(dataSources)}`))
  }
  console.log()

  if (results.length === 0) {
    console.log(chalk.yellow('  No models to compare.'))
    console.log()
    return
  }

  console.log(chalk.bold('  Model Comparison (ranked by score)'))
  console.log()

  const layout = comparisonTableLayout()
  const table = new Table({
    head: layout.head,
    colWidths: layout.colWidths,
    style: { head: ['cyan'], border: ['gray'] },
  })

  for (const model of results) {
    const benchmark = model.benchmark_score === null
      ? 'n/a'
      : model.benchmark_score.toFixed(1)
    const row = [model.rank.toString(), ellipsize(model.name, layout.modelWidth)]
    if (layout.showParams) row.push(`${model.params_b.toFixed(1)}B`)
    row.push(
      benchmark,
      model.vram_fit,
      formatDownloadEstimate(model.estimated_download_gb),
      formatDiskFit(model.disk_fit),
      model.composite_score.toFixed(1),
    )
    if (layout.showSpeed) row.push(`~${model.speed_tps} t/s`)
    table.push(row)
  }

  console.log(table.toString())
  console.log()
}

export function comparisonTableLayout(width = termWidth()): ComparisonTableLayout {
  if (width < 90) {
    const modelWidth = Math.max(10, width - 64)
    return {
      head: ['#', 'Model', 'Bench', 'VRAM fit', 'Est. GB', 'Disk', 'Score'],
      colWidths: [4, modelWidth, 8, 10, 9, 12, 7],
      modelWidth,
      showParams: false,
      showSpeed: false,
    }
  }
  if (width < 110) {
    const modelWidth = Math.max(10, width - 74)
    return {
      head: ['#', 'Model', 'Params', 'Bench', 'VRAM fit', 'Est. GB', 'Disk', 'Score'],
      colWidths: [4, modelWidth, 8, 8, 10, 9, 12, 7],
      modelWidth,
      showParams: true,
      showSpeed: false,
    }
  }
  const modelWidth = Math.max(14, Math.min(30, width - 89))
  return {
    head: ['#', 'Model', 'Params', 'Bench', 'VRAM fit', 'Est. GB', 'Disk', 'Score', 'Speed'],
    colWidths: [4, modelWidth, 8, 8, 10, 9, 12, 7, 12],
    modelWidth,
    showParams: true,
    showSpeed: true,
  }
}

function renderResultsTable(
  results: ScoredModel[],
  hardware: HardwareInfo,
  heading: string,
  dataSources: RecommendationDataSources | undefined,
  explain: boolean,
  showTopPick: boolean,
): void {
  console.log()
  console.log(renderHardwareBox(hardware))
  if (dataSources) {
    console.log(chalk.dim(`  Data: ${formatDataSources(dataSources)}`))
  }
  console.log()

  if (results.length === 0) {
    console.log(chalk.yellow('  No models match your hardware/filters.'))
    console.log(chalk.dim('  Try `whollama list --all` to see everything.'))
    console.log()
    return
  }

  console.log(chalk.bold(`  ${heading}`))
  console.log()

  const layout = tableLayout()
  const table = new Table({
    head: layout.head,
    colWidths: layout.colWidths,
    style: { head: ['cyan'], border: ['gray'] },
  })

  for (const m of results) {
    const vramWarning = m.vram_fit !== 'full' ? ' ⚠' : ''
    const row: string[] = [
      m.rank.toString(),
      ellipsize(m.name + vramWarning, layout.modelWidth),
      `${m.params_b.toFixed(1)}B`,
    ]
    if (layout.showQuant) row.push(m.quant)
    row.push(formatDownloadEstimate(m.estimated_download_gb))
    row.push(formatDiskFit(m.disk_fit))
    row.push(m.composite_score.toFixed(1))
    if (layout.showSpeed) row.push(`~${m.speed_tps} t/s`)
    if (layout.showTags) {
      row.push(ellipsize(m.tags.slice(0, 3).join(', '), layout.tagsWidth))
    }
    table.push(row)
  }

  console.log(table.toString())
  console.log()
  if (explain) {
    for (const model of results) {
      console.log(`  ${formatScoreExplanation(model)}`)
    }
    console.log()
  }
  if (showTopPick) {
    console.log(
      `  ${chalk.green('Top pick:')} ${results[0]?.name ?? 'N/A'}  •  ${chalk.dim(`Run: ${results[0]?.pull_command ?? ''}`)}`,
    )
    console.log()
  }
}

function formatDownloadEstimate(estimatedDownloadGb: number | null): string {
  return estimatedDownloadGb === null ? 'n/a' : `~${estimatedDownloadGb.toFixed(1)} GB`
}

function formatDiskFit(diskFit: ScoredModel['disk_fit']): string {
  switch (diskFit) {
    case 'fits':
      return chalk.green('Fits')
    case 'tight':
      return chalk.yellow('Tight')
    case 'insufficient':
      return chalk.red('Not enough')
    default:
      return 'Unknown'
  }
}

export function formatScoreExplanation(model: ScoredModel): string {
  const breakdown = model.score_breakdown
  const benchmarkLabel = model.benchmark_tier === 'none'
    ? `no benchmark data (${breakdown.benchmark.toFixed(1)}/50)`
    : `${model.benchmark_tier} (${breakdown.benchmark.toFixed(1)}/50)`
  return [
    `#${model.rank} ${model.name}: score ${model.composite_score.toFixed(1)}`,
    `  Benchmark ${benchmarkLabel}; VRAM ${model.vram_fit} (${breakdown.vram_fit.toFixed(1)}/25)`,
    `  Speed ~${model.speed_tps} t/s (${breakdown.speed.toFixed(1)}/15); recency ${breakdown.recency.toFixed(1)}/10`,
  ].join('\n')
}

export function renderJson(
  results: ScoredModel[],
  hardware: HardwareInfo,
  dataSources?: RecommendationDataSources,
): string {
  return renderResultsJson(results, hardware, dataSources)
}

export function renderComparisonJson(
  results: ScoredModel[],
  hardware: HardwareInfo,
  dataSources?: RecommendationDataSources,
): string {
  return renderResultsJson(results, hardware, dataSources, 'compare')
}

function renderResultsJson(
  results: ScoredModel[],
  hardware: HardwareInfo,
  dataSources?: RecommendationDataSources,
  command?: 'compare',
): string {
  const output = {
    ...(command ? { command } : {}),
    hardware: {
      gpu: {
        name: hardware.gpu.name,
        vendor: hardware.gpu.vendor,
        vram_gb: hardware.gpu.vram_gb,
        bandwidth_gbps: hardware.gpu.bandwidth_gbps,
        unified: hardware.gpu.unified,
      },
      cpu: {
        model: hardware.cpu.model,
        cores: hardware.cpu.cores,
      },
      ram_gb: hardware.ram_gb,
      disk_free_gb: hardware.disk_free_gb,
      os: hardware.os,
    },
    ...(dataSources
      ? {
          data_sources: {
            catalog: serializeDataSource(dataSources.catalog),
            benchmarks: serializeDataSource(dataSources.benchmarks),
          },
        }
      : {}),
    models: results.map((m) => ({
      rank: m.rank,
      name: m.name,
      params: m.params_b,
      quant: m.quant,
      score: m.composite_score,
      speed_tps: m.speed_tps,
      tags: m.tags,
      benchmark_tier: m.benchmark_tier,
      benchmark_score: m.benchmark_score,
      vram_fit: m.vram_fit,
      estimated_download_gb: m.estimated_download_gb,
      disk_fit: m.disk_fit,
      score_breakdown: m.score_breakdown,
      source: m.source,
      pull_command: m.pull_command,
    })),
  }

  return JSON.stringify(output, null, 2)
}

export function renderModelInfo(
  model: ScoredModel,
  dataSources?: RecommendationDataSources,
): string {
  const lines: string[] = []

  lines.push(chalk.bold(`\n  ${model.name}`))
  lines.push(`  ${'─'.repeat(40)}`)
  lines.push(`  Family:         ${model.family}`)
  lines.push(`  Parameters:     ${model.params_b.toFixed(1)}B`)
  lines.push(`  Quantization:   ${model.quant}`)
  lines.push(`  VRAM required:  ${model.vram_required_gb.toFixed(1)} GB${model.vram_fit !== 'full' ? ' ⚠' : ''}`)
  lines.push(`  RAM required:   ${model.ram_required_gb.toFixed(1)} GB`)
  lines.push(`  Speed estimate: ~${model.speed_tps} t/s`)
  lines.push(`  Tags:           ${model.tags.join(', ')}`)
  lines.push(`  Benchmark tier: ${model.benchmark_tier}`)
  lines.push(`  Composite score: ${model.composite_score}`)
  lines.push(`  Pulls:          ${model.pulls.toLocaleString()}`)
  lines.push(`  Pull command:   ${model.pull_command}`)
  lines.push(`  Source:         ${model.source}`)
  if (dataSources) {
    lines.push(`  Data:           ${formatDataSources(dataSources)}`)
  }
  lines.push()

  return lines.join('\n')
}
