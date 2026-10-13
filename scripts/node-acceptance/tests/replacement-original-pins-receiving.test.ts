import {test,expect,spyOn} from 'bun:test';
import * as factory from '../../../packages/loginom-host/src/node-client';
import {launchReplacementReadOnlyCaller} from '../replacement-readonly-caller';
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


// Receiving-only composition. Real executor/retained owner/producer and private
// caller; factory, Page/native opening and response delivery are explicit doubles.
// No stock IPC authority or server cancellation transport is claimed here.
for(const when of ['before_mint','before_project'])test('receiving sparse original array '+when,async()=>{
 const f=await fixture();let producer;
 if(when==='before_project')producer=retainReplacementOriginalPins(f.retained,f.node);
 f.node.request.inputs.length=1;
 assert.throws(()=>{producer??=retainReplacementOriginalPins(f.retained,f.node);producer.project()},/CAPTURE_RESULT_INVALID/);
});
for(const [label,raw] of [['Error',Error('ORIGINAL_CHANNEL',{cause:0})],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']])test('receiving linked producer + original caller first cause '+label,async()=>{
 const f=await fixture(),producer=retainReplacementOriginalPins(f.retained,f.node),packet=producer.project();
 const product=await mkdtemp(join(tmpdir(),'replacement-pins-caller-'));
 await mkdir(join(product,'resources/loginom'),{recursive:true});
 await writeFile(join(product,'resources/loginom/resource-manifest.json'),JSON.stringify({files:[{path:f.retained.resource.path,sha256:f.retained.resource.sha256}]}));
 const owner:any={};let captures=0,closes=0;const foreign={};
 const host:any={alive:true,exited:Promise.resolve({code:0}),request:async()=>({generation:packet.generation}),capture:async()=>{captures++;await Promise.resolve();owner.host=foreign;return {refused:true,cleanupComplete:false,rejectedIsUndefined:raw===undefined,...(raw===undefined?{}:{rejected:raw})}},close:async()=>{closes++}};
 const spy=spyOn(factory,'launchReplacementDiagnostic').mockResolvedValue(host);
 try{
  await launchReplacementReadOnlyCaller({product,root:'/fixture/profile',packagePath:packet.package_path,run:packet.run,session:'chat',signal:new AbortController().signal,deadline:Date.now()+60000},owner);
  await owner.acquire();
  // Keep actual process-local original refs/signal. Packet alone cannot replace them.
  owner.pinOriginal({request:f.node.request,opening:f.node.opening,signal:producer.signal,deadline:f.node.deadline,sessionId:packet.session_id});
  assert.equal(packet.request_sha256,f.node.requestSha256);assert.equal(packet.opening_sha256,f.node.openingSha256);
  let late;try{await owner.read()}catch(e){late=e};assert.equal(late.message,'REPLACEMENT_CALLER_OWNER_CHANGED');
  assert.ok(Object.hasOwn(owner,'primaryFailure'));assert.equal(owner.primaryFailure,raw);assert.equal(owner.error,raw);
  if(raw instanceof Error)assert.equal(owner.error.cause,0);
  assert.deepEqual(owner.secondaryFailures,[late]);assert.equal(owner.host,foreign);assert.equal(owner.request,host.request);assert.equal(owner.captureHandle,host.capture);assert.equal(owner.exited,host.exited);
  await assert.rejects(owner.read());await assert.rejects(owner.close(),/NOT_VERIFIED/);
  assert.equal(captures,1);assert.equal(closes,0);assert.equal(owner.gates.native_admission,'not_verified');assert.equal(owner.gates.current_resources,'not_verified');
 }finally{spy.mockRestore()}
});
test('receiving original correlation packet is not borrowed authority',async()=>{
 const f=await fixture(),packet=retainReplacementOriginalPins(f.retained,f.node).project();
 assert.equal('signal' in packet,false);assert.equal('admission' in packet,false);assert.equal('verified' in packet,false);
 const product=await mkdtemp(join(tmpdir(),'replacement-pins-missing-'));await mkdir(join(product,'resources/loginom'),{recursive:true});await writeFile(join(product,'resources/loginom/resource-manifest.json'),JSON.stringify({files:[{path:f.retained.resource.path,sha256:f.retained.resource.sha256}]}));
 let captures=0;const host:any={alive:true,exited:Promise.resolve({code:0}),request:async()=>({generation:1}),capture:async()=>{captures++}};
 const spy=spyOn(factory,'launchReplacementDiagnostic').mockResolvedValue(host);try{const owner:any={};await launchReplacementReadOnlyCaller({product,root:'/fixture/profile',packagePath:packet.package_path,run:packet.run,session:'chat',signal:new AbortController().signal,deadline:Date.now()+60000},owner);await owner.acquire();assert.throws(()=>owner.pinOriginal(packet),/ORIGINAL_REQUIRED/);await assert.rejects(owner.read());assert.equal(captures,0);assert.equal(owner.gates.original_native_owner,'not_verified')}finally{spy.mockRestore()}
});
