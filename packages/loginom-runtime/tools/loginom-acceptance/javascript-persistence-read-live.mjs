// Separate cold process: only technical assignment and exact saved package path.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2), {coldReader: true});
