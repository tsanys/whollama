import { QUANT_BITS } from '../utils/constants.js'

export type DiskFit = 'fits' | 'tight' | 'insufficient' | 'unknown'

const DISK_MARGIN_GB = 1
const DISK_MARGIN_RATIO = 0.1

export function estimateDownloadGb(paramsB: number, quant: string): number | null {
  if (!Number.isFinite(paramsB) || paramsB <= 0) return null

  const bitsPerParam = QUANT_BITS[quant.trim().toUpperCase()]
  if (bitsPerParam === undefined) return null

  const estimatedGb = paramsB * (bitsPerParam / 8)
  return Number.isFinite(estimatedGb) && estimatedGb > 0
    ? Math.round(estimatedGb * 100) / 100
    : null
}

export function getDiskFit(
  estimatedDownloadGb: number | null,
  freeDiskGb: number | null,
): DiskFit {
  if (
    estimatedDownloadGb === null ||
    !Number.isFinite(estimatedDownloadGb) ||
    estimatedDownloadGb <= 0 ||
    freeDiskGb === null ||
    !Number.isFinite(freeDiskGb) ||
    freeDiskGb < 0
  ) {
    return 'unknown'
  }

  if (freeDiskGb < estimatedDownloadGb) return 'insufficient'

  const marginGb = Math.max(DISK_MARGIN_GB, estimatedDownloadGb * DISK_MARGIN_RATIO)
  return freeDiskGb < estimatedDownloadGb + marginGb ? 'tight' : 'fits'
}
