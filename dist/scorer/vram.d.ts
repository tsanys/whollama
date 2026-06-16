import type { HardwareInfo } from '../hardware/types.js';
import type { OllamaModel } from '../catalog/types.js';
export declare function estimateVramGb(paramsB: number, quant: string): number;
export type VramFit = 'full' | 'partial' | 'cpu-only';
export declare function getVramFit(model: OllamaModel, hardware: HardwareInfo): VramFit;
//# sourceMappingURL=vram.d.ts.map