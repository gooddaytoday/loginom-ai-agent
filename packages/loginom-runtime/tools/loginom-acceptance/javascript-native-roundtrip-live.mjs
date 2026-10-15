// Separate private entrypoint; root owns one fresh profile/evidence per selected
// fixed fixture, including each of the seven Integer coercion cases. No batch.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2),{nativeRoundtrip:true});
