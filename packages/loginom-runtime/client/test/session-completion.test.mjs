import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionCompletion} from '../lib/session-completion.mjs';
const identity={attemptId:'attempt-1',generation:1,chat:'a'.repeat(64),sessionId:'own-session',documentId:'own-doc',account:'fresh'};
function fixture(result){
  const writes=[],calls=[];
  const api=createSessionCompletion({identity:()=>identity,persist:async receipt=>writes.push(structuredClone(receipt)),execute:async binding=>{
    calls.push(binding); if(result instanceof Error)throw result;
    return result??{status:'SUCCEEDED',session_id:binding.sessionId,document_id:binding.documentId,account:binding.account,
      package_path:binding.packagePath,package_closed:true,logged_out:true,unsaved_changes_discarded:false,packages_before:1,packages_after:0};
  }});
  api.mutated(); api.saved('/fresh/result.lgp','save-1');
  return {api,calls,writes,request:{completionId:'completion-1',binding:api.options()}};
}
test('completion requires a save after the latest mutation and exact observed binding',async()=>{
  const f=fixture(); f.api.mutated();
  assert.throws(()=>f.api.options(),/LOGINOM_SESSION_SAVE_REQUIRED/);
  await assert.rejects(f.api.finish(f.request),/LOGINOM_SESSION_SAVE_REQUIRED/);
  f.api.saved('/fresh/result.lgp','save-2');
  await assert.rejects(f.api.finish(f.request),/LOGINOM_SESSION_COMPLETION_CONFLICT/);
  assert.equal(f.calls.length,0);
});
test('successful cleanup persists intent before effect and returns exact idempotent receipt',async()=>{
  const f=fixture(); const receipt=await f.api.finish(f.request);
  assert.equal(receipt.status,'SUCCEEDED'); assert.equal(f.writes[0].status,'UNKNOWN');
  assert.equal(f.writes[1].status,'SUCCEEDED'); assert.deepEqual(await f.api.finish(f.request),receipt);
  assert.equal(f.calls.length,1); assert.deepEqual(f.api.status('completion-1'),receipt);
  assert.throws(()=>f.api.mutated(),/LOGINOM_SESSION_COMPLETION_PENDING/);
  await assert.rejects(f.api.finish({...f.request,binding:{...f.request.binding,account:'foreign'}}),/LOGINOM_SESSION_COMPLETION_CONFLICT/);
});
for(const [label,result,status] of [
  ['transport ACK',{closed:true},'UNKNOWN'],['lost response',Error('lost'),'UNKNOWN'],
  ['foreign state',{status:'BLOCKED',reason:'ACCOUNT_CHANGED'},'BLOCKED'],
  ['wrong binding',{status:'SUCCEEDED',session_id:'foreign',package_closed:true,logged_out:true},'UNKNOWN'],
])test(`uncertain cleanup is never repeated: ${label}`,async()=>{
  const f=fixture(result); const receipt=await f.api.finish(f.request);
  assert.equal(receipt.status,status); assert.equal(receipt.loggedOut,false);
  assert.deepEqual(await f.api.finish(f.request),receipt);assert.equal(f.calls.length,1);
  await assert.rejects(f.api.finish({...f.request,completionId:'other'}),/LOGINOM_SESSION_COMPLETION_PENDING/);
});
test('failed durable intent write does not dispatch; the in-process fence remains closed',async()=>{
  let effects=0;
  const api=createSessionCompletion({identity:()=>identity,execute:async()=>effects++,persist:async()=>{throw Error('disk unavailable')}});
  api.saved('/fresh/result.lgp','save'); const request={completionId:'once',binding:api.options()};
  await assert.rejects(api.finish(request),/disk unavailable/);
  assert.equal(effects,0); assert.equal((await api.finish(request)).status,'UNKNOWN');
  assert.throws(()=>api.assertOpen(),/LOGINOM_SESSION_COMPLETION_PENDING/);
});
test('a replayed old save receipt cannot qualify a newer mutation',()=>{
  const f=fixture();f.api.mutated();f.api.saved('/fresh/result.lgp','save-1');
  assert.throws(()=>f.api.options(),/LOGINOM_SESSION_SAVE_REQUIRED/);
  f.api.saved('/fresh/result.lgp','save-2');
  assert.equal(f.api.options().saveOperationId,'save-2');
});
