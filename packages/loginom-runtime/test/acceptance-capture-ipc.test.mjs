import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(process.env.MANAGED_ENTRY_SOURCE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const handle=source.slice(source.indexOf('async function handle(message)'));
for(const rejected of [false,0,'',null,undefined,Error('exact refusal')])test('private IPC preserves refusal '+String(rejected),async()=>{
 const replies=[],events=[];
 const state={client:{},bridge:{async captureAcceptance(){events.push('capture');throw rejected}}};
 const api=vm.runInNewContext(handle+';({handle})',{state,Error,AbortController,send:value=>replies.push(value)});
 await api.handle({id:'one',operation:'acceptance.capture'});
 const result=replies[0].result;assert.equal(result.cleanupComplete,false);assert.equal(result.refused,true);
 assert.equal(result.rejectedIsUndefined,rejected===undefined);
 if(rejected instanceof Error)assert.equal(JSON.stringify(result.rejected),JSON.stringify({name:rejected.name,message:rejected.message}));
 else assert.equal(result.rejected,rejected);
 assert.deepEqual(events,['capture']);
})
for(const patch of [{input:{code:'evil'}},{input:{binding:'foreign'}},{controller:{}},{closeFailure:false}])
 test('private IPC refuses arbitrary input or busy/refused state '+JSON.stringify(patch),async()=>{
  let calls=0;const replies=[],state={client:{},bridge:{captureAcceptance(){calls++}},...patch};
  const api=vm.runInNewContext(handle+';({handle})',{state,Error,AbortController,send:value=>replies.push(value)});
  await api.handle({id:'one',operation:'acceptance.capture',...patch});assert.equal(calls,0);assert.equal(replies[0].error,'LOGINOM_REQUEST_INVALID');
 })
