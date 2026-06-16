import { getCatalog } from '../../catalog/index.js';
import { getBenchmarkScores } from '../../benchmarks/index.js';
import { resolveScore, normalize } from '../../benchmarks/resolver.js';
import { startSpinner, stopSpinner } from '../spinner.js';
import { renderModelInfo } from '../display.js';
import { setVerbose } from '../../utils/logger.js';
export async function infoCommand(options) {
    if (options.verbose)
        setVerbose(true);
    startSpinner('Fetching model catalog...');
    const catalog = await getCatalog({ offline: options.offline });
    stopSpinner('Catalog loaded');
    // Find model by name (fuzzy matching)
    const searchName = options.modelName.toLowerCase();
    const model = catalog.models.find((m) => m.name.toLowerCase() === searchName ||
        m.name.toLowerCase().startsWith(searchName) ||
        m.name.toLowerCase().includes(searchName));
    if (!model) {
        console.error(`Model "${options.modelName}" not found in catalog.`);
        console.error('Use `whollama list --all` to see all available models.');
        process.exit(1);
    }
    startSpinner('Loading benchmark scores...');
    const benchmarks = await getBenchmarkScores({ offline: options.offline });
    stopSpinner('Benchmarks loaded');
    // Build flat score map with normalized keys
    const allScores = new Map();
    for (const [key, bs] of Object.entries(benchmarks.scores)) {
        const id = bs.model_id || key;
        allScores.set(normalize(id), bs.score);
    }
    const benchmark = resolveScore(model.name, allScores);
    // Build a ScoredModel-like object for display
    const displayModel = {
        ...model,
        rank: 1,
        composite_score: benchmark?.score ?? 0,
        speed_tps: 0,
        vram_fit: 'full',
        benchmark_tier: benchmark?.tier ?? 'none',
        pull_command: `ollama pull ${model.name}`,
    };
    console.log(renderModelInfo(displayModel));
}
//# sourceMappingURL=info.js.map