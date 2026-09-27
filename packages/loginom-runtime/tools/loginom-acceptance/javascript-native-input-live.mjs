// Private operator entrypoint; uses the existing assigned browser/package lifecycle.
import {runJavascriptOperator} from './javascript-live.mjs';
await runJavascriptOperator(process.argv.slice(2),{nativeInputOnly:true});
