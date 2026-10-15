// CODE/OFFLINE: real serialization, retained receipt and fsync journal;
// Page/native/transport are explicit doubles, no network or native authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './fixtures/port-progress-page.mjs';
import {openPreparedOutputPort} from '../lib/node-port-open.mjs';
import {withBrowserReceipt,makeBrowserReceiptReadCode} from '../lib/executor.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

const receipt={receipt_namespace:'port-fixture-original',receipt_id:'open',receipt_signature:'bound-signature',operation_id:'open'};
const runCode=(code,page,extras={})=>vm.runInNewContext('('+code+')(page)',{page,structuredClone,...extras});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function serialized(f){
 return withBrowserReceipt(`(${openPreparedOutputPort.toString()})(page,${JSON.stringify(f.task)},readNode,portOpeningProgress)`,receipt);
}
const read=async(f,change={})=>(await runCode(makeBrowserReceiptReadCode({...receipt,...change}),f.page)).output;
const events=s=>s.port_open_progress.events;

test('serialized original helper publishes bound phases; receipt read never opens again',async()=>{
 const f=fixture();let calls=0;const readNode=async(...args)=>{calls++;return f.readNode(...args);};
 const result=await runCode(serialized(f),f.page,{readNode});assert.equal(result.status,'SUCCEEDED');
 const state=await read(f);assert.equal(state.state,'completed');assert.equal(state.receipt.status,'SUCCEEDED');
 const p=state.port_open_progress;assert.equal(p.namespace,receipt.receipt_namespace);assert.equal(p.signature,receipt.receipt_signature);
 assert.equal(p.identity.binding.node.node_id,'node');assert.equal(p.identity.direction,'output');assert.equal(p.identity.port,0);
 assert.equal(p.authority,false);assert.equal(events(state)[0].phase,'helper');assert.equal(events(state)[0].boundary,'entry');
 for(const phase of ['menu_gesture','open_gesture'])assert.deepEqual(Array.from(events(state).filter(e=>e.phase===phase),e=>e.boundary),['intent','returned']);
 assert.equal(events(state).at(-1).phase,'helper_result');assert.equal(f.gestures.length,2);assert.equal(calls,2);
 await read(f);assert.equal(f.gestures.length,2);assert.equal(calls,2);
 assert.equal((await read(f,{receipt_signature:'foreign'})).state,'identity_mismatch');
 assert.equal((await read(f,{receipt_namespace:'foreign'})).state,'missing');
 assert.equal((await read(f,{receipt_id:'stale'})).state,'missing');
 const other={...f.page};other[Symbol.for('loginom-dock.operation-receipts.v1')]=f.page[Symbol.for('loginom-dock.operation-receipts.v1')];
 assert.equal((await runCode(makeBrowserReceiptReadCode(receipt),other)).output.state,'identity_mismatch');
});

for(const boundary of ['lookup','read_node','right_click','menu_wait','open_click','wizard_wait'])test('pending and refusal at '+boundary+' retain last boundary without next phase',async()=>{
 const f=fixture(),gate=deferred();let reached=0;
 const evaluate=f.page.evaluate,click=f.page.mouse.click,locator=f.page.locator;
 let readNode=f.readNode;
 if(boundary==='lookup')f.page.evaluate=(fn,arg)=>arg.mode==='lookup'?(reached++,gate.promise):evaluate(fn,arg);
 if(boundary==='read_node')readNode=()=>{reached++;return gate.promise;};
 if(boundary==='right_click')f.page.mouse.click=()=>{reached++;return gate.promise;};
 if(['menu_wait','open_click','wizard_wait'].includes(boundary))f.page.locator=selector=>{
  const original=locator(selector),menu=selector.includes('mniConfigurePort');
  return {...original,waitFor:async options=>{
   if(boundary==='menu_wait'&&menu||boundary==='wizard_wait'&&!menu){reached++;return gate.promise;}
   return original.waitFor(options);
  },click:async options=>{
   if(boundary==='open_click'&&!options.trial){reached++;return gate.promise;}
   return original.click(options);
  }};
 };
 const pending=runCode(serialized(f),f.page,{readNode});await settle();assert.equal(reached,1);
 const before=await read(f);assert.equal(before.state,'running');assert.equal(events(before).at(-1).boundary,['right_click','open_click'].includes(boundary)?'intent':'entry');
 const n=f.gestures.length;await read(f);assert.equal(f.gestures.length,n);assert.equal(reached,1);
 const cause=Error('provider cause'),primary=Error('provider refused',{cause});gate.reject(primary);
 const result=await pending;assert.equal(result.verified,false);assert.equal(result.error,'provider refused');assert.equal(f.gestures.length,n);
 const after=await read(f);assert.equal(after.state,'completed');assert.equal(after.receipt.status,result.status);
 assert.ok(events(after).some(e=>e.boundary==='refused'));assert.equal(events(after).at(-1).phase,'helper_result');
 assert.equal(after.port_open_progress.authority,false);
});

for(const primary of [Error('first',{cause:Error('cause')}),undefined,null,false,0,''])test('diagnostic secondary failure preserves original transport rejection '+String(primary),async()=>{
 const f=fixture();const code=withBrowserReceipt(`(async()=>{try{throw primary;}catch(error){try{portOpeningProgress({phase:'foreign'});}catch{}throw error;}})()`,receipt);
 let caught='not thrown';try{await runCode(code,f.page,{primary});}catch(error){caught=error;}
 assert.equal(caught,primary);assert.equal((await read(f)).state,'unknown');assert.equal(f.gestures.length,0);
});

test('lost transport response retains completed helper result; no receipt is NOT_PERSISTED',async()=>{
 const f=fixture();assert.equal((await read(f)).state,'missing');
 const lost=Error('response lost');let calls=0;
 try{calls++;await runCode(serialized(f),f.page,{readNode:f.readNode});throw lost;}catch(error){assert.equal(error,lost);}
 const state=await read(f);assert.equal(state.state,'completed');assert.equal(state.receipt.status,'SUCCEEDED');
 assert.equal(events(state).at(-1).phase,'helper_result');assert.equal(f.gestures.length,2);assert.equal(calls,1);
});

test('late identity substitution in progress is refused without replacing retained original tuple',async()=>{
 const f=fixture();const identity={binding:f.task.binding,direction:'output',port:0,operation_id:'open',deadline:f.task.deadline};
 const code=withBrowserReceipt(`(async()=>{portOpeningProgress({identity,phase:'helper',boundary:'entry'});portOpeningProgress({identity:{...identity,port:1},phase:'read_node',boundary:'entry'});})()`,receipt);
 await assert.rejects(runCode(code,f.page,{identity}),/owner changed/);
 const state=await read(f);assert.equal(state.state,'unknown');assert.equal(state.port_open_progress.identity.port,0);assert.equal(events(state).length,1);
 assert.equal(f.gestures.length,0);
});

test('browser publication loss keeps helper-result distinct from completed receipt',async()=>{
 const f=fixture(),ledger=new Map(),set=ledger.set.bind(ledger),primary=Error('browser publication refused',{cause:Error('disk-like double')});
 ledger.set=(key,value)=>{
  Object.defineProperty(value,'outcome',{set(){throw primary;}});return set(key,value);
 };
 f.page[Symbol.for('loginom-dock.operation-receipts.v1')]=ledger;
 let caught;try{await runCode(serialized(f),f.page,{readNode:f.readNode});}catch(e){caught=e;}
 assert.equal(caught,primary);const state=await read(f);assert.equal(state.state,'unknown');assert.equal(state.receipt,undefined);
 assert.equal(events(state).at(-1).phase,'helper_result');assert.equal(f.gestures.length,2);
 await read(f);assert.equal(f.gestures.length,2);
});

test('secondary receipt-state failure cannot replace primary Error/cause or falsy',async()=>{
 for(const primary of [Error('first',{cause:Error('cause')}),undefined,null,false,0,'']){
  const f=fixture(),ledger=new Map(),set=ledger.set.bind(ledger);
  ledger.set=(key,value)=>{Object.defineProperty(value,'state',{get:()=> 'running',set(){throw Error('secondary diagnostic');}});return set(key,value);};
  f.page[Symbol.for('loginom-dock.operation-receipts.v1')]=ledger;
  let caught='missing';try{await runCode(withBrowserReceipt('(async()=>{throw primary;})()',receipt),f.page,{primary});}catch(e){caught=e;}
  assert.equal(caught,primary);assert.equal(f.gestures.length,0);
 }
});

test('corrupted or copied historical progress never becomes a valid bound receipt',async()=>{
 for(const field of ['namespace','id','signature','identity']){
  const f=fixture();await runCode(serialized(f),f.page,{readNode:f.readNode});
  const retained=f.page[Symbol.for('loginom-dock.operation-receipts.v1')].get(receipt.receipt_namespace+'/'+receipt.receipt_id);
  retained.portOpeningProgress[field]=field==='identity'?{foreign:true}:'foreign';
  assert.equal((await read(f)).state,'identity_mismatch');assert.equal(f.gestures.length,2);
 }
});

function channelFixture(record,mode='success',primary){
 const f=fixture();f.task.binding.workflow_ref={workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const binding=f.task.binding,operation={id:'parent',deadline:Date.now()+60000,action:{action_key:'node.apply',revision:'1'}};
 const state={origin:f.task.origin,loginom_build:f.task.build,workflow_ref:binding.workflow_ref,dom_epoch:{document:'doc'},scan:{complete:true},
  prepared_node_context:{...binding.node,verified:true,surface:'graph',locked:false},wizard:{status:'absent'},ui:{elements:[],masks:[],dialogs:[],truncated:{masks:false,dialogs:false}}};
 let originalCalls=0,options,lastReference;
 // Observation is a double. The mutation envelope, helper and receipt publisher
 // below are serialized production functions; retained app objects remain doubles.
 const channel=createNodeProcedure({operation,record,preparedNodeContext:binding,targetOrigin:f.task.origin,targetBuild:f.task.build,
  wrapMutation:(code,r)=>{lastReference={...receipt,receipt_id:r.id,operation_id:r.id,receipt_signature:r.signature};
   return {code:withBrowserReceipt('('+code+')(page)',lastReference)};},
  execute:async(code,o)=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(state)};
   originalCalls++;options=o;
   if(mode==='transport')throw primary;
   // Restore the fixture's actual active tab tid to match the supplied original binding.
   const originalEvaluate=f.page.evaluate;
   f.page.evaluate=(fn,arg)=>{
    if(arg?.mode&&arg.task){arg=structuredClone(arg);arg.task.binding.workflow_ref.tab_tid='tab';}
    return originalEvaluate(fn,arg);
   };
   const wrapped=code.code;
   // readPreparedNodeContext is production; fixture graph tree is intentionally
   // smaller, so only its first/second graph provider is an explicit double.
   const source=wrapped.replace(/async function readPreparedNodeContext\(page, binding\) \{[^]*?\n\}/,f.readNode.toString());
   const result=await runCode(source,f.page);
   if(mode==='lost')throw primary;
   return result;
  }});
 return {channel,operation,f,get calls(){return originalCalls;},get options(){return options;},get reference(){return lastReference;}};
}

for(const mode of ['success','publication','transport','lost'])test('existing fsync record distinguishes result from publication: '+mode,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'port-progress-'));
 try{
  const journal=createExecutionJournal({directory,metadata:{sessionId:'fixture',clientRevision:'SOURCE',actionManifestDigest:'pin'}}),primary=Error('first persistence/transport',{cause:Error('cause')});
  const record=async entry=>{if(mode==='publication'&&entry.phase==='node_step_completed')throw primary;return journal(entry);};
  const f=channelFixture(record,mode,primary),deadline=f.operation.deadline;
  let result,error;try{result=await f.channel.openOutputPort(0);}catch(e){error=e;}
  const rows=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(f.calls,1);assert.equal(f.options.timeout,20000);assert.equal(f.operation.deadline,deadline);
  if(mode==='success'){
   assert.equal(result.status,'SUCCEEDED',JSON.stringify(error));assert.equal(rows.at(-2).phase,'node_port_open_publication');assert.equal(rows.at(-2).result_received,true);
   assert.equal(rows.at(-1).phase,'node_step_completed');
  }else{
   assert.equal(error,primary);assert.equal(f.operation.cleanupConfirmed,false);assert.equal(f.operation.transportUncertain,true);
   assert.equal(rows.filter(e=>e.phase==='node_step_completed').length,0);
   assert.equal(rows.at(-1).phase,'node_port_open_publication');assert.equal(rows.at(-1).result_received,mode==='publication');
   assert.equal(rows.at(-1).authority,false);
  }
  if(mode!=='transport'){
   const observed=(await runCode(makeBrowserReceiptReadCode(f.reference),f.f.page)).output;
   assert.equal(observed.state,'completed');assert.equal(observed.port_open_progress.identity.operation_id,f.reference.receipt_id);
   const helperDeadline=observed.port_open_progress.identity.deadline;
   assert.ok(helperDeadline<=deadline&&helperDeadline<=Date.now()+15000);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('secondary journal failures preserve first transport Error/cause/falsy; no native call is repeated',async()=>{
 for(const primary of [Error('first',{cause:Error('cause')}),undefined,null,false,0,'']){
  const rows=[];const record=async row=>{if(row.phase==='node_port_open_publication')throw Error('secondary journal');rows.push(structuredClone(row));return row;};
  const f=channelFixture(record,'transport',primary);let caught='missing';
  try{await f.channel.openOutputPort(0);}catch(e){caught=e;}
  assert.equal(caught,primary);assert.equal(f.calls,1);assert.equal(f.f.gestures.length,0);
  assert.equal(f.operation.cleanupConfirmed,false);assert.equal(f.operation.transportUncertain,true);
  assert.equal(rows.at(-1).phase,'node_step_prepared');
 }
});

test('pending durable publication does not mint cleanup; first writer Error/cause/falsy survives',async()=>{
 for(const primary of [Error('writer first',{cause:Error('cause')}),undefined,null,false,0,'']){
  const gate=deferred(),entered=deferred(),rows=[];
  const record=async row=>{
   if(row.phase==='node_step_completed'){entered.resolve();return gate.promise;}
   rows.push(structuredClone(row));return row;
  };
  const f=channelFixture(record,'success',primary);let caught='missing';
  const pending=f.channel.openOutputPort(0).catch(e=>{caught=e;});await entered.promise;
  assert.equal(f.operation.cleanupConfirmed,false);assert.equal(f.calls,1);assert.equal(f.f.gestures.length,2);
  const state=(await runCode(makeBrowserReceiptReadCode(f.reference),f.f.page)).output;
  assert.equal(state.state,'completed');assert.equal(events(state).at(-1).phase,'helper_result');
  assert.equal(rows.at(-1).result_received,true);assert.equal(rows.at(-1).authority,false);
  gate.reject(primary);await pending;assert.equal(caught,primary);assert.equal(f.operation.cleanupConfirmed,false);
  assert.equal(f.operation.transportUncertain,true);assert.equal(f.calls,1);assert.equal(f.f.gestures.length,2);
 }
});
