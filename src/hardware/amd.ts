import { execa } from 'execa'
import type { HardwareGpu } from './types.js'

interface RocmSmiOutput {
  [deviceId: string]: {
    'VRAM Total'?: string
    'Card series'?: string
    'Card SKU'?: string
  }
}

const BANDWIDTH_LOOKUP: Record<string, number> = {
  'RX 7900 XTX': 960,
  'RX 7900 XT': 800,
  'RX 7800 XT': 624,
  'RX 7700 XT': 432,
  'RX 7600': 288,
  'RX 6900 XT': 512,
  'RX 6800 XT': 512,
  'RX 6800': 512,
  'RX 6700 XT': 384,
  'RX 6600 XT': 256,
  'MI250X': 1638,
  'MI250': 1638,
  'MI210': 1638,
  'MI100': 1228,
  'MI50': 1024,
  'MI25': 484,
}

function getBandwidth(gpuName: string): number {
  const keys = Object.keys(BANDWIDTH_LOOKUP).sort(
    (a, b) => b.length - a.length,
  )
  for (const key of keys) {
    if (gpuName.includes(key)) return BANDWIDTH_LOOKUP[key]
  }
  return 400 // conservative fallback for modern AMD
}

export async function detectAmdGpu(): Promise<HardwareGpu | null> {
  try {
    // Check if rocm-smi exists
    try {
      await execa('which', ['rocm-smi'], { timeout: 5000 })
    } catch {
      return null
    }

    const { stdout } = await execa(
      'rocm-smi',
      ['--showmeminfo', 'vram', '--json'],
      { timeout: 10000 },
    )

    const data: RocmSmiOutput = JSON.parse(stdout)
    const firstDevice = Object.values(data)[0]

    if (!firstDevice) return null

    const vramStr = firstDevice['VRAM Total']
    if (!vramStr) return null

    // Format: "16368 MB" or "16368M"
    const match = vramStr.match(/(\d+)/)
    if (!match) return null

    const vramMb = parseInt(match[1], 10)
    const vramGb = vramMb / 1024

    const cardName =
      firstDevice['Card SKU'] ??
      firstDevice['Card series'] ??
      `AMD GPU (${vramGb.toFixed(0)} GB)`

    return {
      name: cardName,
      vendor: 'amd',
      vram_gb: vramGb,
      bandwidth_gbps: getBandwidth(cardName),
      unified: false,
    }
  } catch {
    return null
  }
}
