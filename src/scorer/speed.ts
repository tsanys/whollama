import type { HardwareInfo } from '../hardware/types.js'
import type { OllamaModel } from '../catalog/types.js'

const QUANT_BITS: Record<string, number> = {
  'Q2_K': 2.6, 'Q3_K_S': 3.0, 'Q3_K_M': 3.35, 'Q3_K_L': 3.6,
  'Q4_0': 4.0, 'Q4_K_S': 4.37, 'Q4_K_M': 4.5,
  'Q5_0': 5.0, 'Q5_K_S': 5.34, 'Q5_K_M': 5.5,
  'Q6_K': 6.56, 'Q8_0': 8.5, 'F16': 16.0, 'F32': 32.0,
}

const EFFICIENCY: Record<string, number> = {
  apple: 0.85,
  nvidia: 0.85,
  amd: 0.80,
  'cpu-only': 0.7,
}

// MoE pattern: "8x7b", "A3B", "235b" etc with "MoE" or "A\d+B" in name
const MOE_NAME_PATTERN = /moe|8x\d+b|\d+x\d+b|a\d+b/i

/**
 * Determine active params for a model.
 * For MoE models, only a fraction of params are active per token.
 */
function getActiveParamsB(model: OllamaModel): number {
  if (MOE_NAME_PATTERN.test(model.name) || MOE_NAME_PATTERN.test(model.family)) {
    // MoE: typically ~30-40% active. Use 35% as heuristic.
    return model.params_b * 0.35
  }
  return model.params_b
}

export function estimateSpeed(
  model: OllamaModel,
  hardware: HardwareInfo,
): number {
  const activeParamsB = getActiveParamsB(model)
  const bitsPerParam = QUANT_BITS[model.quant] ?? 4.5
  const bytesPerParam = bitsPerParam / 8
  const modelBytes = activeParamsB * 1e9 * bytesPerParam
  const bandwidthBps = hardware.gpu.bandwidth_gbps * 1e9
  const efficiency = EFFICIENCY[hardware.gpu.vendor] ?? 0.7

  if (modelBytes <= 0) return 0

  const tps = (bandwidthBps / modelBytes) * efficiency
  return Math.round(tps)
}
