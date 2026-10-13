import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.REPLACEMENT_PIN_RUNTIME_ROOT;
const load=file=>import(root?pathToFileURL(root+'/'+file).href:new URL('../'+file,import.meta.url).href);
const {createActionRuntime}=await load('lib/executor.mjs');
const {retainReplacementOriginalPins}=await load('lib/replacement-original-pins.mjs');
const {retainCaptureOwner,bindCaptureRuntime}=await import(root?pathToFileURL(root+'/../src/retained-capture.mjs').href:new URL('../../src/retained-capture.mjs',import.meta.url).href);
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Own'}]};
const request=()=>({operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'existing',type:'transform.replace_columns',ref:{document_id:'doc',workflow_id:'wf',node_id:'node'}},
 inputs:[],mode:'exact',parameters:{},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
 budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
async function fixture(){
 const controller=new AbortController();let operation;const calls=[];
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:request().target.ref,type:'transform.replace_columns',label:'Own',position:{x:1,y:1},inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
 const ok=name=>async()=>{calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false}};
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
  execute:async()=>{throw Error('NO_NATIVE_TRANSPORT')},nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,reconcile:ok('reconcile'),mutate:async()=>{throw Error('NO_NATIVE_MUTATION')}}),
  nodeApplyHandlers:new Map([['transform.replace_columns',{revision:'fixture',modes:['exact'],validate(){},configure:ok('configure')}]]),
  nodeApplyDriverFactory:c=>{operation=c.operation;return {verifySource:ok('source'),mapPorts:ok('mapping'),
   openWizard:async()=>({verified:true,cleanup_complete:true,effect_possible:false,opening_operation_id:'native-opening',epoch:'original-opening-epoch'}),
   finish:async()=>({verified:true,cleanup_complete:true,mode:'done',execution_started:false,execution_id:null}),waitExecution:ok('wait'),readOutput:ok('read'),verifyContinuation:async()=>true}},onRecord:async e=>e});
 const outcome=await runtime.runNodeApply(request(),{signal:controller.signal});
 assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome));
 const node=runtime.retainCaptureNode('apply');
 const page={isClosed:()=>false},context={pages:()=>[page]},session={directory:'/fixture/own',metadata:{sessionId:'session',clientRevision:'fixture'}};
 const owner={id:'startup',account:'account',origin:'https://fixture.invalid',page,context,generation:1,chat:'chat'};
 const startup={owner,id:owner.id,account:owner.account,origin:owner.origin,page,context,generation:1,chat:'chat'};
 const state={startupOwner:owner,captureStartupBinding:startup,session};
 const binding=Object.freeze({owner:'host',run:'run',lease:'host:run',generation:1,chat:'chat',account:'account',session:'session',admission:'host-admission',expires:Date.now()+60000,
  packagePath:'/account/original.lgp',harness:'replacement-input0-readonly-v1'});
 const retained=retainCaptureOwner(state,binding,Object.freeze({path:'runtime/src/acceptance/replacement-input0-readonly-v1.mjs',sha256:'a'.repeat(64)}));
 const bridge={},client={};Object.assign(state,{bridge,client});bindCaptureRuntime(retained,bridge,client);
 return {controller,runtime,node,state,owner,session,retained,operation,calls};
}
test('real executor original correlation; server signal absent from JSON; one delivery',async()=>{
 const f=await fixture(),p=retainReplacementOriginalPins(f.retained,f.node);const before=f.calls.length;
 assert.equal(p.signal,f.controller.signal);const packet=p.project();
 assert.equal(packet.request_sha256,f.node.requestSha256);assert.equal(packet.opening_sha256,f.node.openingSha256);
 assert.equal(packet.outer_opening_operation_id,f.node.opening.receipt_id);assert.equal(packet.native_opening_operation_id,'native-opening');
 assert.notEqual(packet.outer_opening_operation_id,packet.native_opening_operation_id);assert.equal(packet.deadline,f.node.deadline);
 assert.equal(packet.session_id,'session');assert.notEqual(packet.request,f.node.request);
 const delivered=JSON.parse(JSON.stringify(packet));assert.deepEqual(delivered,packet);
 assert.equal('signal' in delivered,false);assert.equal('admission' in delivered,false);assert.equal('verified' in delivered,false);
 assert.equal(delivered.cancellation.link,'original-server-operation');assert.throws(()=>p.project(),/ALREADY_DELIVERED/);
 assert.equal(retainReplacementOriginalPins(f.retained,f.runtime.retainCaptureNode('apply')),p);
 assert.equal(f.calls.length,before);
});
for(const change of ['owner','page','context','session','client','bridge','request','opening','native-opening','epoch','node','deadline','expired','pending'])test('original drift '+change,async()=>{
 const f=await fixture(),p=retainReplacementOriginalPins(f.retained,f.node);
 if(change==='owner')f.state.startupOwner={...f.owner};
 if(change==='page')f.owner.page={};if(change==='context')f.owner.context={};
 if(change==='session')f.state.session={...f.session};
 if(change==='client')f.state.client={};if(change==='bridge')f.state.bridge={};
 if(change==='request')f.node.request.parameters.changed=true;
 if(change==='opening')f.node.opening.receipt_id='foreign';
 if(change==='native-opening')f.node.opening.value.opening_operation_id='foreign';
 if(change==='epoch')f.node.opening.value.epoch='foreign';
 if(change==='node')f.operation.nodeApply.node={...f.operation.nodeApply.node};
 if(change==='deadline')f.operation.nodeApply.deadline++;
 if(change==='expired')f.operation.nodeApply.deadline=Date.now()-1;
 if(change==='pending')f.operation.nodeApply.pending={phase:'unknown'};
 assert.throws(()=>p.project());
});
for(const reason of [null,false,0,'',Error('ORIGINAL_ABORT',{cause:0})])test('original server cancellation primary '+String(reason),async()=>{
 const f=await fixture(),p=retainReplacementOriginalPins(f.retained,f.node);f.controller.abort(reason);f.owner.page={};
 try{p.project();assert.fail('must refuse')}catch(e){assert.equal(e,reason)}
});
test('abort before mint preserves original primary',async()=>{
 const f=await fixture(),reason=Error('ORIGINAL',{cause:0});f.controller.abort(reason);f.owner.page={};
 try{retainReplacementOriginalPins(f.retained,f.node);assert.fail('must refuse')}catch(e){assert.equal(e,reason)}
});
test('missing original opening epoch refuses before projection',async()=>{
 const f=await fixture();delete f.node.opening.value.epoch;assert.throws(()=>retainReplacementOriginalPins(f.retained,f.node));
});
test('accessor drift refuses without invoking it',async()=>{
 const f=await fixture(),p=retainReplacementOriginalPins(f.retained,f.node);let calls=0;
 Object.defineProperty(f.node.request.parameters,'changed',{get(){calls++;return true},enumerable:true});
 assert.throws(()=>p.project());assert.equal(calls,0);
});
