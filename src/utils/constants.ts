export const QUANT_BITS: Record<string, number> = {
  'Q2_K': 2.6,
  'Q3_K_S': 3.0,
  'Q3_K_M': 3.35,
  'Q3_K_L': 3.6,
  'Q4_0': 4.0,
  'Q4_K_S': 4.37,
  'Q4_K_M': 4.5,
  'Q5_0': 5.0,
  'Q5_K_S': 5.34,
  'Q5_K_M': 5.5,
  'Q6_K': 6.56,
  'Q8_0': 8.5,
  'F16': 16.0,
  'F32': 32.0,
}

export function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\/:]/g, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
