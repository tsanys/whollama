import * as readline from 'readline';
import { execa } from 'execa';
import { recommendCommand } from './recommend.js';
export async function pullCommand(options) {
    // If a model name is provided directly, pull it
    if (options.model) {
        console.log(`Pulling ${options.model}...`);
        try {
            await execa('ollama', ['pull', options.model], {
                stdio: 'inherit',
            });
        }
        catch (err) {
            console.error('Failed to pull model:', err);
            process.exit(1);
        }
        return;
    }
    // Otherwise run recommend first to get ranked list
    const results = await recommendCommand(options);
    if (results.length === 0) {
        console.error('No models available to pull.');
        process.exit(1);
    }
    // Show numbered list for interactive selection
    console.log('\nSelect a model to pull:\n');
    for (let i = 0; i < Math.min(results.length, 20); i++) {
        const m = results[i];
        console.log(`  ${String(i + 1).padStart(2)}. ${m.name.padEnd(20)} ${'score:'.padEnd(6)} ${m.composite_score.toFixed(1)}  ${m.pull_command}`);
    }
    console.log();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await new Promise((resolve) => {
        rl.question('  Enter number (or "q" to quit): ', resolve);
    });
    rl.close();
    const num = parseInt(answer, 10);
    if (isNaN(num) || num < 1 || num > results.length) {
        console.log('Cancelled.');
        return;
    }
    const selected = results[num - 1];
    console.log(`\nPulling ${selected.name}...`);
    try {
        await execa('ollama', ['pull', selected.name], { stdio: 'inherit' });
    }
    catch (err) {
        console.error('Failed to pull model:', err);
        process.exit(1);
    }
}
//# sourceMappingURL=pull.js.map