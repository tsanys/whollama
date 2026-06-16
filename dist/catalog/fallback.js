import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_PATH = path.resolve(__dirname, '../../data/catalog.json');
export async function loadCuratedCatalog() {
    try {
        const data = await fs.readFile(FALLBACK_PATH, 'utf-8');
        const models = JSON.parse(data);
        return models.map((m) => ({ ...m, source: 'curated' }));
    }
    catch {
        // Last resort — extremely minimal fallback
        return getMinimalFallback();
    }
}
function getMinimalFallback() {
    return [
        {
            name: 'llama3.2:3b',
            family: 'llama3.2',
            params_b: 3.2,
            quant: 'Q4_K_M',
            vram_required_gb: 2.1,
            ram_required_gb: 3.0,
            tags: ['general'],
            pulls: 3200000,
            updated_at: '2024-09-25T00:00:00.000Z',
            source: 'curated',
        },
        {
            name: 'qwen3:8b',
            family: 'qwen3',
            params_b: 8.0,
            quant: 'Q4_K_M',
            vram_required_gb: 5.2,
            ram_required_gb: 6.0,
            tags: ['general'],
            pulls: 890000,
            updated_at: '2025-04-15T00:00:00.000Z',
            source: 'curated',
        },
        {
            name: 'gemma4:12b',
            family: 'gemma4',
            params_b: 12.0,
            quant: 'Q4_K_M',
            vram_required_gb: 7.8,
            ram_required_gb: 9.0,
            tags: ['general'],
            pulls: 560000,
            updated_at: '2025-03-12T00:00:00.000Z',
            source: 'curated',
        },
    ];
}
//# sourceMappingURL=fallback.js.map