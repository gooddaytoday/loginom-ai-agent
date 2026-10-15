import test,{mock} from 'node:test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {renameSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture,request,workflow} from '../../test/import-original-opening.fixture.mjs';
const root=process.env.IMPORT_RUNTIME_ROOT?pathToFileURL(process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../../',import.meta.url);
const url=p=>new URL(p,root);
const require=createRequire(url('client/lib/bridge.mjs'));
const sdk=p=>pathToFileURL(require.resolve(p).replace('/dist/cjs/','/dist/esm/')).href;
const executor=await import(url('client/lib/executor.mjs'));
const actions=await import(url('client/lib/action-catalog.mjs'));
const skill=await import(url('client/lib/skill.mjs'));
const resource=await import(url('src/acceptance/import-preconfig-adapter-v1.mjs'));
const {bindCaptureRuntime}=await import(url('src/retained-capture.mjs'));
let current;
// External MCP services/registration/preparation are explicit doubles. The
// complete bridge closure, serial gate, original procedures/slot/adapter and
// publication writer below are production code; Native VM and IPC are real.
class ExternalClient {
 constructor(id){this.browser=id.name==='loginom-dock-browser';if(this.browser)current.browser=this;}
 async connect(t){this.transport=t;}
 async close(){this.transport?.onclose?.();}
 async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object',properties:{}}}]};}
 async callTool({arguments:{code}},extra,options){return {content:[{type:'text',text:JSON.stringify(await current.f.execute(code,options))}]};}
}
class Transport{}
mock.module(sdk('@modelcontextprotocol/sdk/client/index.js'),{namedExports:{Client:ExternalClient}});
mock.module(sdk('@modelcontextprotocol/sdk/client/stdio.js'),{namedExports:{StdioClientTransport:Transport,getDefaultEnvironment:()=>({})}});
mock.module(sdk('@modelcontextprotocol/sdk/client/streamableHttp.js'),{namedExports:{StreamableHTTPClientTransport:Transport}});
mock.module(url('client/lib/action-catalog.mjs').href,{namedExports:{...actions,pinActionCatalog:async()=>({pins:{},compatibility:{loginom_build:'7.4.2'},actions:new Map(),selectors:new Map()})}});
mock.module(url('client/lib/skill.mjs').href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({})}});
mock.module(url('client/lib/executor.mjs').href,{namedExports:{...executor,createActionRuntime:()=>current.f.runtime}});
const {createBridge}=await import(url('client/lib/bridge.mjs'));
async function setup(options={}){
 const f=await fixture({...options,unbound:true,candidate:true});current={f};
 const session=f.state.session;
 Object.assign(session.metadata,{client:'fixture',workspaceReady:true,targetIdentity:{loginom_build:'7.4.2'}});
 Object.assign(session.metadata.workspacePreparation.state,{status:'READY',authenticated:true,target_verified:true,loginom_account:'account',workflow_ref:workflow,package_ref:{path:f.retained.binding.packagePath}});
 session.save=async()=>{};session.artifactStore={};
 // Preserve original owner/binding/state; only registration resource uses the
 // actual addressed fixed module bytes, never a ready node/operation handle.
 const {retainCaptureOwner}=await import(url('src/retained-capture.mjs'));
 const fixed=Object.freeze({path:'runtime/src/acceptance/import-preconfig-adapter-v1.mjs',sha256:createHash('sha256').update(await readFile(url('src/acceptance/import-preconfig-adapter-v1.mjs'))).digest('hex')});
 const retained=retainCaptureOwner(f.state,f.retained.binding,fixed);
 const registration=Object.freeze({mode:'readonly',resource:fixed,validate:resource.validateCaptureResult});
 const admission={retained,registration,binding:retained.binding,harness:resource.captureImportPreconfig};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',endpoint:'https://fixture.invalid',apiKey:'fixture',loginomUrl:'https://fixture.invalid'},session,{browserTransport:new Transport(),acceptanceCapture:admission});
 f.state.bridge=bridge;f.state.client=current.browser;bindCaptureRuntime(retained,bridge,current.browser);
 const original=request(),signal=f.controller.signal;
 return {...f,bridge,retained,admission,original,signal,open:()=>bridge.openImportPreconfig(original,{retained,signal}),capture:()=>bridge.captureAcceptance({signal})};
}
test('private bridge caller -> serial gate -> original opening -> exact latch -> fixed read/record; ordinary gate retained',async()=>{
 const f=await setup();try{
  assert.equal(f.bridge.catalog.tools.some(t=>/preconfig/i.test(t.name)),false);
  const a=f.open(),b=f.open();assert.equal(a,b);const node=await a;
  assert.equal(node.request.operation_id,'opening');assert.equal(node.opening.phase,'open');assert.notEqual(node.opening,node.nativeOpening);
  assert.equal(node.owner,f.retained);assert.equal(node.signal,f.signal);
  const result=await f.capture();assert.equal(result.diagnosticRead,true);assert.equal(result.cleanupComplete,false);
  assert.equal(result.receipt.status,'DIAGNOSTIC_READ');assert.equal(result.receipt.close_authority,false);
  assert.equal(result.receipt.publication.operation_id,'opening');assert.equal(f.calls.filter(c=>c.mode==='read').length,1);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  assert.equal(f.operation().nodeApply.effect_possible,true);
  assert.equal(f.bridge.hasUnsettledWork(),true);assert.throws(()=>f.runtime.assertPreparationAllowed());
  await assert.rejects(f.bridge.close(),/DIAGNOSTIC_RETAINED/);
  await assert.rejects(f.capture());assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
  const disk=JSON.parse(await readFile(f.state.session.directory+'/acceptance-capture.json','utf8'));
  assert.equal(disk.receipt.publication.operation_id,'opening');
 }finally{await f.cleanup();}
});
for(const [name,change] of Object.entries({foreignOwner:f=>{f.state.startupOwner={};},foreignPage:f=>{f.state.startupOwner.page={};},lease:f=>{f.state.startupOwner.generation++;},path:f=>{f.state.session.metadata.workspacePreparation.state.package_ref.path='/foreign.lgp';},preparation:f=>{f.state.session.metadata.workspacePreparation={};},wrongKind:f=>{f.admission.binding=Object.freeze({...f.admission.binding,harness:'calculator-grouped-before-done-v1'});},resource:f=>{f.admission.registration=Object.freeze({...f.admission.registration,resource:{}});},controller:f=>{f.state.controller=new AbortController();}}))test('private admission refuses '+name+' before opening',async()=>{
 const f=await setup();try{change(f);assert.throws(f.open);assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,0);}finally{await f.cleanup();}
});
for(const primary of [Error('lost opening',{cause:0}),undefined,null,false,0,''])test('first opening refusal cached without replay '+String(primary),async()=>{
 const f=await setup({beforeTransport:({code})=>{if(code.includes('"mode":"complete"'))throw primary;}});try{
  for(let i=0;i<2;i++)await assert.rejects(f.open(),e=>primary instanceof Error?e.message===primary.message&&e.cause===0:e===primary);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);assert.equal(f.operation().nodeApply.effect_possible,true);
  await assert.rejects(f.capture());await assert.rejects(f.bridge.close(),e=>primary instanceof Error?e.message===primary.message:e===primary);
  assert.equal(f.calls.filter(c=>c.mode==='read').length,0);
 }finally{await f.cleanup();}
});
for(const code of ['port.parent={}','card.Controller.Node.data.node.ParentNode.FGuid="foreign"','let turn=0;workspace.getActiveTab=()=>{card.Controller.Node.data.node.ParentNode.FGuid=(++turn%2===1)?"original-import":"foreign";return card;}'])test('fixed read refuses original binding drift before sample '+code,async()=>{
 const f=await setup();try{await f.open();vm.runInContext(code,f.native);await assert.rejects(f.capture());assert.equal(f.calls.filter(c=>c.mode==='read').length,0);assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);}finally{await f.cleanup();}
});
test('changed request and unrelated ordinary apply cannot replace original latch',async()=>{
 const f=await setup();try{await f.open();assert.throws(()=>f.bridge.openImportPreconfig({...f.original,operation_id:'other'},{retained:f.retained,signal:f.signal}));
  await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}));
  const result=await f.capture();assert.equal(result.receipt.publication.operation_id,'opening');assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
 }finally{await f.cleanup();}
});
test('substitution after opening await refuses latch and retains custody',async()=>{
 const f=await setup({afterRecord:({event,state})=>{if(event.phase==='node_phase_completed'&&event.receipt.phase==='open')state.startupOwner.page={};}});try{
  await assert.rejects(f.open());await assert.rejects(f.capture());assert.equal(f.calls.filter(c=>c.mode==='read').length,0);assert.equal(f.operation().nodeApply.effect_possible,true);
 }finally{await f.cleanup();}
});

test('guarded capture storage repair preserves primary refusal without reader/native replay',async()=>{
 let moved=false;
 const f=await setup({afterRecord:({event,state})=>{if(event.event==='fixed_import_preconfigure_observation'){renameSync(state.session.directory,state.session.directory+'-held');moved=true;}}});
 try {
  await f.open();let primary;
  try{await f.capture();assert.fail('must refuse missing evidence directory');}catch(e){primary=e;assert.equal(e.code,'ENOENT');}
  assert.equal(f.calls.filter(c=>c.mode==='read').length,1);
  renameSync(f.state.session.directory+'-held',f.state.session.directory);moved=false;
  await assert.rejects(f.bridge.close(),e=>e===primary);
  const evidence=JSON.parse(await readFile(f.state.session.directory+'/acceptance-capture.json','utf8'));
  assert.equal(evidence.receipt.publication.operation_id,'opening');
  assert.equal(f.calls.filter(c=>c.mode==='read').length,1);assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  assert.equal(f.bridge.hasUnsettledWork(),true);
 }finally{if(moved)renameSync(f.state.session.directory+'-held',f.state.session.directory);await f.cleanup();}
});
test('deadline expiry after opening refuses sample and preserves pending original',async()=>{
 const f=await setup();try{await f.open();f.operation().nodeApply.deadline=Date.now()-1;await assert.rejects(f.capture());assert.equal(f.calls.filter(c=>c.mode==='read').length,0);}finally{await f.cleanup();}
});
test('current owner substitution after awaited sample refuses before bridge persistence',async()=>{
 const f=await setup({afterTransport:({code,state})=>{if(code.includes('"mode":"read"'))state.startupOwner.page={};}});try{await f.open();await assert.rejects(f.capture());assert.equal(f.calls.filter(c=>c.mode==='read').length,1);assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);}finally{await f.cleanup();}
});
test('ordinary public node_apply route refuses held opening and cannot relatch',async()=>{
 const f=await setup();try{await f.open();const handler=f.bridge.server._requestHandlers.get('tools/call');
  const result=await handler({method:'tools/call',params:{name:'dock_node_apply',arguments:{operation_id:'foreign'}}},{signal:f.signal});
  assert.equal(result.structuredContent.request_rejected,true);assert.equal(result.structuredContent.phase,'request_rejected');const captured=await f.capture();assert.equal(captured.receipt.publication.operation_id,'opening');assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
 }finally{await f.cleanup();}
});
for(const [name,change] of Object.entries({account:f=>{f.state.startupOwner.account='foreign';},context:f=>{f.state.startupOwner.context={};},client:f=>{f.state.client={};},pending:f=>{f.operation().nodeApply.pending={phase:'UNKNOWN'};},missingNode:f=>{f.operation().nodeApply.node=undefined;},foreignOperation:f=>{f.operation().nodeApply.request.operation_id='foreign';},preparationAfter:f=>{f.state.session.metadata.workspacePreparation.state.document_id='foreign';}}))test('latched fixed capture refuses '+name+' before sample',async()=>{
 const f=await setup();try{await f.open();change(f);await assert.rejects(f.capture());assert.equal(f.calls.filter(c=>c.mode==='read').length,0);assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,0);}finally{await f.cleanup();}
});
test('expired original grant refuses admission without deadline renewal',async()=>{
 const f=await setup();const originalNow=Date.now;try{Date.now=()=>f.retained.binding.expires+1;assert.throws(f.open);assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,0);}finally{Date.now=originalNow;await f.cleanup();}
});
test('missing verified original delivery refuses before opening and caches failure',async()=>{
 const f=await setup({mutateDelivery:records=>{records.length=0;}});try{for(let i=0;i<2;i++)await assert.rejects(f.open());assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,0);await assert.rejects(f.capture());}finally{await f.cleanup();}
});
test('ambiguous duplicate original delivery refuses before opening',async()=>{
 const f=await setup({mutateDelivery:records=>{records.push({...records[0]});}});try{await assert.rejects(f.open());assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,0);}finally{await f.cleanup();}
});
test('repair tuple refusal retains first storage error and performs no replay',async()=>{
 let moved=false;const f=await setup({afterRecord:({event,state})=>{if(event.event==='fixed_import_preconfigure_observation'){renameSync(state.session.directory,state.session.directory+'-held');moved=true;}}});
 try{await f.open();let primary;try{await f.capture();assert.fail('must refuse missing directory');}catch(e){primary=e;assert.equal(e.code,'ENOENT');}
  renameSync(f.state.session.directory+'-held',f.state.session.directory);moved=false;f.state.startupOwner.account='foreign';
  await assert.rejects(f.bridge.close(),e=>e===primary);assert.equal(f.calls.filter(c=>c.mode==='read').length,1);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
 }finally{if(moved)renameSync(f.state.session.directory+'-held',f.state.session.directory);await f.cleanup();}
});

// Atomic private capture must create the genuine original slot itself; callers
// no longer need a ready handle or a separate open/controller lifetime.
test('owner request -> bridge opening -> exact latch -> one fixed capture',async()=>{
 const f=await setup();try {
  const result=await f.bridge.captureAcceptance({signal:f.signal,request:f.original});
  assert.equal(result.receipt.publication.operation_id,f.original.operation_id);
  assert.equal(result.receipt.opening_effect,true);assert.equal(result.diagnosticRead,true);
  assert.equal(result.cleanupComplete,false);assert.equal(result.receipt.close_authority,false);
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  assert.equal(f.calls.filter(c=>c.mode==='read').length,1);
  assert.equal(f.events.filter(e=>e.event==='fixed_import_preconfigure_observation').length,1);
  await assert.rejects(f.bridge.captureAcceptance({signal:f.signal,request:f.original}));
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,1);
  assert.deepEqual(f.dispatch,{configure:0,mapping:0,finish:0,execute:0});
 }finally{await f.cleanup();}
});
for(const [label,change] of Object.entries({mapping:r=>r.mappings=[{direction:'output',port:0}],creation:r=>r.target.kind='new',execute:r=>r.finish='execute',foreign:r=>r.document_id='foreign'}))test('atomic opening refuses '+label+' before native opening',async()=>{
 const f=await setup();try{change(f.original);await assert.rejects(f.bridge.captureAcceptance({signal:f.signal,request:f.original}));
  assert.equal(f.calls.filter(c=>c.verb==='begin_wizard').length,0);assert.equal(f.calls.filter(c=>c.mode==='read').length,0);
 }finally{await f.cleanup();}
});
