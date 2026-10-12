import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const base=process.env.IMPORT_RUNTIME_ROOT?pathToFileURL(process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const {createImportPreconfigAdapter,captureImportPreconfig,validateCaptureResult,IMPORT_ADAPTER_PATH}=await import(new URL('src/acceptance/import-preconfig-adapter-v1.mjs',base));
const {retainCaptureOwner,bindCaptureRuntime}=await import(new URL('src/retained-capture.mjs',base));
const {assertPreconfigSample}=await import(new URL('../../../docs/node-development/nodes/join/receiving/preconfig/consumer-contract.mjs',import.meta.url));
function fixture({afterRead,afterRecord,failRead,failRecord,reply}={}){
 const events=[],signal=new AbortController(),page={isClosed:()=>false},context={pages:()=>[page]};
 const binding=Object.freeze({revision:1,harness:'import-before-configure-v1',owner:'owner',run:'run',lease:'owner:run',generation:7,chat:'chat',account:'account',session:'session',admission:'admission',packagePath:'/account/left.lgp',expires:Date.now()+60000});
 const identity={session_id:'session',document_id:'doc',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',account:'account',package_path:binding.packagePath,loginom_build:'7.4.2'};
 const request={document_id:'doc',workflow_ref:{workflow_id:'workflow',tab_tid:identity.tab_tid,prefix:'MF;TF',navigation_path:[{tid:'root',label:'root'}]},target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'workflow',node_id:'node'}}};
 const opening={phase:'open',status:'verified',effect_possible:false,value:{verified:true,cleanup_complete:true}};
 const node={request,opening,signal:signal.signal,deadline:binding.expires,state:{pending:null,effect_possible:false,phases:[opening]},assertCurrent(){}};
 const owner={id:'native-owner',page,context,account:'account',origin:'https://fixture.invalid',generation:7,chat:'chat'};
 const session={directory:'/synthetic-owned-session',metadata:{sessionId:'session',clientRevision:'a'.repeat(40),workspacePreparation:{attempted:true,state:{status:'READY',created_draft:false}}}};
 const state={startupOwner:owner,session,controller:signal};state.captureStartupBinding=Object.freeze({...owner,owner});
 const resource=Object.freeze({path:IMPORT_ADAPTER_PATH,sha256:'a'.repeat(64)}),retained=retainCaptureOwner(state,binding,resource);
 state.bridge={};state.client={};bindCaptureRuntime(retained,state.bridge,state.client);
 const publication=Object.freeze({...identity,workflow_id:'workflow',node_id:'node'});
 const observation={revision:1,harness:binding.harness,...identity,status:'PARTIAL',complete:false,settings_applied:false,effect_possible:false,close_authority:false,reason:'UNKNOWN_NATIVE_ENUM_OUTPUT_ACTIVITY_FRESHNESS'};
 const runtime={hasActiveWork:()=>false,hasUnsettledWork:()=>false};
 const browser={async callTool({arguments:{code}}){events.push('read');assert.ok(code.includes('readImportSurface'));if(failRead)throw failRead.value;
  // Execute the actual serialized resource on missing-native doubles, never a fixture flag.
  const fn=/page.evaluate\(([\s\S]*),\{"session_id"/.exec(code)?.[1];
  const refused=vm.runInNewContext('('+fn+')',{document:{},Date})(identity);assert.equal(refused.status,'REFUSED');
  afterRead?.({state,node,owner,identity,runtime,browser});return {content:[{type:'text',text:JSON.stringify(reply??refused)}]};}};
 const record=async event=>{events.push('record');if(failRecord)throw failRecord.value;afterRecord?.({state,node,owner,identity,runtime,browser,event});};
 return {state,node,owner,identity,runtime,browser,events,signal,ctx:{retained,node,publication,identity,browser,record,runtime,signal:signal.signal}};
}
test('fixed adapter forwards actual serialized REFUSED and refuses consumer/Close without Save',async()=>{
 const f=fixture(),a=createImportPreconfigAdapter(f.ctx),r=await a.readPreconfigSample();assert.equal(validateCaptureResult(r,f.ctx),true);
 assert.equal(r.preconfig_complete,false);assert.equal(r.configure_authority,false);assert.equal(r.close_authority,false);assert.equal(r.native_proof,false);
 assert.throws(()=>assertPreconfigSample(r));assert.throws(()=>a.requestReadonlyClose({}));
 assert.deepEqual(await a.readPreconfigSample(),r);assert.deepEqual(f.events,['read','record']);
});
for(const key of ['page','context','account','generation','chat'])for(const when of ['afterRead','afterRecord'])test('adapter '+when+' foreign '+key,async()=>{
 const f=fixture({[when]:({owner})=>owner[key]='foreign'});await assert.rejects(captureImportPreconfig(f.ctx));assert.equal(f.events.filter(e=>e==='read').length,1);
});
for(const when of ['afterRead','afterRecord'])for(const key of ['session','metadata','directory','identity','phases','pending','effect','browser','work'])test('adapter '+when+' drift '+key,async()=>{
 const f=fixture({[when]:({state,node,identity,browser,runtime})=>{
  if(key==='session')state.session={...state.session};if(key==='metadata')state.session.metadata={...state.session.metadata};if(key==='directory')state.session.directory='foreign';if(key==='identity')identity.document_id='foreign';if(key==='phases')node.state.phases.push({phase:'configure',status:'verified',effect_possible:false});if(key==='pending')node.state.pending={};if(key==='effect')node.state.effect_possible=true;if(key==='browser')browser.callTool=async()=>{};if(key==='work')runtime.hasActiveWork=()=>true;
 }});await assert.rejects(captureImportPreconfig(f.ctx));
});
for(const key of ['target','resource','phase','unknown_phase','unknown_effect','pending','signal','publication'])test('adapter refuses before dispatch '+key,async()=>{
 const f=fixture();if(key==='target')f.node.request.target.kind='new';if(key==='resource')f.ctx.retained={...f.ctx.retained,resource:{path:'wrong'}};if(key==='phase')f.node.state.phases.push({phase:'finish',status:'verified',effect_possible:false});if(key==='unknown_phase')f.node.state.phases.push({phase:'mystery',status:'verified',effect_possible:false});if(key==='unknown_effect')f.node.state.effect_possible=undefined;if(key==='pending')f.node.state.pending={};if(key==='signal')f.ctx.signal=new AbortController().signal;if(key==='publication')f.ctx.publication={...f.ctx.publication};
 assert.throws(()=>createImportPreconfigAdapter(f.ctx));assert.deepEqual(f.events,[]);
});
for(const value of [Error('first',{cause:0}),undefined,null,false,0,''])for(const kind of ['failRead','failRecord'])test('no native/write replay '+kind+' '+String(value),async()=>{
 const f=fixture({[kind]:{value}}),a=createImportPreconfigAdapter(f.ctx);
 for(let i=0;i<2;i++){try{await a.readPreconfigSample();assert.fail('must refuse');}catch(e){assert.equal(e,value);}}
 assert.equal(f.events.filter(e=>e==='read').length,1);assert.equal(f.events.filter(e=>e==='record').length,kind==='failRecord'?1:0);
});

// Source/installed fixed resource -> opaque MODEL -> typed Close refusal.
// Counterfactual native Page is labelled; no bridge/native Close authority.
import {cleanFixture} from './support/import-clean-fixture.mjs';
test('adapter clean-model read and guarded refusal do not Save or replay',async()=>{
 const f=fixture(),original=f.browser.callTool;let cleanCalls=0;
 f.browser.callTool=async function(args,...rest){
  if(!args.arguments.code.includes('readImportCleanFacts'))return original.call(this,args,...rest);
  cleanCalls++;const fn=/page.evaluate\(([\s\S]*),\{"session_id"/.exec(args.arguments.code)?.[1];
  const run=vm.runInNewContext('('+fn+')',{Object});
  const native=cleanFixture(run);Object.assign(native.identity,{document_id:'doc',workflow_id:'workflow',tab_tid:f.identity.tab_tid,node_id:'node'});
  native.receipt.workflowId='workflow';
  const facts=await native.read();return {content:[{type:'text',text:JSON.stringify(facts)}]};
 };
 const a=createImportPreconfigAdapter(f.ctx);await a.readPreconfigSample();const p=await a.observeCleanModel();
 assert.equal(p.model_clean_verified,true);assert.equal(p.native_proof,false);assert.equal(p.close_authority,false);
 assert.throws(()=>a.requestReadonlyClose(p.proof),/GUARDED_CLOSE_SEAM_REQUIRED/);
 assert.equal((await a.observeCleanModel()).proof,p.proof);assert.equal(cleanCalls,1);assert.deepEqual(f.events,['read','record']);
});
