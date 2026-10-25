import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupingNodeSupport} from '../lib/grouping-node.mjs';
import {releaseNodeTarget} from '../lib/node-target.mjs';

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
 const operation={id:'group',parameters:request,deadline:10000,action:{action_key:'node.apply',revision:'1'},
  nodeApply:{request,node:null,pending:{phase:'target'}}},records=[],actions=[],receipts=new Map();
 let preview=false,busy=0,time=1000,release=false;
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,
  dom_epoch:{document:'document',revision:1},wizard:{status:'absent'},prepared_node_context:owner,scan:{complete:true},
  nodes:[{bounding_box:{x:100,y:100,width:50,height:50},node_id:'source',node_ref:{node_label:'Source',workflow_ref:workflow},ports:[{tid,ui_ref:'ui-port'}]}],
  ui:{elements:[{ref:'ui-graph',tid:'MF;TF-1;ModelForm;cmpDiagram'},
   {ref:'ui-port',tid,kind:'port',allowed_actions:['click','press']},
   ...(preview?[{ref:'ui-preview',tid:root},{ref:'ui-close',tid:root+';p.h;close',allowed_actions:['click']}]:[])],
   dialogs:preview?[{ref:'ui-preview',identity:{anchor_tid:root}}]:[],
   masks:preview&&busy>0?[{kind:'busy',dialog_ref:'ui-preview',target_tid:root+';PreviewForm;DataSetForm'}]:[],
   truncated:{dialogs:false,masks:false,elements:false}}});
 const config={targetOrigin:'http://example.test',targetBuild:'7.4.2'},ctx={deadline:10000};
 const options={operation,now:()=>time,onRecord:async e=>{
  records.push(structuredClone(e));return fault==='ack'&&e.phase==='grouping_preview_released'?{}:{...e,recorded_at:'fixture'};
 },receiptOptions:(id,action_key,signature)=>{
  operation.lastReceipt={id,operation_id:id,action_key,signature};return {};
 },readReceipt:async ref=>fault==='running'?{state:'running'}:{state:'completed',receipt:receipts.get(ref.id)},execute:async code=>{
  if(code.includes('async function readOutputContext'))return {verified:true,ports:[port],node_context:owner};
  if(code.includes('async function readNodePreviewSchema')){
   const loading=busy-->0;
   if(loading)return {verified:false,reason:'preview_schema_inventory'};
   return preview?{verified:true,settings_changed:false,node_id:fault==='foreign_preview'?'other':'source',
    port_guid:'output-guid',port:0,root_tid:root,fields:[],inventory_complete:true}:{verified:false};
  }
  const task=JSON.parse(code.match(/(\{"mode":.*"kind":"workspace-ui"\})/s)[1]);
  if(release&&fault==='deadline')time=10001;
  if(task.mode==='observe')return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,output:state()};
  actions.push(task.action);
  const r={status:'SUCCEEDED',operation_id:task.operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:state(),trace:[]};
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
 operation.nodeTargetAdapter={observe:async()=>{
  const g=structuredClone(graph);
  if(release&&fault==='foreign_effect')g.nodes[0].label='Changed';
  if(release&&fault==='locked')g.nodes[0].locked=true;
  return g;
 },verifyWorkflow:async()=>({status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow})};
 const drivers=createGroupingNodeSupport(config).nodeApplyDriverFactory(options);
 return {operation,records,actions,async stop(){await assert.rejects(drivers.beforeTarget(ctx),/did not confirm|Transport lost/);release=true;},
  release:()=>drivers.releaseBeforeTarget?.(ctx),
  releaseTarget:()=>releaseNodeTarget({operation,adapter:operation.nodeTargetAdapter,record:options.onRecord,
   readReceipt:options.readReceipt,deadline:10000,now:()=>time})};
}

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
