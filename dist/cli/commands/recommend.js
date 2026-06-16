import { detectHardware } from '../../hardware/index.js';
import { getCatalog } from '../../catalog/index.js';
import { getBenchmarkScores } from '../../benchmarks/index.js';
import { scoreModels } from '../../scorer/index.js';
import { renderTable, renderJson } from '../display.js';
import { startSpinner, stopSpinner } from '../spinner.js';
import { verboseLog, setVerbose } from '../../utils/logger.js';
export async function recommendCommand(options) {
    if (options.verbose) {
        setVerbose(true);
    }
    // Step 1: Detect hardware
    startSpinner('Detecting hardware...');
    const hardwareOverrides = {};
    if (options.gpu)
        hardwareOverrides.gpu = options.gpu;
    if (options.ram)
        hardwareOverrides.ram = options.ram;
    if (options.vram)
        hardwareOverrides.vram = options.vram;
    const hardware = await detectHardware(hardwareOverrides);
    verboseLog('Hardware:', JSON.stringify(hardware, null, 2));
    stopSpinner('Hardware detected');
    // Step 2: Fetch catalog
    startSpinner('Fetching model catalog...');
    const catalog = await getCatalog({ offline: options.offline });
    verboseLog(`Catalog: ${catalog.models.length} models (source: ${catalog.source})`);
    stopSpinner(`Found ${catalog.models.length} models (${catalog.source})`);
    // Step 3: Fetch benchmark scores
    startSpinner('Fetching benchmark scores...');
    const benchmarks = await getBenchmarkScores({ offline: options.offline });
    const benchmarkCount = Object.keys(benchmarks.scores).length;
    verboseLog(`Benchmarks: ${benchmarkCount} entries (source: ${benchmarks.source})`);
    stopSpinner(`Loaded ${benchmarkCount} benchmark entries (${benchmarks.source})`);
    // Step 4: Score and rank
    startSpinner('Scoring models...');
    const results = scoreModels(catalog.models, benchmarks.scores, hardware, { topN: options.top ?? 10, task: options.task });
    stopSpinner(`${results.length} models scored`);
    // Step 5: Display
    if (options.json) {
        console.log(renderJson(results, hardware));
    }
    else {
        renderTable(results, hardware, options.task);
    }
    return results;
}
//# sourceMappingURL=recommend.js.map