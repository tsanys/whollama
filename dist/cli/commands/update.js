import { getCatalog } from '../../catalog/index.js';
import { getBenchmarkScores } from '../../benchmarks/index.js';
import { startSpinner, updateSpinner, stopSpinner } from '../spinner.js';
export async function updateCommand(options) {
    // Force refresh catalog
    startSpinner('Refreshing model catalog...');
    const catalog = await getCatalog({ forceRefresh: true, offline: options.offline });
    stopSpinner(`Catalog refreshed: ${catalog.models.length} models (${catalog.source})`);
    // Force refresh benchmarks
    updateSpinner('Refreshing benchmark scores...');
    const benchmarks = await getBenchmarkScores({ forceRefresh: true, offline: options.offline });
    const benchmarkCount = Object.keys(benchmarks.scores).length;
    stopSpinner(`Benchmarks refreshed: ${benchmarkCount} entries (${benchmarks.source})`);
    console.log(`\nUpdate complete.`);
    console.log(`  Models:     ${catalog.models.length}`);
    console.log(`  Benchmarks: ${benchmarkCount}`);
    console.log();
}
//# sourceMappingURL=update.js.map