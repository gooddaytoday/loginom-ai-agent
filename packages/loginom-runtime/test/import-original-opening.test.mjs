import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture,request} from './import-original-opening.fixture.mjs';
import {pathToFileURL} from 'node:url';
const root=process.env.IMPORT_RUNTIME_ROOT?pathToFileURL(process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const {createImportPreconfigAdapter}=await import(new URL('src/acceptance/import-preconfig-adapter-v1.mjs',root));

test('production existing opening -> original native slot -> fixed read/record; no configure or finish',async()=>{
 const f=await fixture();try {
  const node=await f.openNode(),op=f.operation();
  assert.equal(f.runtime.retainCaptureNode('opening'),node);
  assert.equal(node.opening.phase,'open');assert.equal(node.opening.effect_possible,true);
  assert.equal(node.nativeOpening.status,'completed');assert.notEqual(node.opening,node.nativeOpening);
  assert.equal(op.nodeApply.effect_possible,true);assert.equal(op.cleanupConfirmed,false);
  assert.equal(f.runtime.hasUnsettledWork(),true);assert.throws(()=>f.runtime.assertPreparationAllowed());
  const adapter=f.adapterFor(node),receipt=await adapter.readPreconfigSample();
  assert.equal(receipt.status,'DIAGNOSTIC_READ');assert.equal(receipt.opening_effect,true);
  for(const key of ['native_proof','configure_authority','close_authority','preconfig_complete'])assert.equal(receipt[key],false);
  assert.equal(receipt.observation.source.source_path.value,'/account/data.csv');
  assert.deepEqual(node.state.phases.map(p=>p.phase),['source','target','open']);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  assert.deepEqual(await adapter.readPreconfigSample(),receipt);
  assert.deepEqual(await f.adapterFor(node).readPreconfigSample(),receipt);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  assert.equal(await f.openNode(),node);
  assert.throws(()=>adapter.requestReadonlyClose(),/CONFIRMED_SAVE_REQUIRED/);
  await assert.rejects(f.runtime.runNodeApply(request()),/OPENING_RETAINED/);
  assert.deepEqual(f.calls.filter(c=>c.verb).map(c=>c.verb),['click','begin_wizard']);
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
  assert.equal(receipt.observation.current_native_verified,false);
 }finally{await f.cleanup();}
});
for(const [name,code] of Object.entries({account:'connection.UserName="foreign"',port:'port.parent={}',index:'port.FPortIndex=1',controller:'card.Controller.FController={}',root:'card.Controller.FController.FView.el.dom={}',preparation:'globalThis.__loginomDockPreparationV1={}',source:'input.value="/account/foreign.csv"'})) {
 test('original opening refuses changed '+name,async()=>{
  const f=await fixture();try {const node=await f.openNode();vm.runInContext(code,f.native);
   const adapter=f.adapterFor(node);
   if(name==='source'){const r=await adapter.readPreconfigSample();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.observation.status,'REFUSED');}
   else await assert.rejects(adapter.readPreconfigSample());
   assert.equal(f.operation().cleanupConfirmed,false);assert.equal(f.runtime.hasUnsettledWork(),true);
   assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  }finally{await f.cleanup();}
 });
}
for(const primary of [new Error('opening transport',{cause:0}),undefined,null,false,0,''])test('lost opening preserves first rejection, no replay '+String(primary),async()=>{
 const f=await fixture({beforeTransport:({code})=>{if(code.includes('"mode":"complete"'))throw primary;}});
 try {
  for(let i=0;i<2;i++)await assert.rejects(f.openNode(),e=>primary instanceof Error?e.message===primary.message&&e.cause===0:e===primary);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  assert.equal(f.operation().nodeApply.pending.phase,'open');assert.equal(f.runtime.hasUnsettledWork(),true);
 }finally{await f.cleanup();}
});
test('durable opening receipt loss refuses handle, retains effect and original slot without reopening',async()=>{
 const primary=Error('opening fsync',{cause:false});
 const f=await fixture({beforeRecord:({event})=>{if(event.phase==='node_phase_completed'&&event.receipt.phase==='open')throw primary;}});
 try {for(let i=0;i<2;i++)await assert.rejects(f.openNode(),e=>e===primary);
  assert.equal(f.operation().nodeApply.pending.phase,'open');assert.equal(f.operation().nodeApply.effect_possible,true);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
 }finally{await f.cleanup();}
});
test('read persistence refusal is cached without sample/open/native replay',async()=>{
 const primary=Error('read fsync',{cause:0});
 const f=await fixture({beforeRecord:({event})=>{if(event.event==='fixed_import_preconfigure_observation')throw primary;}});
 try {const node=await f.openNode(),adapter=f.adapterFor(node);for(let i=0;i<2;i++)await assert.rejects(adapter.readPreconfigSample(),e=>e===primary);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);assert.equal(f.operation().cleanupConfirmed,false);
 }finally{await f.cleanup();}
});
test('native substitution after awaited sample refuses before record',async()=>{
 const f=await fixture({afterTransport:({native,code})=>{if(code.includes('"mode":"read"'))vm.runInContext('port.data={}',native);}});
 try {const node=await f.openNode(),adapter=f.adapterFor(node);await assert.rejects(adapter.readPreconfigSample());
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);
 }finally{await f.cleanup();}
});
test('owner substitution after awaited read record refuses publication',async()=>{
 const f=await fixture({afterRecord:({state,event})=>{if(event.event==='fixed_import_preconfigure_observation')state.startupOwner.page={};}});
 try {const node=await f.openNode(),adapter=f.adapterFor(node);await assert.rejects(adapter.readPreconfigSample());
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
 }finally{await f.cleanup();}
});
test('foreign public private-option copy cannot mint opening',async()=>{
 const f=await fixture();try {await assert.rejects(f.runtime.runNodeApply(request(),{signal:f.controller.signal,preconfigKey:{kind:'existing-import-preconfig'}}));assert.equal(f.events.length,0);}
 finally{await f.cleanup();}
});

for(const [name,mutate] of Object.entries({
 owner:f=>f.state.startupOwner={},Page:f=>f.state.startupOwner.page={},context:f=>f.state.startupOwner.context={},
 bridge:f=>f.state.bridge={},client:f=>f.state.client={},preparation:f=>f.state.session.metadata.workspacePreparation={},
 session:f=>f.state.session.metadata.sessionId='foreign',generation:f=>f.state.startupOwner.generation=8,
 source:f=>f.operation().nodeApply.phases[0].value.source.destination='/account/foreign.csv',
 opening:f=>f.operation().captureOpening={...f.operation().captureOpening},
 node:f=>f.operation().nodeApply.node={...f.operation().nodeApply.node},
 pending:f=>f.operation().nodeApply.pending={phase:'configure'},
 }))test('fixed read rejects current '+name+' substitution before any sample',async()=>{
 const f=await fixture();try {const node=await f.openNode();mutate(f);assert.throws(()=>f.adapterFor(node));
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
 }finally{await f.cleanup();}
});
for(const [name,mutate] of Object.entries({missing:d=>d.splice(0),duplicate:d=>d.push(d[0]),UNKNOWN:d=>d[0].outcome.status='AMBIGUOUS',foreign:d=>d[0].outcome.output.server_copy_verification.destination='/foreign/data.csv'}))test('opening rejects '+name+' delivery before target/open dispatch',async()=>{
 const f=await fixture({mutateDelivery:mutate});try {await assert.rejects(f.openNode());assert.equal(f.calls.filter(c=>c.verb).length,0);assert.throws(()=>f.runtime.retainCaptureNode('opening'));}
 finally{await f.cleanup();}
});
for(const code of ['__loginomDockPreparationV1.receipts.set("prepared",{...record})','n.FPorts[0].FCollection=[port,port]','Object.defineProperty(port,"data",{get:()=>undefined})',
 'workspace.getActiveTab=()=>{connection.UserName="foreign";return card}'])test('native inert inventory/slot drift refuses '+code,async()=>{
 const f=await fixture();try {const node=await f.openNode();vm.runInContext(code,f.native);await assert.rejects(f.adapterFor(node).readPreconfigSample());
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);
 }finally{await f.cleanup();}
});
test('all private opening/read transports retain shorter grant budget',async()=>{
 const f=await fixture({grantBudget:6000});try {const originalExpiry=f.retained.binding.expires,node=await f.openNode();await f.adapterFor(node).readPreconfigSample();
  assert.ok(node.deadline<=f.retained.binding.expires);assert.ok(f.calls.filter(c=>c.timeout!==undefined).every(c=>c.timeout<=6000&&c.timeout>0));
  assert.equal(f.retained.binding.expires,originalExpiry);
 }finally{await f.cleanup();}
});
test('record-time expiry refuses publication without renewed deadline or read replay',async()=>{
 const f=await fixture({afterRecord:({event,heldOperation})=>{if(event.event==='fixed_import_preconfigure_observation')heldOperation.nodeApply.deadline=Date.now()-1;}});
 try {const node=await f.openNode(),adapter=f.adapterFor(node);await assert.rejects(adapter.readPreconfigSample());
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
 }finally{await f.cleanup();}
});
for(const primary of [new Error('read transport',{cause:0}),undefined,null,false,0,''])test('cached read first rejection across fixed resource instances '+String(primary),async()=>{
 const f=await fixture({beforeTransport:({code})=>{if(code.includes('"mode":"read"'))throw primary;}});
 try {const node=await f.openNode();
  for(let i=0;i<2;i++)await assert.rejects(f.adapterFor(node).readPreconfigSample(),e=>primary instanceof Error?e.message===primary.message&&e.cause===0:e===primary);
  assert.equal(f.calls.filter(c=>c.mode==='read').length,1);assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
 }finally{await f.cleanup();}
});
for(const [name,mutate] of Object.entries({foreign:c=>c.publication=Object.freeze({...c.publication,node_id:'foreign'}),missing:c=>{const p={...c.publication};delete p.deadline;c.publication=Object.freeze(p);},runtime:c=>c.runtime={assertImportPreconfigIdle:()=>true},identity:c=>c.identity=Object.freeze({...c.identity}),signal:c=>c.signal=new AbortController().signal}))test('fixed resource refuses '+name+' context before read',async()=>{
 const f=await fixture();try {const node=await f.openNode(),context=f.contextFor(node);mutate(context);assert.throws(()=>createImportPreconfigAdapter(context));assert.equal(f.calls.filter(c=>c.mode==='read').length,0);}
 finally{await f.cleanup();}
});

test('final provider GUID drift refuses before sample/record and caches refusal without reopening',async()=>{
 const f=await fixture();try {
  const node=await f.openNode();
  vm.runInContext('let guidTurn=0;workspace.getActiveTab=()=>{card.Controller.Node.data.node.ParentNode.FGuid=(++guidTurn%2===1)?"original-import":"foreign";return card;}',f.native);
  const adapter=f.adapterFor(node);
  for(let i=0;i<2;i++)await assert.rejects(adapter.readPreconfigSample(),/FINAL_WIZARD_BINDING/);
  assert.equal(f.calls.filter(c=>c.mode==='read').length,0);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  assert.equal(f.operation().nodeApply.effect_possible,true);
  assert.equal(f.operation().cleanupConfirmed,false);
  assert.equal(f.runtime.hasUnsettledWork(),true);
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
 }finally{await f.cleanup();}
});

const native742=`bg.app.Application.FInstance.FMainForm.FMapTree=bg.app.Application.FInstance.FMap;delete bg.app.Application.FInstance.FMap;
connection.FUsername=connection.UserName;connection.FSession=connection.Session;connection.FConnected=connection.Connected;
delete connection.UserName;delete connection.Session;delete connection.Connected;
Object.setPrototypeOf(connection,Object.create(Object.prototype,{UserName:{get:function () { return this.FUsername; },configurable:true},Session:{get:function () { return this.FSession; },configurable:true},Connected:{get:function () { return !!this.FConnected; },configurable:true}}));`;
test('measured742 canonical MapTree/inherited getter ABI builds original slot without invoking getters',async()=>{
 const f=await fixture();try{vm.runInContext(native742,f.native);const node=await f.openNode(),r=await f.adapterFor(node).readPreconfigSample();
  assert.equal(r.status,'DIAGNOSTIC_READ');assert.equal(r.native_proof,false);assert.equal(r.opening_effect,true);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);assert.equal(f.calls.filter(c=>c.mode==='read').length,1);
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
 }finally{await f.cleanup();}
});
for(const [name,code] of Object.entries({
 map:'bg.app.Application.FInstance.FMainForm.FMapTree={}',
 session:'connection.FSession={}',
 connected_type:'connection.FConnected=1',
 missing_session:'connection.FSession=undefined',
 cached_accessor:'Object.defineProperty(connection,"FUsername",{get:()=>"account"})',
 getter:'Object.defineProperty(Object.getPrototypeOf(connection),"UserName",{get:()=>"account",configurable:true})',
 instance:'bg.app.Application.FInstance={}',
 same_getter_new_binding:'Object.defineProperty(Object.getPrototypeOf(connection),"UserName",{get:function () { return this.FUsername; },configurable:true})'
}))test('canonical742 final provider refuses '+name+' drift before sample/record',async()=>{
 const f=await fixture();try{vm.runInContext(native742,f.native);const node=await f.openNode();
  vm.runInContext('let finalTurn=0;workspace.getActiveTab=()=>{if(++finalTurn===2){'+code+'}return card;}',f.native);
  await assert.rejects(f.adapterFor(node).readPreconfigSample());
  assert.equal(f.calls.filter(c=>c.mode==='read').length,0);assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);assert.equal(f.operation().cleanupConfirmed,false);
 }finally{await f.cleanup();}
});
test('unknown prototype getter refuses without invoking foreign function',async()=>{
 const f=await fixture();try{vm.runInContext(native742+'globalThis.getterCalls=0;Object.defineProperty(Object.getPrototypeOf(connection),"Connected",{get(){getterCalls++;return true;},configurable:true});',f.native);
  await assert.rejects(f.openNode());assert.equal(vm.runInContext('getterCalls',f.native),0);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,0);
 }finally{await f.cleanup();}
});
