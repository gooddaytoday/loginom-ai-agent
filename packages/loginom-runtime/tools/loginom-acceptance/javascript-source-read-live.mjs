// Private fixed fixture only; no public source route, caller source or JS eval.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2), {sourceReadCycle: true});
