import {readCalculatorCaptureSurface} from '../../client/lib/workspace-ui.mjs';

// Fixed harness input only. No caller script, module path or public tool option.
export function makeCalculatorCaptureCode(input) {
 return `async page=>page.evaluate(${readCalculatorCaptureSurface.toString()},${JSON.stringify(input)})`;
}
