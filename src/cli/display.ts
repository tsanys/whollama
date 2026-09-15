import Table from 'cli-table3'
import chalk from 'chalk'
import type { HardwareInfo } from '../hardware/types.js'
import type { ScoredModel } from '../scorer/types.js'

function termWidth(): number {
  const w = process.stdout.columns
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 80
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
    ? `GPU: ${gpu.name} — ${gpu.vram_gb} GB unified  BW: ${gpu.bandwidth_gbps} GB/s`
    : gpu.vendor === 'cpu-only'
      ? `CPU: ${cpu.model} (${cpu.cores} cores) — No GPU detected`
      : `GPU: ${gpu.name} — ${gpu.vram_gb} GB VRAM  BW: ${gpu.bandwidth_gbps} GB/s`

  const ramLine = `RAM: ${ram_gb} GB  •  Disk: ${disk_free_gb} GB free`

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

interface TableLayout {
  head: string[]
  colWidths: number[]
  showTags: boolean
  modelWidth: number
  tagsWidth: number
}

export function tableLayout(width = termWidth()): TableLayout {
  // Fixed columns: # (4) Params (8) Quant (8) Score (7) Speed (12) = 39 + ~8 border chars
  if (width < 80) {
    const modelWidth = Math.max(12, width - 39 - 8 - 2)
    return { head: ['#', 'Model', 'Params', 'Quant', 'Score', 'Speed'], colWidths: [4, modelWidth, 8, 8, 7, 12], showTags: false, modelWidth, tagsWidth: 0 }
  }
  if (width < 100) {
    const tagsWidth = 14
    const modelWidth = Math.max(14, width - 39 - tagsWidth - 8 - 2)
    return { head: ['#', 'Model', 'Params', 'Quant', 'Score', 'Speed', 'Tags'], colWidths: [4, modelWidth, 8, 8, 7, 12, tagsWidth], showTags: true, modelWidth, tagsWidth }
  }
  return { head: ['#', 'Model', 'Params', 'Quant', 'Score', 'Speed', 'Tags'], colWidths: [4, 30, 8, 8, 7, 12, 25], showTags: true, modelWidth: 30, tagsWidth: 25 }
}

export function renderTable(
  results: ScoredModel[],
  hardware: HardwareInfo,
  task?: string,
): void {
  console.log()
  console.log(renderHardwareBox(hardware))
  console.log()

  if (results.length === 0) {
    console.log(chalk.yellow('  No models match your hardware/filters.'))
    console.log(chalk.dim('  Try `whollama list --all` to see everything.'))
    console.log()
    return
  }

  console.log(chalk.bold(`  Recommended Models${task ? ` (task: ${task})` : ''}`))
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
      m.quant,
      m.composite_score.toFixed(1),
      `~${m.speed_tps} t/s`,
    ]
    if (layout.showTags) {
      row.push(ellipsize(m.tags.slice(0, 3).join(', '), layout.tagsWidth))
    }
    table.push(row)
  }

  console.log(table.toString())
  console.log()
  console.log(
    `  ${chalk.green('Top pick:')} ${results[0]?.name ?? 'N/A'}  •  ${chalk.dim(`Run: ${results[0]?.pull_command ?? ''}`)}`,
  )
  console.log()
}

export function renderJson(
  results: ScoredModel[],
  hardware: HardwareInfo,
): string {
  const output = {
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
    models: results.map((m) => ({
      rank: m.rank,
      name: m.name,
      params: m.params_b,
      quant: m.quant,
      score: m.composite_score,
      speed_tps: m.speed_tps,
      tags: m.tags,
      benchmark_tier: m.benchmark_tier,
      vram_fit: m.vram_fit,
      source: m.source,
      pull_command: m.pull_command,
    })),
  }

  return JSON.stringify(output, null, 2)
}

export function renderModelInfo(
  model: ScoredModel,
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
  lines.push()

  return lines.join('\n')
}
