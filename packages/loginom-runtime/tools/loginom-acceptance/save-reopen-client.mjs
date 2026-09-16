#!/usr/bin/env node
// Operator-only interruption after real save and close; no fabricated success.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityResult } from '../../client/lib/executor.mjs';
import { readTask } from './rename-client.mjs';
import { launchFault } from './fault-launcher.mjs';
export const NEEDLE="    record('saved_package_closed');";
export function injectSaveReopen(request) {
 const code=request.arguments.code;
 if(code.split(NEEDLE).length!==2)throw new Error('Save close boundary is not unique');
 return {...request,arguments:{...request.arguments,code:code.replace(NEEDLE,NEEDLE+"\n    record('operator_reopen_interrupted');\n    throw new Error('OPERATOR_REOPEN_INTERRUPTED_AFTER_CLOSE');")}};
}
export function saveReopenFaultCall(original,saveReceipt) {
 let selected=false;
 return async function(request,...args){
  const task=readTask(request);
  if(selected||task?.mode!=='apply'||task?.action?.action_key!=='package.save_as')return original.call(this,request,...args);
  selected=true;const patched=injectSaveReopen(request);
  const response=await original.call(this,patched,...args);const actual=parseCapabilityResult(response);
  await saveReceipt({fault:'reopen_interrupted_after_saved_package_closed',operation_id:actual.operation_id,
   injection_reached:actual.trace.some(t=>t.event==='operator_reopen_interrupted'),receipt_fabricated:false,
   source_code_sha256:createHash('sha256').update(request.arguments.code).digest('hex'),
   injected_code_sha256:createHash('sha256').update(patched.arguments.code).digest('hex'),actual_browser_reply:actual});
  return response;
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await launchFault('save_reopen',saveReopenFaultCall);
