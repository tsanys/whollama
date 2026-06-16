import { execa } from 'execa'
import type { HardwareGpu } from './types.js'

interface SystemProfilerHardware {
  SPHardwareDataType: Array<{
    chip_type?: string
    physical_memory?: string
  }>
}

const BANDWIDTH_LOOKUP: Record<string, number> = {
  'M1 Ultra': 800,
  'M1 Max': 400,
  'M1 Pro': 200,
  M1: 68,
  'M2 Ultra': 800,
  'M2 Max': 400,
  'M2 Pro': 200,
  M2: 100,
  'M3 Max': 300,
  'M3 Pro': 150,
  M3: 100,
  'M4 Max': 546,
  'M4 Pro': 273,
  M4: 120,
}

function getBandwidth(chipName: string): number {
  const keys = Object.keys(BANDWIDTH_LOOKUP).sort(
    (a, b) => b.length - a.length,
  )
  for (const key of keys) {
    if (chipName.includes(key)) return BANDWIDTH_LOOKUP[key]
  }
  return 100
}

function parseMemoryGb(memoryStr: string): number {
  const match = memoryStr.match(/(\d+(?:\.\d+)?)\s*GB/)
  return match ? parseFloat(match[1]) : 16
}

export async function detectAppleGpu(): Promise<HardwareGpu | null> {
  try {
    const { stdout } = await execa('system_profiler', [
      'SPHardwareDataType',
      '-json',
    ], { timeout: 10000 })

    const data: SystemProfilerHardware = JSON.parse(stdout)
    const info = data.SPHardwareDataType?.[0]
    if (!info?.chip_type) return null

    const chipName = info.chip_type
    const ramGb = parseMemoryGb(info.physical_memory ?? '16 GB')

    return {
      name: chipName,
      vendor: 'apple',
      vram_gb: ramGb,
      bandwidth_gbps: getBandwidth(chipName),
      unified: true,
    }
  } catch {
    return null
  }
}
