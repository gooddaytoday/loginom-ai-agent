// Separate private entrypoint; root owns fresh headed profile and live acceptance.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2),{nativeRoundtrip:true});
