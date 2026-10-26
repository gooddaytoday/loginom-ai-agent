import test from 'node:test';
import {readFileSync} from 'node:fs';
const journalReceipt=JSON.parse(readFileSync(new URL('./fixtures/d68c-sort-preview-deadline.json',import.meta.url)));
import assert from 'node:assert/strict';
import {createSortingNodeSupport} from '../lib/sorting-node.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {NODE_RELEASE_BUDGET_MS} from '../lib/node-pending-release.mjs';
import {NodeReadinessTimeout} from '../lib/node-procedure.mjs';

function fixture(fault='none'){
 const workflow={workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  node={document_id:'doc',workflow_id:'workflow',node_id:'source'},
  binding={document_id:'doc',workflow_ref:workflow,node},root='MF;TF-1;ModelForm;PreviewWindow',
  tid='MF;TF-1;Graph;Source;Output_Data-0',port={index:0,active:true,port_guid:'output-guid',tid},
  owner={...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Source',locked:false};
 const request={document_id:'doc',workflow_ref:workflow,target:{kind:'new',type:'transform.sorting'},
  inputs:[{source:node,output:0,input:0}],mappings:[],parameters:{keys:[{field:{kind:'input_field',name:'SKU'},direction:'ASC',case_sensitive:true}]}};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:'document',
  nodes:[{ref:node,type:'imports.text',label:'Source',locked:false,position:{x:100,y:100},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 let operation={id:'group',parameters:request,deadline:10000,action:{action_key:'node.apply',revision:'1'},
  nodeApply:{request,node:null,pending:{phase:'target'}}},records=[],actions=[],receipts=new Map();
 let preview=false,busy=0,time=1000,release=false,previewReads=0;
 const loading=()=>busy>0||fault==='slow_loading'&&time<21000||fault==='late_settle'&&time<50000||['journal_deadline','schema_timeout'].includes(fault)&&!release||fault==='never_ready';
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
   output:{state:fault==='running'?'running':'completed',receipt:receipts.get(operation.lastReceipt.id)}};
  if(code.includes('async function readOutputContext'))return {verified:true,ports:[port],node_context:owner};
  if(code.includes('async function readNodePreviewSchema')){
   previewReads++;
   if(fault==='read_error')throw Error('Preview transport failed');
   if(fault==='wrong_timeout')throw new NodeReadinessTimeout('different readiness condition');
   if(fault==='late_after_deadline')time=60001;
   if(fault==='late_ready')time=1000+NODE_RELEASE_BUDGET_MS+1;
   const pending=loading();busy--;
   if(pending)return {verified:false,reason:'preview_schema_inventory'};
   return preview?{verified:true,settings_changed:false,node_id:fault==='foreign_preview'?'other':'source',
    port_guid:'output-guid',port:0,root_tid:root,fields:[{name:'SKU',type:'string',label:'SKU'}],inventory_complete:true}:{verified:false};
  }
  const task=JSON.parse(code.match(/(\{"mode":.*"kind":"workspace-ui"\})/s)[1]);
  if(release&&fault==='deadline')time=10001;
  if(task.mode==='observe')return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,output:state()};
  actions.push(task.action);
  const r={status:'SUCCEEDED',operation_id:task.operation_id,action_key:'ui.act',action_revision:'1',phase:'applied',
   cleanup_complete:true,effect_possible:true,output:state(),trace:[],error:null};
  if(task.action.key==='F3'){
   if(['late_settle','late_after_deadline','journal_deadline'].includes(fault))time=28800;
   preview=fault!=='no_preview';busy=fault==='loading'?1:0;
   if(fault==='transport')throw Error('Transport lost');
   Object.assign(r,{status:'AMBIGUOUS',phase:['late_settle','late_after_deadline'].includes(fault)?'observing':'applying',error:{code:'UI_DEADLINE_EXCEEDED',message:'Observed UI action deadline exceeded'},
    trace:[{event:'ui_preconditions_verified',verb:'press',refs:[task.action.ref]},...(['late_settle','late_after_deadline'].includes(fault)?[{event:'ui_gesture_applied',verb:'press'}]:[]),{event:'ui_action_failed',at_ms:27800,code:'UI_DEADLINE_EXCEEDED'}]});
   if(fault==='browser_failed')r.error.code='UI_BROWSER_CALL_FAILED';
   if(fault==='schema_timeout')Object.assign(r,{status:'SUCCEEDED',phase:'applied',error:null});
   if(fault==='primary_failed')Object.assign(r,{status:'FAILED',effect_possible:false});
   if(fault==='primary_not_applied')Object.assign(r,{status:'NOT_APPLIED',effect_possible:false,error:{code:'PREVIEW_REFUSED',message:'No gesture applied'}});
   if(fault==='journal_deadline'){Object.assign(r,structuredClone(journalReceipt),{operation_id:task.operation_id});r.trace.find(e=>e.event==='ui_preconditions_verified').refs=[task.action.ref];}
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
 const drivers=createSortingNodeSupport(config).nodeApplyDriverFactory(options);
 return {operation,records,actions,beginRelease:()=>{release=true;},clock:()=>time,previewReads:()=>previewReads,publicRuntime(){
  return createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},now:()=>time,
   targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,execute:options.execute,onRecord:options.onRecord,
   nodeTargetAdapterFactory:()=>adapter,
   nodeApplyHandlers:new Map([['transform.sorting',{revision:'1',modes:['keys'],validate:()=>{},configure:()=>assert.fail('No target configuration')}]]),
   nodeApplyDriverFactory:({operation:current,readReceipt})=>{
    operation=current;options.operation=current; if(readReceipt)options.readReceipt=readReceipt;
    const currentDrivers=createSortingNodeSupport(config).nodeApplyDriverFactory(options);
    return {...currentDrivers,
     // Inject only the read clock for long waits; the immediate regression
     // keeps the production factory hook as well as the executor's budget.
     
     verifySource:async()=>({verified:true,cleanup_complete:true,effect_possible:false})};
   }});
 },request:{...request,operation_id:'group',contract_revision:'1.0.0',mode:'keys',finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:60000,execute_ms:60000,total_ms:180000}},
 async preflight(){operation.deadline=60000;return drivers.beforeTarget({deadline:60000});},
 async stop(){await assert.rejects(drivers.beforeTarget(ctx),/did not confirm|Transport lost/);release=true;},
  release:()=>drivers.releaseBeforeTarget?.(ctx),
  releaseTarget:()=>releaseNodeTarget({operation,adapter:operation.nodeTargetAdapter,record:options.onRecord,
   readReceipt:options.readReceipt,deadline:10000,now:()=>time})};
}

for(const fault of ['none','slow_loading','journal_deadline','browser_failed','schema_timeout','primary_failed','primary_not_applied'])test('D68c production runtime.recover releases exact failed Sort F3 without replay: '+fault,async()=>{
 const f=fixture(fault),runtime=f.publicRuntime();runtime.startNodeApply(f.request);
 const job=await runtime.waitNodeApply('group',{timeoutMs:1000});assert.equal(job.outcome.status,'AMBIGUOUS');
 f.beginRelease();
 const result=await runtime.recover('group',{strategy:'abandon_operation',recoveryOperationId:'release'});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.output.goal_verified,false);
 assert.notEqual(result.output.original_outcome.status,'SUCCEEDED');
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,1);
});
for(const fault of ['foreign_preview','foreign_effect','locked','close_failure','ack','transport','running','read_error','late_ready','never_ready','wrong_timeout'])
test('D68c production release refuses unproved Sort preview: '+fault,async()=>{
 const f=fixture(fault),runtime=f.publicRuntime();runtime.startNodeApply(f.request);await runtime.waitNodeApply('group',{timeoutMs:1000});
 if(fault==='transport'){await assert.rejects(runtime.recover('group',{strategy:'abandon_operation',recoveryOperationId:'release'}),/Release proof unavailable/);return;}
 f.beginRelease();
 const result=await runtime.recover('group',{strategy:'abandon_operation',recoveryOperationId:'release'});
 assert.notEqual(result.status,'SUCCEEDED');assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
});
test('D68c late completed F3 settles read-only at 50 s within the original 60 s deadline',async()=>{
 const f=fixture('late_settle');const proof=await f.preflight();assert.equal(proof.verified,true);
 assert.ok(f.clock()>=50000&&f.clock()<60000);assert.equal(f.actions.filter(a=>a.key==='F3').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,1);
 assert.equal(f.records.filter(r=>r.phase==='upstream_preview_settled').length,1);
 assert.equal(f.records.find(r=>r.outcome?.error?.code==='UI_DEADLINE_EXCEEDED').outcome.status,'AMBIGUOUS');
 assert.ok(f.records.some(r=>r.phase==='node_observation_timeout'&&r.condition==='settle the dispatched upstream schema preview'));
});
test('late F3 readiness returned after the original deadline cannot authorize continuation or Close',async()=>{
 const f=fixture('late_after_deadline');await assert.rejects(f.preflight());
 assert.equal(f.actions.filter(a=>a.key==='F3').length,1);assert.equal(f.actions.filter(a=>a.ref==='ui-close').length,0);
 assert.equal(f.records.filter(r=>r.phase==='upstream_preview_settled').length,0);
});
