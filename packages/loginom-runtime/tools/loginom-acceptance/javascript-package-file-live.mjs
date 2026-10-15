import {runJavascriptOperator} from './javascript-live.mjs';

await runJavascriptOperator(process.argv.slice(2),{packageFile:true});
