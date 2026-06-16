let isVerbose = false;
export function setVerbose(v) {
    isVerbose = v;
}
export function isVerboseEnabled() {
    return isVerbose;
}
export function verboseLog(...args) {
    if (isVerbose) {
        console.error('[verbose]', ...args);
    }
}
//# sourceMappingURL=logger.js.map