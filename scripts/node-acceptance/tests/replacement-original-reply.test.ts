import {test,expect,spyOn} from 'bun:test';
import * as factory from '../../../packages/loginom-host/src/node-client';
import {createReplacementOriginalReplyAdapter} from '../replacement-original-reply.mjs';
import {MessageChannel} from 'node:worker_threads';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.REPLACEMENT_PIN_RUNTIME_ROOT??new URL('../../../packages/loginom-runtime/client',import.meta.url).pathname;
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



const setup=async()=>{const f=await fixture(),producer=retainReplacementOriginalPins(f.retained,f.node),packet=producer.project();const host={alive:true};const owner={host,request:()=>{},captureHandle:()=>{},exited:Promise.resolve(0)};const input={request:f.node.request,opening:f.node.opening,run:packet.run,ownerId:packet.owner,chat:packet.chat,sessionId:packet.session_id,account:packet.account,packagePath:packet.package_path,resourceSha256:packet.resource_sha256,lease:{generation:packet.generation},signal:new AbortController().signal,deadline:packet.deadline};return {...f,producer,packet,owner,input,adapter:createReplacementOriginalReplyAdapter(owner,input)}};
const reply=f=>({version:1,kind:'replacement-original-reply-v1',original:f.packet,outcome:{cleanupComplete:false,diagnosticRead:true,receipt:{opaque:true}}});
const wire=value=>new Promise(resolve=>{const {port1,port2}=new MessageChannel();port1.once('message',v=>{port1.close();port2.close();resolve(v)});port2.postMessage(value)});
test('actual producer through JSON/MessageChannel to private correlation adapter',async()=>{const f=await setup(),before=f.calls.length;const result=f.adapter.accept(await wire(JSON.parse(JSON.stringify(reply(f)))));assert.deepEqual(result.correlation.request,f.node.request);assert.equal(f.producer.signal,f.controller.signal);assert.equal('signal' in result.correlation,false);assert.equal(result.native_admission,false);assert.equal(result.server_cancellation_verified,false);assert.equal(result.cleanupComplete,false);assert.equal(f.calls.length,before);assert.throws(()=>f.adapter.accept(reply(f)),/NO_RETRY/)});
for(const key of ['owner','chat','opening_sha256','run','lease','generation','session_id','account','package_path','resource_sha256','operation_id','document_id','workflow_id','node_id','request_sha256','outer_opening_operation_id','native_opening_operation_id','opening_epoch','deadline'])test('wrong original correlation '+key,async()=>{const f=await setup(),v=JSON.parse(JSON.stringify(reply(f)));v.original[key]=key==='generation'?2:key==='deadline'?0:'foreign';assert.throws(()=>f.adapter.accept(v));assert.throws(()=>f.adapter.accept(reply(f)),/NO_RETRY/)});
for(const change of ['extra','hole','missing','kind','request','expired','lease','owner'])test('closed adapter guard '+change,async()=>{const f=await setup(),v=JSON.parse(JSON.stringify(reply(f)));if(change==='extra')v.original.admission=true;if(change==='hole')v.original.request.inputs.length=1;if(change==='missing')delete v.original;if(change==='kind')v.kind='calculator';if(change==='request')f.input.request.parameters.changed=true;if(change==='expired')f.input.deadline=0;if(change==='lease')f.input.lease.generation=2;if(change==='owner')f.owner.host={};assert.throws(()=>f.adapter.accept(v))});
for(const [label,raw] of [['Error',Error('FIRST',{cause:0})],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']]){
 test('channel first '+label+' before late owner drift',async()=>{const f=await setup(),v=reply(f);v.outcome={cleanupComplete:false,refused:true,rejectedIsUndefined:raw===undefined,...(raw===undefined?{}:{rejected:raw})};f.owner.host={};let late;try{f.adapter.accept(v)}catch(e){late=e};assert.equal(late.message,'REPLACEMENT_REPLY_OWNER_CHANGED');assert.ok(Object.hasOwn(f.owner,'primaryFailure'));assert.equal(f.owner.primaryFailure,raw);assert.equal(f.owner.error,raw);assert.deepEqual(f.owner.secondaryFailures,[late]);if(raw instanceof Error)assert.equal(f.owner.error.cause,0)});
 test('lost reply '+label+' never retries or dispatches',async()=>{const f=await setup(),before=f.calls.length;let rejected=false;try{f.adapter.lost(raw)}catch(e){rejected=true;assert.equal(e,raw)}assert.equal(rejected,true);assert.equal(f.owner.primaryFailure,raw);assert.throws(()=>f.adapter.accept(reply(f)),/NO_RETRY/);assert.equal(f.calls.length,before)});
}
test('accessor refusal is never invoked',async()=>{const f=await setup(),v=reply(f);let called=0;Object.defineProperty(v,'outcome',{get(){called++;throw Error('GETTER')}});assert.throws(()=>f.adapter.accept(v),/SHAPE/);assert.equal(called,0)});
test('stock-shaped response without envelope refuses; no synthetic authority',async()=>{const f=await setup();assert.throws(()=>f.adapter.accept({cleanupComplete:false,diagnosticRead:true}),/SHAPE/);assert.equal(f.owner.failed,true)});

for(const stage of ['pending','server-abort','foreign-owner'])test('actual server producer refuses before channel '+stage,async()=>{const f=await fixture();if(stage==='pending')f.operation.nodeApply.pending={phase:'unknown'};if(stage==='server-abort')f.controller.abort(0);if(stage==='foreign-owner')f.owner.page={};let rejected=false;try{retainReplacementOriginalPins(f.retained,f.node).project()}catch(e){rejected=true;if(stage==='server-abort')assert.equal(e,0)}assert.equal(rejected,true)});

test('input accessor drift refuses without getter',async()=>{const f=await setup();let calls=0;Object.defineProperty(f.input,'request',{get(){calls++;return f.node.request}});assert.throws(()=>f.adapter.accept(reply(f)));assert.equal(calls,0)});
test('late lease getter refuses without getter',async()=>{const f=await setup();let calls=0;Object.defineProperty(f.input.lease,'generation',{get(){calls++;return 1}});assert.throws(()=>f.adapter.accept(reply(f)));assert.equal(calls,0)});

test('nested outcome getter refuses without invocation',async()=>{const f=await setup(),v=reply(f);let calls=0;Object.defineProperty(v.outcome,'refused',{get(){calls++;return false}});assert.throws(()=>f.adapter.accept(v));assert.equal(calls,0)});
test('initial lease getter refuses without invocation',async()=>{const f=await setup();let calls=0;Object.defineProperty(f.input.lease,'generation',{get(){calls++;return 1}});assert.throws(()=>createReplacementOriginalReplyAdapter(f.owner,f.input));assert.equal(calls,0)});
for(const [label,value,isUndefined] of [['ErrorDTO',{name:'Error',message:'FIRST',cause:{kind:'value',value:0,is_undefined:false}},false],['undefined',undefined,true],['null',null,false],['false',false,false],['zero',0,false],['empty','',false]])test('JSON channel rejection preserves '+label,async()=>{const f=await setup(),v=reply(f);v.outcome={cleanupComplete:false,refused:true,rejectedIsUndefined:isUndefined,...(isUndefined?{}:{rejected:value})};const delivered=await wire(JSON.parse(JSON.stringify(v)));const result=f.adapter.accept(delivered);assert.equal(f.owner.primaryFailure,isUndefined?undefined:delivered.outcome.rejected);assert.equal(result.outcome,delivered.outcome);assert.equal(result.native_admission,false);if(label==='ErrorDTO')assert.deepEqual(f.owner.primaryFailure.cause,{kind:'value',value:0,is_undefined:false})});
