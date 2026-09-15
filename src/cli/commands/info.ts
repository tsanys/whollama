import { getCatalog } from '../../catalog/index.js'
import { getBenchmarkScores } from '../../benchmarks/index.js'
import { resolveScore, normalize } from '../../benchmarks/resolver.js'
import { detectHardware } from '../../hardware/index.js'
import { scoreModel } from '../../scorer/composite.js'
import type { HardwareOverride } from '../../hardware/types.js'
import { startSpinner, updateSpinner, stopSpinner } from '../spinner.js'
import { renderModelInfo } from '../display.js'
import { setVerbose } from '../../utils/logger.js'

export interface InfoOptions {
  modelName: string
  offline?: boolean
  verbose?: boolean
  gpu?: string
  ram?: number
  vram?: number
}

export function findModel(
  models: { name: string }[],
  searchName: string,
): number {
  const lower = searchName.toLowerCase()
  // Exact → prefix → substring (first match wins, deterministic)
  let idx = models.findIndex((m) => m.name.toLowerCase() === lower)
  if (idx >= 0) return idx
  idx = models.findIndex((m) => m.name.toLowerCase().startsWith(lower))
  if (idx >= 0) return idx
  return models.findIndex((m) => m.name.toLowerCase().includes(lower))
}

export async function infoCommand(options: InfoOptions): Promise<void> {
  if (options.verbose) setVerbose(true)

  startSpinner('Fetching model catalog...')
  const catalog = await getCatalog({
    offline: options.offline,
    onProgress: (current, total, name) => {
      updateSpinner(`Fetching model catalog... (${current}/${total}) ${name}`)
    },
  })
  stopSpinner('Catalog loaded')

  // Find model by name (exact → prefix → substring)
  const idx = findModel(catalog.models, options.modelName)
  const model = idx >= 0 ? catalog.models[idx] : undefined

  if (!model) {
    console.error(`Model "${options.modelName}" not found in catalog.`)
    console.error('Use `whollama list --all` to see all available models.')
    process.exit(1)
  }

  startSpinner('Detecting hardware...')
  const overrides: HardwareOverride = {}
  if (options.gpu) overrides.gpu = options.gpu
  if (options.ram) overrides.ram = options.ram
  if (options.vram) overrides.vram = options.vram
  const hardware = await detectHardware(overrides)
  stopSpinner('Hardware detected')

  startSpinner('Loading benchmark scores...')
  const benchmarks = await getBenchmarkScores({ offline: options.offline })
  stopSpinner('Benchmarks loaded')

  // Build flat score maps with normalized keys (preserve curated tier)
  const allScores = new Map<string, number>()
  const curatedScores = new Map<string, number>()
  for (const [key, bs] of Object.entries(benchmarks.scores)) {
    const id = bs.model_id || key
    const norm = normalize(id)
    if (bs.tier === 'curated') {
      if (!curatedScores.has(norm)) curatedScores.set(norm, bs.score)
    } else {
      allScores.set(norm, bs.score)
    }
  }

  const benchmark = resolveScore(model.name, allScores, curatedScores)

  // Real composite scoring (speed + VRAM fit, not hardcoded zeros)
  const displayModel = scoreModel(model, benchmark, hardware)
  displayModel.rank = 1

  console.log(renderModelInfo(displayModel))
}
