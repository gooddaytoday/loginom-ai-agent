import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2),{coldReader:true,existingLifecycle:'code',existingInputVariant:'changed'});
