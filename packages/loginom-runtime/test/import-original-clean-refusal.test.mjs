import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {fixture} from './import-original-opening.fixture.mjs';
const root=process.env.IMPORT_RUNTIME_ROOT?pathToFileURL(process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const {createImportOriginalCleanRefusal}=await import(new URL('src/acceptance/import-original-clean-refusal-v1.mjs',root));
async function setup(options={}){
 const f=await fixture(options),channel=new MessageChannel();let sequence=0,reads=0;const pending=new Map(),budgets=[];
 channel.port2.on('message',r=>{const p=pending.get(r.id);pending.delete(r.id);r.failure?p.reject(r.failure.value):p.resolve(r.value);});
 channel.port1.on('message',async({id,args,opts})=>{
  try{
   reads++;budgets.push(opts.timeout);options.beforeClean?.(f);
   let facts=await vm.runInNewContext('('+args.arguments.code+')(page)',{page:f.state.startupOwner.page});
   if(options.syntheticCandidate)facts={status:'OBSERVED_CLEAN_CANDIDATE',dirty:false,running:false,native_identity:true,close_authority:false};
   if(options.mutateReply)facts=options.mutateReply(facts);
   options.afterClean?.(f);
   channel.port1.postMessage({id,value:{content:[{type:'text',text:JSON.stringify(facts)}]}});
  }catch(value){channel.port1.postMessage({id,failure:{value}});}
 });
 // Same original retained client. Transport implementation is a double backed
 // by real MessageChannel and separate serialized Native Page realm.
 f.state.client.callTool=(args,extra,opts)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});channel.port2.postMessage({id,args,opts:{timeout:opts.timeout}});});
 const node=await f.openNode();
 const context={retained:f.retained,node,identity:f.identity,runtime:f.runtime,signal:f.controller.signal,record:f.onRecord};
 const component=createImportOriginalCleanRefusal(context);
 return {...f,node,component,context,reads:()=>reads,budgets,
  async cleanup(){channel.port1.close();channel.port2.close();await f.cleanup();}};
}
test('original procedure -> fixed serialized read -> record -> opaque refusal; no clean/Close authority',async()=>{
 const f=await setup();try{
  const a=f.component.observe(),b=f.component.observe();assert.equal(a,b);const receipt=await a;
  assert.equal(receipt.status,'REFUSED');assert.equal(receipt.native_proof,false);assert.equal(receipt.close_authority,false);assert.equal(receipt.clean_verified,false);
  assert.equal(f.reads(),1);assert.equal(f.events.filter(e=>e.event==='fixed_import_clean_refusal').length,1);
  const event=f.events.find(e=>e.event==='fixed_import_clean_refusal');assert.equal(event.facts.status,'UNKNOWN');
  assert.equal(event.publication.operation_id,'opening');assert.equal(event.result.close_authority,false);
  const summary=await f.component.inspect(receipt.evidence);assert.equal(summary.close_authority,false);
  for(let i=0;i<2;i++)await assert.rejects(f.component.requestReadonlyClose(receipt.evidence),/CONFIRMED_SAVE_REQUIRED/);
  assert.equal(f.reads(),1);assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);assert.equal(f.operation().nodeApply.effect_possible,true);
  assert.throws(()=>f.runtime.assertPreparationAllowed());assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
 }finally{await f.cleanup();}
});
test('synthetic candidate/dirty=false cannot replace missing qualified packet',async()=>{
 const f=await setup({syntheticCandidate:true});try{const r=await f.component.observe();assert.equal(r.status,'REFUSED');assert.equal(r.native_proof,false);assert.equal(r.clean_verified,false);assert.equal(r.close_authority,false);await assert.rejects(f.component.requestReadonlyClose(r.evidence),/CONFIRMED_SAVE_REQUIRED/);}finally{await f.cleanup();}
});
for(const [name,copy] of Object.entries({empty:()=>({}),json:e=>JSON.parse(JSON.stringify(e)),spread:e=>({...e}),clone:e=>structuredClone(e),boolean:()=>({native_proof:true,dirty:false,close_authority:true}),model:()=>Object.freeze(Object.create(null))}))test('opaque evidence refuses '+name+' copy/model token',async()=>{
 const f=await setup();try{const r=await f.component.observe();await assert.rejects(f.component.inspect(copy(r.evidence)),/OPAQUE_EVIDENCE/);await assert.rejects(f.component.requestReadonlyClose(copy(r.evidence)),/OPAQUE_EVIDENCE/);assert.equal(f.reads(),1);}finally{await f.cleanup();}
});
test('same original node returns cached component/read across construction',async()=>{
 const f=await setup();try{const r=await f.component.observe(),other=createImportOriginalCleanRefusal(f.context);assert.equal(other,f.component);assert.equal(await other.observe(),r);assert.equal((await other.inspect(r.evidence)).close_authority,false);assert.equal(f.reads(),1);}finally{await f.cleanup();}
});
test('other original bridge cannot redeem opaque evidence',async()=>{
 const a=await setup(),b=await setup();try{const r=await a.component.observe();await b.component.observe();await assert.rejects(b.component.inspect(r.evidence),/OPAQUE_EVIDENCE/);await assert.rejects(b.component.requestReadonlyClose(r.evidence),/OPAQUE_EVIDENCE/);}finally{await a.cleanup();await b.cleanup();}
});
for(const primary of [Error('clean reply lost',{cause:0}),undefined,null,false,0,''])test('first clean transport rejection cached without replay '+String(primary),async()=>{
 const f=await setup({beforeClean:()=>{throw primary;}});try{for(let i=0;i<2;i++)await assert.rejects(f.component.observe(),e=>primary instanceof Error?e.message===primary.message&&e.cause===0:e===primary);assert.equal(f.reads(),1);assert.equal(f.events.filter(e=>e.event==='fixed_import_clean_refusal').length,0);assert.equal(f.operation().nodeApply.effect_possible,true);}finally{await f.cleanup();}
});
for(const primary of [Error('record refusal',{cause:false}),undefined,null,false,0,''])test('first record refusal cached without re-read '+String(primary),async()=>{
 const f=await setup({beforeRecord:({event})=>{if(event.event==='fixed_import_clean_refusal')throw primary;}});try{for(let i=0;i<2;i++)await assert.rejects(f.component.observe(),e=>primary instanceof Error?e.message===primary.message&&e.cause===false:e===primary);assert.equal(f.reads(),1);assert.equal(f.events.filter(e=>e.event==='fixed_import_clean_refusal').length,1);}finally{await f.cleanup();}
});
for(const [name,change] of Object.entries({owner:f=>{f.state.startupOwner={};},page:f=>{f.state.startupOwner.page={};},generation:f=>{f.state.startupOwner.generation++;},client:f=>{f.state.client={};},pending:f=>{f.operation().nodeApply.pending={phase:'UNKNOWN'};},preparation:f=>{f.state.session.metadata.workspacePreparation={};},guid:f=>vm.runInContext('card.Controller.Node.data.node.ParentNode.FGuid="foreign"',f.native)}))test('current binding drift refuses '+name+' before clean transport',async()=>{
 const f=await setup();try{change(f);await assert.rejects(async()=>f.component.observe());assert.equal(f.reads(),0);}finally{await f.cleanup();}
});
for(const [name,change] of Object.entries({page:f=>{f.state.startupOwner.page={};},generation:f=>{f.state.startupOwner.generation++;},guid:f=>vm.runInContext('card.Controller.Node.data.node.ParentNode.FGuid="foreign"',f.native)}))test('after awaited clean read substitution refuses '+name+' before record',async()=>{
 const f=await setup({afterClean:change});try{await assert.rejects(f.component.observe());assert.equal(f.reads(),1);assert.equal(f.events.filter(e=>e.event==='fixed_import_clean_refusal').length,0);}finally{await f.cleanup();}
});
test('generation drift after awaited record publishes no opaque evidence',async()=>{
 const f=await setup({afterRecord:({event,state})=>{if(event.event==='fixed_import_clean_refusal')state.startupOwner.generation++;}});try{await assert.rejects(f.component.observe());assert.equal(f.reads(),1);assert.equal(f.events.filter(e=>e.event==='fixed_import_clean_refusal').length,1);}finally{await f.cleanup();}
});
test('clean transport is bounded by original shorter node deadline',async()=>{
 const f=await setup();try{const deadline=f.node.deadline;await f.component.observe();assert.equal(f.node.deadline,deadline);assert.equal(f.budgets.length,1);assert.ok(f.budgets[0]>0&&f.budgets[0]<=deadline-Date.now()+1000);}finally{await f.cleanup();}
});
for(const code of ['Object.defineProperty(bg,"app",{get(){return {};}})','delete bg.app.Application.FInstance.FMap','port.parent={}'])test('unknown/accessor/foreign native objects cannot create authority '+code,async()=>{
 const f=await setup();try{vm.runInContext(code,f.native);let result;try{result=await f.component.observe();}catch{}if(result){assert.equal(result.status,'REFUSED');assert.equal(result.native_proof,false);assert.equal(result.close_authority,false);}assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});}finally{await f.cleanup();}
});
const candidateSetup=`
 const main=bg.app.Application.FInstance.FMainForm,map=bg.app.Application.FInstance.FMap;
 main.FMapTree=map;const pack=record.packageNode,workflow=record.nodeTargetWorkflowNode,leaf=card.Controller.Node.data.node,nt=leaf.ParentNode;
 workflow.ParentNode=pack;leaf.FGuid=nt.FGuid;leaf.FModelNode=nt.FModelNode;
 pack.PackageFileName='account/left.lgp';pack.Package={};pack.HasRunningNodes=()=>false;
 map.PackageNodes={Count:1,Items:()=>pack};map.HasRunningNodes=()=>false;
 connection.Session.IsPackageModified=async()=>false;record.request=JSON.stringify({session:'session'});
`;
for(const [name,extra] of Object.entries({supported_candidate:'',dirty:'connection.Session.IsPackageModified=async()=>true',unknown_dirty:'connection.Session.IsPackageModified=async()=>undefined',running:'map.HasRunningNodes=()=>true',duplicate_inventory:'map.PackageNodes.Count=2',accessor:'Object.defineProperty(pack,"Package",{get(){return {};}})',stale_binding:'connection.Session.IsPackageModified=async()=>{nt.FGuid="foreign";return false;}'}))test('existing reader '+name+' remains refusal without qualified full native packet',async()=>{
 const f=await setup();try{
  vm.runInContext('(()=>{'+candidateSetup+extra+'})()',f.native);let receipt;
  try{receipt=await f.component.observe();}catch(error){if(name!=='stale_binding')throw error;}
  if(receipt){assert.equal(receipt.status,'REFUSED');assert.equal(receipt.native_proof,false);assert.equal(receipt.close_authority,false);await assert.rejects(f.component.requestReadonlyClose(receipt.evidence),/CONFIRMED_SAVE_REQUIRED/);}
  if(name==='supported_candidate'){const event=f.events.find(e=>e.event==='fixed_import_clean_refusal');assert.equal(event.facts.status,'OBSERVED_CLEAN_CANDIDATE');assert.equal(event.facts.dirty,false);}
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
 }finally{await f.cleanup();}
});
test('legacy offline clean-model token cannot qualify original Close',async()=>{
 const f=await setup();try{
  const {createImportCleanModel}=await import(new URL('src/acceptance/import-clean-model-v1.mjs',root));
  const identity={...f.identity,workflow_id:'workflow',node_id:'original-import',read_started_at:Date.now()};
  const model=createImportCleanModel({assertCurrent:()=>f.node.assertCurrent(),deadline:f.node.deadline});
  const candidate=model.observe({...identity,status:'OBSERVED_CLEAN_CANDIDATE',dirty:false,running:false,dialogs:false,inventory:1,native_identity:true,read_only_observation:true,observed_at:Date.now()},identity);
  assert.equal(candidate.status,'OFFLINE_MODEL_PROOF');assert.equal(candidate.close_authority,false);
  await f.component.observe();await assert.rejects(f.component.inspect(candidate.proof),/OPAQUE_EVIDENCE/);
  await assert.rejects(f.component.requestReadonlyClose(candidate.proof),/OPAQUE_EVIDENCE/);assert.equal(f.reads(),1);
 }finally{await f.cleanup();}
});
