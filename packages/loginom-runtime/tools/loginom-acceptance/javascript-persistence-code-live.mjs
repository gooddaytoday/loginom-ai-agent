// Private fixed writer; cold reader runs separately in a new headed process.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2), {persistenceMode: 'code'});
