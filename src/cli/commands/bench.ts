import { detectHardware } from '../../hardware/index.js'
import type { HardwareOverride } from '../../hardware/types.js'
import { getCatalog } from '../../catalog/index.js'
import { estimateSpeed } from '../../scorer/speed.js'
import { startSpinner, stopSpinner, failSpinner } from '../spinner.js'
import { setVerbose } from '../../utils/logger.js'
import {
  listLocalModels,
  runBench,
  calibrationRatio,
  writeCalibration,
} from '../../bench/runner.js'
import { validateModelName } from './pull.js'

export interface BenchOptions {
  model?: string
  offline?: boolean
  verbose?: boolean
  json?: boolean
  gpu?: string
  ram?: number
  vram?: number
}

export async function benchCommand(options: BenchOptions): Promise<void> {
  if (options.verbose) setVerbose(true)

  startSpinner('Detecting hardware...')
  const overrides: HardwareOverride = {}
  if (options.gpu) overrides.gpu = options.gpu
  if (options.ram) overrides.ram = options.ram
  if (options.vram) overrides.vram = options.vram
  const hardware = await detectHardware(overrides)
  stopSpinner('Hardware detected')

  startSpinner('Checking local models...')
  const local = await listLocalModels()
  if (local.length === 0) {
    failSpinner('Ollama is not reachable')
    console.error('Is `ollama serve` running? See https://ollama.com')
    process.exit(1)
  }
  stopSpinner(`${local.length} local models found`)

  // Resolve target: explicit arg wins, else smallest catalog model already pulled
  let target: string | undefined
  if (options.model) {
    const wanted = validateModelName(options.model)
    target = wanted
    if (!local.some((n) => n === wanted || n.startsWith(`${wanted}:`) || wanted.startsWith(`${n.split(':')[0]}:`))) {
      console.error(`Model "${wanted}" is not pulled locally. Run: ollama pull ${wanted}`)
      process.exit(1)
    }
  } else {
    const catalog = await getCatalog({ offline: options.offline })
    const bySize = [...catalog.models].sort((a, b) => a.params_b - b.params_b)
    const localBases = new Set(local.map((n) => n.split(':')[0].toLowerCase()))
    const match = bySize.find((m) => localBases.has(m.family.toLowerCase()) || localBases.has(m.name.split(':')[0].toLowerCase()))
    if (!match) {
      console.error('No pulled model matches the catalog. Run: whollama bench <model>')
      process.exit(1)
    }
    // Prefer the exact local tag when it exists
    target = local.find((n) => n.split(':')[0].toLowerCase() === match.family.toLowerCase()) ?? match.name
  }

  const catalog = await getCatalog({ offline: options.offline })
  const entry = catalog.models.find(
    (m) => m.name.toLowerCase() === target!.toLowerCase()
      || m.name.split(':')[0].toLowerCase() === target!.split(':')[0].toLowerCase(),
  )

  startSpinner(`Benchmarking ${target}...`)
  let bench
  try {
    bench = await runBench(target)
  } catch (err) {
    failSpinner('Benchmark failed')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
  stopSpinner(`Measured ~${bench.measured_tps} t/s`)

  if (!entry) {
    console.log(`\n  ${target} is not in the catalog — measured only, calibration skipped.`)
    if (options.json) console.log(JSON.stringify({ ...bench, estimated_tps: null, ratio: null }, null, 2))
    return
  }

  const estimated = estimateSpeed(entry, hardware)
  const ratio = calibrationRatio(bench.measured_tps, estimated)
  await writeCalibration({
    vendor: hardware.gpu.vendor,
    ratio,
    measured_tps: bench.measured_tps,
    estimated_tps: estimated,
    model: target,
    at: new Date().toISOString(),
  })

  if (options.json) {
    console.log(JSON.stringify({ ...bench, estimated_tps: estimated, ratio }, null, 2))
    return
  }

  console.log(`\n  Bench: ${target}`)
  console.log(`  ${'─'.repeat(40)}`)
  console.log(`  Measured:   ~${bench.measured_tps} t/s (${bench.eval_count} tokens in ${bench.eval_duration_s}s)`)
  console.log(`  Estimated:  ~${estimated} t/s`)
  console.log(`  Ratio:      ${ratio}x ${ratio >= 1 ? '(hardware beats estimate)' : '(estimate was optimistic)'}`)
  console.log(`\n  Saved to ~/.whollama/config.json — future scores use this calibration.`)
  console.log()
}
