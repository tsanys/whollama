import { describe, it, expect } from 'vitest'
import { parseNvidiaSmi, selectPrimaryGpu, getNvidiaBandwidth } from '../src/hardware/nvidia.js'
import { getAppleBandwidth, parseMemoryGb } from '../src/hardware/apple.js'
import { getAmdBandwidth, parseAmdSmi } from '../src/hardware/amd.js'

describe('parseNvidiaSmi', () => {
  it('parses single GPU', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 4090, 24576\n')).toEqual([
      { name: 'GeForce RTX 4090', vramMb: 24576 },
    ])
  })
  it('parses multi-GPU output', () => {
    const out = parseNvidiaSmi(
      'NVIDIA GeForce RTX 4090, 24576\nNVIDIA GeForce RTX 3090, 24576\n',
    )
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({ name: 'GeForce RTX 3090', vramMb: 24576 })
  })
  it('skips blank and malformed lines, splits on last comma', () => {
    const out = parseNvidiaSmi('\nTesla, V100-SXM2-16GB, 16384\ngarbage\n, \n')
    expect(out).toEqual([{ name: 'Tesla, V100-SXM2-16GB', vramMb: 16384 }])
  })
  it('returns [] for empty output', () => {
    expect(parseNvidiaSmi('')).toEqual([])
    expect(parseNvidiaSmi('   \n')).toEqual([])
  })
})

describe('selectPrimaryGpu', () => {
  it('returns null when no GPUs', () => {
    expect(selectPrimaryGpu([])).toBeNull()
  })
  it('picks the largest VRAM without summing (single-model inference)', () => {
    const sel = selectPrimaryGpu([
      { name: 'RTX 3060', vramMb: 12288 },
      { name: 'RTX 4090', vramMb: 24576 },
    ])
    expect(sel).toMatchObject({ name: 'RTX 4090', vramMb: 24576, count: 2 })
  })
  it('count is 1 for single GPU', () => {
    expect(selectPrimaryGpu([{ name: 'T4', vramMb: 15360 }])?.count).toBe(1)
  })
})

describe('bandwidth tables (spot checks incl. 2025-2026 SKUs)', () => {
  it('nvidia Blackwell + datacenter', () => {
    expect(getNvidiaBandwidth('GeForce RTX 5090')).toBe(1792)
    expect(getNvidiaBandwidth('GeForce RTX 5080')).toBe(960)
    expect(getNvidiaBandwidth('GeForce RTX 5070 Ti')).toBe(896)
    expect(getNvidiaBandwidth('NVIDIA RTX 6000 Ada')).toBe(960)
    expect(getNvidiaBandwidth('NVIDIA H100')).toBe(3350)
    expect(getNvidiaBandwidth('NVIDIA B200')).toBe(8000)
    expect(getNvidiaBandwidth('GeForce RTX 4090')).toBe(1008)
  })
  it('nvidia longer keys win over prefixes', () => {
    expect(getNvidiaBandwidth('GeForce RTX 5060 Ti')).toBe(448)
    expect(getNvidiaBandwidth('GeForce RTX 4080 SUPER')).toBe(736)
  })
  it('nvidia unknown falls back conservative', () => {
    expect(getNvidiaBandwidth('Future GPU 9000')).toBe(200)
  })
  it('apple incl. M5', () => {
    expect(getAppleBandwidth('Apple M1 Pro')).toBe(200)
    expect(getAppleBandwidth('Apple M4')).toBe(120)
    expect(getAppleBandwidth('Apple M5')).toBe(153)
  })
  it('amd incl. RX 9000 + MI300+', () => {
    expect(getAmdBandwidth('AMD Radeon RX 9070 XT')).toBe(640)
    expect(getAmdBandwidth('AMD Radeon RX 9060')).toBe(288)
    expect(getAmdBandwidth('AMD Instinct MI300X')).toBe(5300)
    expect(getAmdBandwidth('AMD Radeon RX 7900 XTX')).toBe(960)
  })
})

describe('parseAmdSmi', () => {
  it('prefers Card SKU, parses MB VRAM', () => {
    expect(
      parseAmdSmi({ 'VRAM Total': '16368 MB', 'Card SKU': 'RX 7900 XTX', 'Card series': 'RX 7900' }),
    ).toEqual({ vramMb: 16368, cardName: 'RX 7900 XTX' })
  })
  it('falls back to Card series, then generic name', () => {
    expect(parseAmdSmi({ 'VRAM Total': '16368M', 'Card series': 'RX 7800' })).toEqual({
      vramMb: 16368,
      cardName: 'RX 7800',
    })
    expect(parseAmdSmi({ 'VRAM Total': '8192 MB' })).toEqual({
      vramMb: 8192,
      cardName: 'AMD GPU (8 GB)',
    })
  })
  it('returns null for missing/empty/unparseable entries', () => {
    expect(parseAmdSmi(undefined as never)).toBeNull()
    expect(parseAmdSmi({} as never)).toBeNull()
    expect(parseAmdSmi({ 'VRAM Total': 'unknown' })).toBeNull()
  })
})

describe('parseMemoryGb', () => {
  it('parses GB strings, defaults to 16', () => {
    expect(parseMemoryGb('16 GB')).toBe(16)
    expect(parseMemoryGb('128GB')).toBe(128)
    expect(parseMemoryGb('n/a')).toBe(16)
    expect(parseMemoryGb('')).toBe(16)
  })
})
