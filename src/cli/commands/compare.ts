import type { HardwareOverride } from '../../hardware/types.js'
import { detectHardware } from '../../hardware/index.js'
import { getCatalog } from '../../catalog/index.js'
import { getBenchmarkScores } from '../../benchmarks/index.js'
import { scoreModels } from '../../scorer/index.js'
import type { ScoredModel } from '../../scorer/types.js'
import { normalizeModelName } from '../../utils/constants.js'
import { readCalibration } from '../../bench/runner.js'
import {
  renderComparisonJson,
  renderComparisonTable,
  type RecommendationDataSources,
} from '../display.js'
import { startSpinner, updateSpinner, stopSpinner } from '../spinner.js'
import { setVerbose, verboseLog } from '../../utils/logger.js'

export interface CompareOptions {
  models: string[]
  json?: boolean
  offline?: boolean
  verbose?: boolean
  gpu?: string
  ram?: number
  vram?: number
}

export function resolveComparedModels(
  scoredModels: ScoredModel[],
  requestedNames: string[],
): ScoredModel[] {
  if (requestedNames.length < 2) {
    throw new Error('Compare at least two model names.')
  }

  const normalizedNames = requestedNames.map((name) => normalizeModelName(name))
  if (normalizedNames.some((name) => !name)) {
    throw new Error('Model names cannot be empty.')
  }
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error('Each model can only be listed once.')
  }

  const selected = normalizedNames.map((normalizedName, index) => {
    const model = scoredModels.find(
      (candidate) => normalizeModelName(candidate.name) === normalizedName,
    )
    if (!model) {
      throw new Error(
        `Model "${requestedNames[index]}" was not found in the catalog. Check the name with "whollama list --all".`,
      )
    }
    return model
  })

  return selected
    .sort((a, b) => b.composite_score - a.composite_score)
    .map((model, index) => ({ ...model, rank: index + 1 }))
}

export async function compareCommand(options: CompareOptions): Promise<ScoredModel[]> {
  if (options.verbose) setVerbose(true)
  if (options.models.length < 2) {
    throw new Error('Compare at least two model names.')
  }

  const hardwareOverrides: HardwareOverride = {}
  if (options.gpu) hardwareOverrides.gpu = options.gpu
  if (options.ram) hardwareOverrides.ram = options.ram
  if (options.vram) hardwareOverrides.vram = options.vram

  startSpinner('Detecting hardware...')
  const hardware = await detectHardware(hardwareOverrides)
  stopSpinner('Hardware detected')

  startSpinner('Fetching model catalog...')
  const catalog = await getCatalog({
    offline: options.offline,
    onProgress: (current, total, name) => {
      updateSpinner(`Fetching model catalog... (${current}/${total}) ${name}`)
    },
  })
  stopSpinner(`Found ${catalog.models.length} models (${catalog.source})`)

  startSpinner('Loading benchmarks...')
  const benchmarks = await getBenchmarkScores({ offline: options.offline })
  stopSpinner(`Loaded ${Object.keys(benchmarks.scores).length} benchmark entries (${benchmarks.source})`)

  const calibration = await readCalibration()
  verboseLog('Hardware:', JSON.stringify(hardware, null, 2))
  if (calibration) {
    verboseLog(`Speed calibration: ${calibration.ratio}x (from bench on ${calibration.model})`)
  }

  const scoredModels = scoreModels(
    catalog.models,
    benchmarks.scores,
    hardware,
    {
      topN: Math.max(catalog.models.length, 1),
      showAll: true,
      speedCalibrationRatio: calibration?.ratio,
    },
  )
  const results = resolveComparedModels(scoredModels, options.models)
  const dataSources: RecommendationDataSources = {
    catalog: { source: catalog.source, cache: catalog.cache },
    benchmarks: { source: benchmarks.source, cache: benchmarks.cache },
  }

  if (options.json) {
    console.log(renderComparisonJson(results, hardware, dataSources))
  } else {
    renderComparisonTable(results, hardware, dataSources)
  }

  return results
}
