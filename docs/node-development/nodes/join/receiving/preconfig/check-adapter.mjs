// Local test CLI only. The adapter path is never forwarded to host/runtime.
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {checkReadAdapter} from './consumer-contract.mjs';
const i=process.argv.indexOf('--adapter'),path=process.argv[i+1];
if(i<0){console.log(JSON.stringify({status:'SEAM_PENDING',reason:'NO_CLOSED_OWNER_BOUND_PRECONFIG_TRACE_ADAPTER',executed_native:0,dispatch_count:0,configure_authority:false,close_authority:false}));process.exitCode=2;}
else {
 if(!isAbsolute(path??''))throw Error('Explicit absolute source-owned test adapter required');
 const adapter=await import(pathToFileURL(path));
 console.log(JSON.stringify(await checkReadAdapter(adapter)));
}
