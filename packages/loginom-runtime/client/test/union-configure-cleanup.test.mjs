import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, open, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {retainUnionConfigureCleanup, unionCleanupWitness} = await import(process.env.UNION_CLEANUP_MODULE
  ? pathToFileURL(process.env.UNION_CLEANUP_MODULE).href : '../lib/union-configure-cleanup.mjs');
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject};};

// Page/controller/native methods and logical lease are explicit doubles.
// Receipt open/write/fsync/close/readback are real filesystem operations.
async function fixture(beforeMint = () => {}) {
  const directory = await mkdtemp(join(tmpdir(),'union-partial-'));
  const abort = new AbortController(), counts={close:0,read:0,write:0};
  const node = {document_id:'document',workflow_id:'workflow',node_id:'node'};
  const operation = {id:'original',signature:'original-signature',parameters:{operation_id:'original',target:{type:'transform.union_data'},inputs:[{id:'input0'}]},
    nodeApply:{node,phases:[{phase:'target',value:{effect_possible:true}},{phase:'input_mapping'},{phase:'open'}],pending:{phase:'configure',receipt_id:'original:configure'},execution:{status:'not_requested'}},
    outcome:{status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false,error:{code:'NODE_APPLY_STOPPED',message:'first'},accepted_effects:['target','input','open']}};
  const prepared={wizard:{status:'observed',root_ref:'root',root_tid:'wizard',stage:'union',owner_context:{status:'observed',node:{tid:'original-node'}}},prepared_node_context:{verified:true,surface:'wizard',...node},ui:{dialogs:[],masks:[]}};
  let terminal={wizard:{status:'absent'},prepared_node_context:{verified:true,surface:'graph',locked:false,...node},ui:{dialogs:[],masks:[]}};
  let closeHook=async()=>{}, readHook=async()=>{}, writeHook=async()=>{};
  const originalClose=async operands=>{counts.close++; assert.equal(operands.signal,abort.signal);assert.equal(operands.deadline,1000);return closeHook();};
  const tuple=Object.fromEntries(['owner','run','lease','chat','account','session','page','context','package','workflow','node','wizard','controller'].map(k=>[k,{}]));
  Object.assign(tuple,{generation:7,close:originalClose,signal:abort.signal,deadline:1000});
  const current={...tuple,running:false,dirty:false,writerPending:false,transportUnknown:false};
  let clock=0;
  const record=async event=>{
    counts.write++; await writeHook();
    const f=await open(join(directory,'partial.json'),'w',0o600);
    try{await f.writeFile(JSON.stringify(event));await f.sync();}finally{await f.close();}
    return JSON.parse(await readFile(join(directory,'partial.json'),'utf8'));
  };
  try { beforeMint(operation); } catch(error) { await rm(directory,{recursive:true}); throw error; }
  let scope;
  try { scope=retainUnionConfigureCleanup({operation,tuple,current:()=>current,prepared,originalClose,
    observeTerminal:async operands=>{counts.read++;assert.equal(operands.signal,abort.signal);await readHook();return terminal;},record,signal:abort.signal,deadline:1000,now:()=>clock}); } catch(error) { await rm(directory,{recursive:true}); throw error; }
  const primary=Error('AMBIGUOUS original',{cause:0}); scope.holdFailure(primary);
  return {operation,current,tuple,scope,counts,primary,abort,directory,
    closeHook:f=>closeHook=f, readHook:f=>readHook=f,writeHook:f=>writeHook=f,
    terminal:v=>terminal=v,clock:v=>clock=v,cleanup:()=>rm(directory,{recursive:true})};
}
async function control(fn){const f=await fixture();try{await fn(f);}finally{await f.cleanup();}}

test('original callback -> exact terminal -> fsync receipt; opaque witness grants no release',()=>control(async f=>{
  const before=structuredClone(f.operation); const proof=await f.scope.complete();
  assert.equal(unionCleanupWitness(proof,f.operation),true);
  assert.equal(unionCleanupWitness({...proof},f.operation),false);
  assert.equal(unionCleanupWitness(proof,{...f.operation}),false);
  assert.equal(await f.scope.complete(),proof);assert.deepEqual(f.counts,{close:1,read:1,write:1});
  assert.deepEqual(f.operation,before);assert.equal(f.scope.primary,f.primary);
  const r=JSON.parse(await readFile(join(f.directory,'partial.json')));
  assert.equal(r.business_status,'AMBIGUOUS');assert.equal(r.package_saved,false);assert.equal(r.release_authority,false);
  assert.deepEqual(r.original_outcome.accepted_effects,['target','input','open']);assert.equal(r.primary.cause.value,0);
}));
for(const key of ['owner','run','lease','generation','chat','account','session','page','context','package','workflow','node','wizard','controller','close','signal','deadline'])
 test('initial replacement '+key+' refuses before callback',()=>control(async f=>{
  f.current[key]=key==='generation'?8:{};await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:0,read:0,write:0});
 }));
for(const key of ['running','dirty','writerPending','transportUnknown'])
 test('custody '+key+' refusal',()=>control(async f=>{f.current[key]=true;await assert.rejects(f.scope.complete());assert.equal(f.counts.close,0);}));
for(const boundary of ['close','read','write'])
 test('replacement during '+boundary+' await cannot publish witness',()=>control(async f=>{
  const d=deferred(), started=deferred();f[boundary+'Hook'](async()=>{started.resolve();return d.promise;});
  const work=f.scope.complete();await started.promise;f.current.page={};d.resolve();await assert.rejects(work);
  assert.equal(f.scope.state.durable,false);assert.equal(f.scope.primary,f.primary);assert.equal(f.counts.close,1);
 }));
for(const primary of [Error('first',{cause:0}),undefined,null,false,0,''])
 test('primary '+String(primary)+' retained through writer refusal and storage-only repair',()=>control(async f=>{
  // First primary is immutable; create the equivalent original scope anew.
  const tuple=f.tuple; const p=f.operation;
  const refusal=Error('fsync refusal',{cause:false});let writes=0,closes=0,reads=0;
  const close=async()=>{closes++;};tuple.close=close;f.current.close=close;
  const s=retainUnionConfigureCleanup({operation:p,tuple,current:()=>f.current,prepared:{wizard:{status:'observed',root_ref:'r',root_tid:'w',stage:'union',owner_context:{status:'observed'}},prepared_node_context:{verified:true,surface:'wizard',...p.nodeApply.node}},originalClose:close,
    observeTerminal:async()=>{reads++;return {wizard:{status:'absent'},prepared_node_context:{verified:true,surface:'graph',locked:false,...p.nodeApply.node},ui:{dialogs:[],masks:[]}};},
    record:async r=>{writes++;if(writes===1)throw refusal;const fd=await open(join(f.directory,'repair.json'),'w',0o600);try{await fd.writeFile(JSON.stringify(r));await fd.sync();}finally{await fd.close();}return r;},
    signal:f.abort.signal,deadline:1000,now:()=>0});
  s.holdFailure(primary);await assert.rejects(s.complete(),e=>e===refusal);
  assert.equal(s.primary,primary);assert.equal(s.secondary[0],refusal);
  assert.equal(unionCleanupWitness(await s.complete(),p),true);assert.deepEqual([closes,reads,writes],[1,1,2]);
  assert.equal(p.nodeApply.pending.phase,'configure');assert.equal(p.outcome.status,'AMBIGUOUS');
 }));
test('pending original Close is shared, never replayed or treated as terminal',()=>control(async f=>{
  const d=deferred(),started=deferred();f.closeHook(async()=>{started.resolve();return d.promise;});
  const a=f.scope.complete();await started.promise;const b=f.scope.complete();assert.equal(a,b);
  assert.equal(f.scope.state.callback,'pending');assert.equal(f.counts.read,0);d.resolve();await a;assert.equal(f.counts.close,1);
}));
for(const reason of [Error('lost',{cause:0}),undefined,null,false,0,''])
 test('unknown original Close '+String(reason)+' never retries',()=>control(async f=>{
  f.closeHook(async()=>{throw reason;});await assert.rejects(f.scope.complete(),e=>e===reason);
  await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:1,read:0,write:0});assert.equal(f.scope.primary,f.primary);
 }));
test('original abort before callback; exact raw signal reason',()=>control(async f=>{
  const e=Error('abort',{cause:0});f.abort.abort(e);await assert.rejects(f.scope.complete(),x=>x===e);assert.equal(f.counts.close,0);
}));
test('absolute deadline expiry before callback',()=>control(async f=>{f.clock(1000);await assert.rejects(f.scope.complete());assert.equal(f.counts.close,0);}));
test('abort during callback never permits terminal read',()=>control(async f=>{f.closeHook(async()=>f.abort.abort(false));await assert.rejects(f.scope.complete(),x=>x===false);assert.equal(f.counts.read,0);}));
for(const mutation of [s=>s.prepared_node_context.node_id='foreign',s=>s.prepared_node_context.locked=true,s=>s.ui.dialogs.push({}),s=>s.ui.masks.push({}),s=>s.wizard.status='observed'])
 test('foreign/pending/locked terminal refuses without storage',()=>control(async f=>{
  const s={wizard:{status:'absent'},prepared_node_context:{verified:true,surface:'graph',locked:false,...f.operation.nodeApply.node},ui:{dialogs:[],masks:[]}};
  mutation(s);f.terminal(s);await assert.rejects(f.scope.complete());await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:1,read:1,write:0});
 }));
test('changed request/pending/accepted effects refuse original settlement',()=>control(async f=>{
  f.operation.parameters.inputs.original_pin='lost';await assert.rejects(f.scope.complete());assert.equal(f.counts.close,0);
}));
test('missing durable acknowledgement retains confirmed callback for repair',()=>control(async f=>{
  f.writeHook(async()=>{throw undefined;});await assert.rejects(f.scope.complete(),x=>x===undefined);
  f.writeHook(async()=>{});await f.scope.complete();assert.deepEqual(f.counts,{close:1,read:1,write:2});
}));
test('confirmed callback plus restored original tuple repairs without replacement IO',()=>control(async f=>{
  const original=f.current.page;
  f.writeHook(async()=>{throw Error('durability refusal');});await assert.rejects(f.scope.complete());
  f.current.page={};f.writeHook(async()=>{});await assert.rejects(f.scope.complete());
  assert.deepEqual(f.counts,{close:1,read:1,write:1});f.current.page=original;
  await f.scope.complete();assert.deepEqual(f.counts,{close:1,read:1,write:2});
}));
test('expired deadline after original callback blocks receipt',()=>control(async f=>{
  f.closeHook(async()=>f.clock(1000));await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:1,read:0,write:0});
}));
test('terminal read rejection retains original cause and cannot replay',()=>control(async f=>{
  const lost=Error('terminal reply lost',{cause:null});f.readHook(async()=>{throw lost;});
  await assert.rejects(f.scope.complete(),x=>x===lost);f.readHook(async()=>{});await assert.rejects(f.scope.complete());
  assert.equal(f.scope.secondary[0],lost);assert.equal(f.scope.primary,f.primary);assert.deepEqual(f.counts,{close:1,read:1,write:0});
}));
test('changed accepted effects or pending reference refuses before callback',()=>control(async f=>{
  const original=f.operation.nodeApply.pending;f.operation.nodeApply.pending={...original};await assert.rejects(f.scope.complete());
  f.operation.nodeApply.pending=original;f.operation.nodeApply.phases[0].value.effect_possible=false;await assert.rejects(f.scope.complete());assert.equal(f.counts.close,0);
}));

test('ID drift during durable writer cannot publish witness; restored original repairs storage only',()=>control(async f=>{
  f.writeHook(async()=>{f.operation.id='foreign-operation';});
  await assert.rejects(f.scope.complete());assert.equal(f.scope.state.durable,false);
  assert.equal(JSON.parse(await readFile(join(f.directory,'partial.json'))).operation_id,'original');
  await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:1,read:1,write:1});
  f.operation.id='original';f.writeHook(async()=>{});
  assert.equal(unionCleanupWitness(await f.scope.complete(),f.operation),true);
  assert.deepEqual(f.counts,{close:1,read:1,write:2});assert.equal(f.scope.primary,f.primary);
}));
test('cached receipt writer refusal rejects foreign ID and restores without Close/read replay',()=>control(async f=>{
  const refusal=Error('fsync refusal',{cause:0});f.writeHook(async()=>{throw refusal;});
  await assert.rejects(f.scope.complete(),e=>e===refusal);
  f.operation.id='foreign-operation';f.writeHook(async()=>{});await assert.rejects(f.scope.complete());
  assert.deepEqual(f.counts,{close:1,read:1,write:1});assert.equal(f.scope.secondary[0],refusal);
  f.operation.id='original';await f.scope.complete();assert.deepEqual(f.counts,{close:1,read:1,write:2});
  assert.equal(JSON.parse(await readFile(join(f.directory,'partial.json'))).operation_id,'original');
}));
test('changing both live ID and request never rebinds original ID',()=>control(async f=>{
  f.operation.id='foreign-operation';f.operation.parameters.operation_id='foreign-operation';
  await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:0,read:0,write:0});
}));

for (const id of [undefined,null,'', 'foreign-operation'])
 test('mint refuses missing or request-mismatched original ID '+String(id),async()=>{
  await assert.rejects(fixture(operation=>{operation.id=id;}));
 });
