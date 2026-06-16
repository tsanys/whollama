const QUANT_BITS = {
    'Q2_K': 2.6, 'Q3_K_S': 3.0, 'Q3_K_M': 3.35, 'Q3_K_L': 3.6,
    'Q4_0': 4.0, 'Q4_K_S': 4.37, 'Q4_K_M': 4.5,
    'Q5_0': 5.0, 'Q5_K_S': 5.34, 'Q5_K_M': 5.5,
    'Q6_K': 6.56, 'Q8_0': 8.5, 'F16': 16.0, 'F32': 32.0,
};
const OVERHEAD = 1.15;
export function estimateVramGb(paramsB, quant) {
    const bitsPerParam = QUANT_BITS[quant] ?? 4.5;
    return (paramsB * 1e9 * (bitsPerParam / 8) * OVERHEAD) / 1e9;
}
export function getVramFit(model, hardware) {
    const { gpu, ram_gb } = hardware;
    if (gpu.vendor === 'cpu-only')
        return 'cpu-only';
    if (gpu.unified) {
        // Apple Silicon: can use up to ~75% of total RAM safely
        const usableUnified = ram_gb * 0.75;
        if (model.vram_required_gb <= usableUnified)
            return 'full';
        if (model.ram_required_gb <= ram_gb)
            return 'partial';
        return 'cpu-only';
    }
    // Discrete GPU
    if (model.vram_required_gb <= gpu.vram_gb)
        return 'full';
    if (model.ram_required_gb <= ram_gb)
        return 'partial';
    return 'cpu-only';
}
//# sourceMappingURL=vram.js.map