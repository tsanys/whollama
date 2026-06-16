export interface HardwareGpu {
  name: string
  vendor: 'apple' | 'nvidia' | 'amd' | 'cpu-only'
  vram_gb: number
  bandwidth_gbps: number
  unified: boolean
}

export interface HardwareCpu {
  model: string
  cores: number
}

export interface HardwareInfo {
  gpu: HardwareGpu
  cpu: HardwareCpu
  ram_gb: number
  disk_free_gb: number
  os: 'darwin' | 'linux' | 'win32'
}

export interface HardwareOverride {
  gpu?: string
  ram?: number
  vram?: number
}
