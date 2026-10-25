import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupingNodeSupport} from '../lib/grouping-node.mjs';
import {releaseNodeTarget} from '../lib/node-target.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {NODE_RELEASE_BUDGET_MS} from '../lib/node-pending-release.mjs';
import {NodeReadinessTimeout} from '../lib/node-procedure.mjs';
import {releaseGroupingPreview} from '../lib/grouping-preflight.mjs';

function fixture(fault='none'){
 const workflow={workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  node={document_id:'doc',workflow_id:'workflow',node_id:'source'},
  binding={document_id:'doc',workflow_ref:workflow,node},root='MF;TF-1;ModelForm;PreviewWindow',
  tid='MF;TF-1;Graph;Source;Output_Data-0',port={index:0,active:true,port_guid:'output-guid',tid},
  owner={...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Source',locked:false};
 const request={document_id:'doc',workflow_ref:workflow,target:{kind:'new',type:'transform.group_data'},
  inputs:[{source:node,output:0,input:0}],mappings:[],parameters:{group_by:[{kind:'input_field',name:'SKU'}]}};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:'document',
  nodes:[{ref:node,type:'imports.text',label:'Source',locked:false,position:{x:100,y:100},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 let operation={id:'group',parameters:request,deadline:10000,action:{action_key:'node.apply',revision:'1'},
  nodeApply:{request,node:null,pending:{phase:'target'}}},records=[],actions=[],receipts=new Map();
 let preview=false,busy=0,time=1000,release=false,previewReads=0;
 const loading=()=>busy>0||fault==='slow_loading'&&time<21000||fault==='never_ready';
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,
  dom_epoch:{document:'document',revision:1},wizard:{status:'absent'},prepared_node_context:owner,scan:{complete:true},
  nodes:[{bounding_box:{x:100,y:100,width:50,height:50},node_id:'source',node_ref:{node_label:'Source',workflow_ref:workflow},ports:[{tid,ui_ref:'ui-port'}]}],
  ui:{elements:[{ref:'ui-graph',tid:'MF;TF-1;ModelForm;cmpDiagram'},
   {ref:'ui-port',tid,kind:'port',allowed_actions:['click','press']},
   ...(preview?[{ref:'ui-preview',tid:root},{ref:'ui-close',tid:root+';p.h;close',allowed_actions:['click']}]:[])],
   dialogs:preview?[{ref:'ui-preview',identity:{anchor_tid:root}}]:[],
   masks:preview&&loading()?[{kind:'busy',dialog_ref:'ui-preview',target_tid:root+';PreviewForm;DataSetForm'}]:[],
   truncated:{dialogs:false,masks:false,elements:false}}});
 const config={targetOrigin:'http://example.test',targetBuild:'7.4.2',wait:async ms=>{time+=ms;}},ctx={deadline:10000};
 const options={operation,now:()=>time,onRecord:async e=>{
  records.push(structuredClone(e));return fault==='ack'&&e.phase==='grouping_preview_released'?{}:{...e,recorded_at:'fixture'};
 },receiptOptions:(id,action_key,signature)=>{
  operation.lastReceipt={id,operation_id:id,action_key,signature};return {};
 },readReceipt:async ref=>fault==='running'?{state:'running'}:{state:'completed',receipt:receipts.get(ref.id)},execute:async code=>{
  if(code.includes('"receipt_read":true'))return {status:'SUCCEEDED',action_key:'operation.receipt',action_revision:'1',
   operation_id:operation.id,phase:'observed',effect_possible:false,cleanup_complete:true,error:null,trace:[],
   output:{state:'completed',receipt:receipts.get(operation.lastReceipt.id)}};
  if(code.includes('async function readOutputContext'))return {verified:true,ports:[port],node_context:owner};
  if(code.includes('async function readNodePreviewSchema')){
   previewReads++;
   if(fault==='read_error')throw Error('Preview transport failed');
   if(fault==='wrong_timeout')throw new NodeReadinessTimeout('different readiness condition');
   if(fault==='late_ready')time=1000+NODE_RELEASE_BUDGET_MS+1;
   const pending=loading();busy--;
   if(pending)return {verified:false,reason:'preview_schema_inventory'};
   return preview?{verified:true,settings_changed:false,node_id:fault==='foreign_preview'?'other':'source',
    port_guid:'output-guid',port:0,root_tid:root,fields:[],inventory_complete:true}:{verified:false};
  }
  const task=JSON.parse(code.match(/(\{"mode":.*"kind":"workspace-ui"\})/s)[1]);
  if(release&&fault==='deadline')time=10001;
  if(task.mode==='observe')return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,output:state()};
  actions.push(task.action);
  const r={status:'SUCCEEDED',operation_id:task.operation_id,action_key:'ui.act',action_revision:'1',phase:'applied',
   cleanup_complete:true,effect_possible:true,output:state(),trace:[],error:null};
  if(task.action.key==='F3'){
   preview=fault!=='no_preview';busy=fault==='loading'?1:0;
   if(fault==='transport')throw Error('Transport lost');
   Object.assign(r,{status:'AMBIGUOUS',phase:'applying',error:{code:'UI_BROWSER_CALL_FAILED'},
    trace:[{event:'ui_preconditions_verified',verb:'press'},{event:'ui_action_failed',at_ms:15000,code:'UI_BROWSER_CALL_FAILED'}]});
  }else if(task.action.ref==='ui-close'){
   if(fault==='close_failure')r.status='AMBIGUOUS';else preview=false;
  }
  receipts.set(r.operation_id,structuredClone(r));return r;
 }};
 const adapter=operation.nodeTargetAdapter={observe:async()=>{
  const g=structuredClone(graph);
  if(release&&fault==='foreign_effect')g.nodes[0].label='Changed';
  if(release&&fault==='locked')g.nodes[0].locked=true;
  return g;
 },preflight:async()=>{},activateWorkflow:async()=>({verified:true,cleanup_complete:true,effect_possible:false}),
 verifyWorkflow:async()=>({status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow})};
 const drivers=createGroupingNodeSupport(config).nodeApplyDriverFactory(options);
 return {operation,records,actions,receipts,clock:()=>time,previewReads:()=>previewReads,publicRuntime(){
  return createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},now:()=>time,
   targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,execute:options.execute,onRecord:options.onRecord,
   nodeTargetAdapterFactory:()=>adapter,
   nodeApplyHandlers:new Map([['transform.group_data',{revision:'1',modes:['aggregate'],validate:()=>{},configure:()=>assert.fail('No target configuration')}]]),
   nodeApplyDriverFactory:({operation:current})=>{
    operation=current;options.operation=current;
    const currentDrivers=createGroupingNodeSupport(config).nodeApplyDriverFactory(options);
    return {...currentDrivers,
     // Inject only the read clock for long waits; the immediate regression
     // keeps the production factory hook as well as the executor's budget.
     ...(fault==='none'?{}:{releaseBeforeTarget:ctx=>releaseGroupingPreview(options,ctx,config)}),
     verifySource:async()=>({verified:true,cleanup_complete:true,effect_possible:false})};
   }});
 },request:{...request,operation_id:'group',contract_revision:'1.0.0',mode:'aggregate',finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}},
 async stop(){await assert.rejects(drivers.beforeTarget(ctx),/did not confirm|Transport lost/);release=true;},
  release:()=>drivers.releaseBeforeTarget?.(ctx),
  releaseTarget:()=>releaseNodeTarget({operation,adapter:operation.nodeTargetAdapter,record:options.onRecord,
   readReceipt:options.readReceipt,deadline:10000,now:()=>time})};
}

for(const fault of ['none','slow_loading'])test('D68b public release uses the production 90000 ms budget after completed failed F3: '+fault,async()=>{
 assert.equal(NODE_RELEASE_BUDGET_MS,90000);
 const f=fixture(fault),runtime=f.publicRuntime();
 runtime.startNodeApply(f.request);
 const job=await runtime.waitNodeApply('group',{timeoutMs:1000});
 assert.equal(job.outcome.status,'AMBIGUOUS');
 assert.equal(job.outcome.output.pending_phase,'target');
 const result=await runtime.recover('group',{strategy:'abandon_operation',recoveryOperationId:'release'});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,1);
 assert.equal(f.records.filter(r=>r.phase==='grouping_preview_released').length,1);
 assert.equal(result.output.goal_verified,false);
 assert.notEqual(result.output.original_outcome.status,'SUCCEEDED');
 const reads=f.records.filter(r=>r.readiness?.condition==='original grouping preview before release');
 assert.ok(reads.length>0);
 assert.ok(reads.every(r=>r.readiness.timeout_ms>0&&r.readiness.timeout_ms<=15000));
 if(fault==='slow_loading'){
  assert.ok(f.clock()>=21000&&f.clock()<1000+NODE_RELEASE_BUDGET_MS);
  assert.ok(f.records.some(r=>r.phase==='node_observation_timeout'&&r.condition==='original grouping preview before release'));
 }
});

for(const disposed of [false,true])test('shared release requires managed F3 lease disposal before closing its own preview: '+disposed,async()=>{
 const f=fixture();await f.stop();f.operation.cleanupConfirmed=false;
 const p=f.operation.groupingPreview;
 p.managed=true;p.lease_disposed=disposed;
 p.receipt.action_key='node.javascript.preview.open.internal';p.receipt.cleanup_complete=false;
 p.reference.action_key=p.receipt.action_key;f.operation.lastReceipt=structuredClone(p.reference);
 f.receipts.set(p.reference.id,structuredClone(p.receipt));
 if(disposed){await f.release();assert.equal((await f.releaseTarget()).verified,true);}
 else{await assert.rejects(f.release(),/completion is unconfirmed/);assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,0);}
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
});

for(const fault of ['never_ready','late_ready','read_error','wrong_timeout'])
test('D68b public release keeps the original deadline and refuses unrelated read failures: '+fault,async()=>{
 const f=fixture(fault),runtime=f.publicRuntime();
 runtime.startNodeApply(f.request);
 const job=await runtime.waitNodeApply('group',{timeoutMs:1000});
 assert.equal(job.outcome.status,'AMBIGUOUS');
 const result=await runtime.recover('group',{strategy:'abandon_operation',recoveryOperationId:'release'});
 assert.equal(result.status,'AMBIGUOUS');assert.equal(result.error.code,'NODE_RELEASE_REFUSED');
 assert.equal(result.output.original_operation_pending,true);
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,0);
 assert.equal(f.records.filter(r=>r.phase==='grouping_preview_released').length,0);
 if(fault==='never_ready')assert.equal(f.clock(),1000+NODE_RELEASE_BUDGET_MS);
 if(fault==='read_error'||fault==='wrong_timeout')assert.equal(f.previewReads(),1);
});

for(const fault of ['none','loading','no_preview'])test('D68 completed failed F3 is released only after owned preview cleanup and unchanged idle graph: '+fault,async()=>{
 const f=fixture(fault);await f.stop();
 assert.equal(f.operation.cleanupConfirmed,true); // The original browser finally completed.
 f.operation.cleanupConfirmed=false; // applyNode preserves the unresolved parent.
 assert.equal(f.operation.nodeEffectPossible,true);
 await assert.rejects(f.releaseTarget(),/no settled checkpoint/);
 // applyNode reports the unresolved parent independently of the child cleanup.
 f.operation.cleanupConfirmed=false;
 await f.release();
 const proof=await f.releaseTarget();assert.equal(proof.verified,true);assert.equal(proof.target_state,'not_created');
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,fault==='no_preview'?0:1);
 assert.equal(f.records.filter(r=>r.phase==='grouping_preview_released').length,1);
 assert.equal(f.operation.groupingPreview,undefined);
});

for(const fault of ['transport','running','foreign_preview','foreign_effect','locked','close_failure','ack','deadline'])
test('D68 refuses unproved preview release without another F3: '+fault,async()=>{
 const f=fixture(fault);await f.stop();f.operation.cleanupConfirmed=false;
 await assert.rejects(f.release());
 assert.equal(f.operation.cleanupConfirmed,false);
 assert.equal(f.operation.preTargetGraph,undefined);
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
});
