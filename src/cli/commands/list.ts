import type { HardwareOverride } from '../../hardware/types.js'
import { detectHardware } from '../../hardware/index.js'
import { getCatalog } from '../../catalog/index.js'
import { getBenchmarkScores } from '../../benchmarks/index.js'
import { scoreModels } from '../../scorer/index.js'
import { renderTable, renderJson } from '../display.js'
import { startSpinner, stopSpinner } from '../spinner.js'
import { setVerbose } from '../../utils/logger.js'

export interface ListOptions {
  task?: string
  all?: boolean
  json?: boolean
  offline?: boolean
  verbose?: boolean
  gpu?: string
  ram?: number
  vram?: number
}

export async function listCommand(options: ListOptions): Promise<void> {
  if (options.verbose) setVerbose(true)

  const hardwareOverrides: HardwareOverride = {}
  if (options.gpu) hardwareOverrides.gpu = options.gpu
  if (options.ram) hardwareOverrides.ram = options.ram
  if (options.vram) hardwareOverrides.vram = options.vram

  startSpinner('Detecting hardware...')
  const hardware = await detectHardware(hardwareOverrides)
  stopSpinner('Hardware detected')

  startSpinner('Fetching model catalog...')
  const catalog = await getCatalog({ offline: options.offline })
  stopSpinner(`Found ${catalog.models.length} models`)

  startSpinner('Loading benchmarks...')
  const benchmarks = await getBenchmarkScores({ offline: options.offline })
  stopSpinner('Benchmarks loaded')

  const results = scoreModels(catalog.models, benchmarks.scores, hardware, {
    topN: 999,
    task: options.task,
    showAll: options.all,
  })

  if (options.json) {
    console.log(renderJson(results.slice(0, 100), hardware))
  } else {
    renderTable(results.slice(0, 50), hardware, options.task)
  }
}
