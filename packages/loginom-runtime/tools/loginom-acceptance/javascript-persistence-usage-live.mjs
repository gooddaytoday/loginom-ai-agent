// Private fixed declared writer with first column's DefaultUsageType=4.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2), {persistenceMode: 'usage'});
