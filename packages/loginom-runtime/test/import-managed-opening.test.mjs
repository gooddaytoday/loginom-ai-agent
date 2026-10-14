import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const root=process.env.IMPORT_RUNTIME_ROOT?new URL('file://'+process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const text=await readFile(new URL('src/managed-entry.mjs',root),'utf8');
const code=text.slice(text.indexOf('async function handle(message)'))+';handle';
// Exact production dispatch; retained startup and bridge/Page/native are doubles.
for(const kind of ['import-before-configure-v1','calculator-grouped-before-done-v1',undefined])test('managed opening fixed kind '+kind,async()=>{
 let dispatched=0,reply;const request={operation_id:'original'};
 const state={client:{},captureRetained:kind?{binding:{harness:kind}}:undefined};
 state.bridge={async captureAcceptance(options){dispatched++;assert.equal(options.request,request);
  assert.equal(options.signal,state.controller.signal);return {cleanupComplete:false,refused:true};}};
 const handle=vm.runInNewContext(code,{state,AbortController,send:r=>reply=r});
 await handle({id:'original',operation:'acceptance.capture',input:{request}});
 assert.equal(dispatched,kind==='import-before-configure-v1'?1:0);
 if(kind!=='import-before-configure-v1')assert.equal(reply.error,'LOGINOM_REQUEST_INVALID');
 assert.equal(state.controller,undefined);
});
for(const primary of [Error('transport',{cause:0}),undefined,null,false,0,''])test('managed atomic opening preserves '+String(primary),async()=>{
 let reply;const state={client:{},captureRetained:{binding:{harness:'import-before-configure-v1'}},bridge:{async captureAcceptance(){throw primary;}}};
 const handle=vm.runInNewContext(code,{state,AbortController,Error,closeRejection:x=>x,send:r=>reply=r});
 await handle({id:'first',operation:'acceptance.capture',input:{request:{}}});
 assert.equal(reply.result.refused,true);assert.equal(reply.result.cleanupComplete,false);
 if(primary instanceof Error){assert.equal(reply.result.rejected.message,primary.message);assert.equal(reply.result.rejected.cause,0);}
 else assert.equal(reply.result.rejected,primary);
 assert.equal(reply.result.rejectedIsUndefined,primary===undefined);
});
