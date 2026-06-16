import Table from 'cli-table3'
import chalk from 'chalk'
import type { HardwareInfo } from '../hardware/types.js'
import type { ScoredModel } from '../scorer/types.js'

function renderHardwareBox(hardware: HardwareInfo): string {
  const { gpu, cpu, ram_gb, disk_free_gb } = hardware
  const gpuLine = gpu.unified
    ? `GPU: ${gpu.name} — ${gpu.vram_gb} GB unified  BW: ${gpu.bandwidth_gbps} GB/s`
    : gpu.vendor === 'cpu-only'
      ? `CPU: ${cpu.model} (${cpu.cores} cores) — No GPU detected`
      : `GPU: ${gpu.name} — ${gpu.vram_gb} GB VRAM  BW: ${gpu.bandwidth_gbps} GB/s`

  const ramLine = `RAM: ${ram_gb} GB  •  Disk: ${disk_free_gb} GB free`

  const boxWidth = Math.max(gpuLine.length + 4, ramLine.length + 4, 60)
  const top = `╭${'─'.repeat(boxWidth - 2)}╮`
  const bottom = `╰${'─'.repeat(boxWidth - 2)}╯`
  const gpuPadded = `│  ${gpuLine.padEnd(boxWidth - 6)}  │`
  const ramPadded = `│  ${ramLine.padEnd(boxWidth - 6)}  │`

  return chalk.blue(`${top}\n${gpuPadded}\n${ramPadded}\n${bottom}`)
}

export function renderTable(
  results: ScoredModel[],
  hardware: HardwareInfo,
  task?: string,
): void {
  console.log()
  console.log(renderHardwareBox(hardware))
  console.log()
  console.log(chalk.bold(`  Recommended Models${task ? ` (task: ${task})` : ''}`))
  console.log()

  const table = new Table({
    head: ['#', 'Model', 'Params', 'Quant', 'Score', 'Speed', 'Tags'],
    colWidths: [4, 22, 8, 8, 7, 9, 20],
    style: { head: ['cyan'], border: ['gray'] },
  })

  for (const m of results) {
    const vramWarning = m.vram_fit !== 'full' ? ' ⚠' : ''
    table.push([
      m.rank.toString(),
      m.name + vramWarning,
      `${m.params_b.toFixed(1)}B`,
      m.quant,
      m.composite_score.toFixed(1),
      `~${m.speed_tps} t/s`,
      m.tags.slice(0, 3).join(', '),
    ])
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
