import ora from 'ora';
let currentSpinner = null;
export function startSpinner(text) {
    currentSpinner = ora({ text, color: 'blue' }).start();
}
export function updateSpinner(text) {
    if (currentSpinner) {
        currentSpinner.text = text;
    }
}
export function stopSpinner(text) {
    if (currentSpinner) {
        if (text) {
            currentSpinner.succeed(text);
        }
        else {
            currentSpinner.stop();
        }
        currentSpinner = null;
    }
}
export function failSpinner(text) {
    if (currentSpinner) {
        currentSpinner.fail(text);
        currentSpinner = null;
    }
}
//# sourceMappingURL=spinner.js.map