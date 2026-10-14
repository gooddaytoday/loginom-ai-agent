import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const [node,entry,output]=process.argv.slice(2);
assert(node&&entry&&output);
const receipts=[];
for(const mode of ['missing-original-provider','foreign-authorization','foreign-purpose','expired','late-run-metadata']){
 const root=await mkdtemp(join(output,'own-'));
 const child=fork(entry,[],{execPath:node,execArgv:['--use-system-ca'],stdio:['ignore','ignore','ignore','ipc']});
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 let sequence=0;const pending=new Map();
 child.on('message',message=>{const p=pending.get(message.id);if(p){pending.delete(message.id);p(message)}});
 const send=(method,input,deadline)=>new Promise(resolve=>{
  const id='outer_'+(++sequence);pending.set(id,resolve);child.send({id,method,input,deadline});
 });
 const deadline=Date.now()+(mode==='expired'?-1:60000),authorization='a'.repeat(64);
 const input={protocol:1,root,resources:'/missing-fixed-resources',headless:true,
  acceptanceCapture:{authorization,packagePath:'/account/input.lgp',harness:'amount-import-type-v1'},
  amountStartup:{purpose:'amount-import-type-v1',authorization,operation:'original_operation',request:'original_request',deadline}};
 if(mode==='foreign-authorization')input.amountStartup.authorization='b'.repeat(64);
 if(mode==='foreign-purpose')input.amountStartup.purpose='field-parameters-preservation-v1';
 if(mode==='late-run-metadata')input.amountStartup.run='late_run';
 let result,exit;
 try {
 result=await send('start',input,deadline);
 if(mode==='missing-original-provider'){
  assert.equal(result.rejection.kind,'Error');assert.equal(result.rejection.message,'ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE');
  const replay=await send('start',input,deadline);assert.equal(replay.rejection.message,'LOGINOM_HANDSHAKE_INVALID');
  const capture=await send('acceptance.capture',{run:'late_run',authorization});assert.equal(capture.error,'LOGINOM_HOST_NOT_READY');
 }else if(mode==='expired')assert.equal(result.error,'LOGINOM_HOST_REQUEST_FAILED');
 else assert.equal(result.error,'LOGINOM_HANDSHAKE_INVALID');
 assert.deepEqual(await readdir(root),[],'refusal precedes all host FS acquisition');
 }finally{if(child.connected)child.disconnect();exit=await exited;assert.deepEqual(exit,{code:0,signal:null});}
 receipts.push({mode,pass:true,result,exit,hostAcquired:false,managedDispatched:false,nativeProvider:false,rootFiles:0});
}
await writeFile(join(output,'receiver-results.json'),JSON.stringify({cases:receipts,realIPC:true,realFS:true,nativeProvider:false,captureProxyImplemented:false},null,2)+'\n');
console.log(JSON.stringify({pass:receipts.length,realIPC:true,realFS:true,nativeProvider:false}));
