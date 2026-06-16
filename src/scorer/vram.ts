import type { HardwareInfo } from '../hardware/types.js'
import type { OllamaModel } from '../catalog/types.js'
import { QUANT_BITS } from '../utils/constants.js'

const OVERHEAD = 1.15

export function estimateVramGb(paramsB: number, quant: string): number {
  const bitsPerParam = QUANT_BITS[quant] ?? 4.5
  return (paramsB * 1e9 * (bitsPerParam / 8) * OVERHEAD) / 1e9
}

export type VramFit = 'full' | 'partial' | 'cpu-only'

export function getVramFit(
  model: OllamaModel,
  hardware: HardwareInfo,
): VramFit {
  const { gpu, ram_gb } = hardware

  if (gpu.vendor === 'cpu-only') return 'cpu-only'

  if (gpu.unified) {
    // Apple Silicon: can use up to ~75% of total RAM safely
    const usableUnified = ram_gb * 0.75
    if (model.vram_required_gb <= usableUnified) return 'full'
    if (model.ram_required_gb <= ram_gb) return 'partial'
    return 'cpu-only'
  }

  // Discrete GPU
  if (model.vram_required_gb <= gpu.vram_gb) return 'full'
  if (model.ram_required_gb <= ram_gb) return 'partial'
  return 'cpu-only'
}
