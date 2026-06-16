import * as os from 'os';
export function detectCpu() {
    const cpus = os.cpus();
    const cores = cpus.length;
    const model = cpus[0]?.model ?? 'Unknown';
    return { model, cores };
}
export function detectRam() {
    // os.totalmem() returns bytes -> GB
    return parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
}
//# sourceMappingURL=cpu.js.map