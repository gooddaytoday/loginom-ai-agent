import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLoopParameters} from '../lib/loop-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest,applyNode} from '../lib/node-apply.mjs';
import {buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {selectLoopBodyRecord,loopSettingsSupported,readLoopSourceBrowser} from '../lib/loop-procedure.mjs';
import vm from 'node:vm';

const body={document_id:'doc',workflow_id:'wf',node_id:'body'};
const request={operation_id:'loop',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},target:{kind:'new',type:'control.loop'},inputs:[],parameters:{body},mode:'group_rows',mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:60000,execute_ms:60000,total_ms:180000}};
test('Loop enters the published apply contract and installed handler',()=>{
 const handlers=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyHandlers;
 validateActionParameters(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema,request);
 validateNodeApplyRequest(request,handlers);
});
test('unsupported Loop requests refuse before browser work',()=>{
 validateLoopParameters({body},'group_rows',request);
 for(const p of [{},{body:{...body,workflow_id:'foreign'}},{body,parallel:true},{body,group_size:2},{body,variable:'Page'},{body,keys:['Skip']},{body,ignore_errors:true}])
  assert.throws(()=>validateLoopParameters(p,'group_rows',request));
 for(const mode of ['for','postcondition','group_keys'])assert.throws(()=>validateLoopParameters({body},mode,request));
 assert.throws(()=>validateLoopParameters({body},'group_rows',{...request,variable_inputs:[{}]}));
 assert.throws(()=>validateLoopParameters({body},'group_rows',{...request,inputs:[{input:0}],finish:'execute'}));
});
test('duplicate labels cannot replace native body identity',()=>{
 const target={},foreign={},a={data:{target:foreign,text:'Same'}},b={data:{target,text:'Same'}};
 assert.equal(selectLoopBodyRecord([a,b],target),b);
 assert.throws(()=>selectLoopBodyRecord([a],target));
 assert.throws(()=>selectLoopBodyRecord([b,{data:{target,text:'Other'}}],target));
});
test('buffered or unsupported native flags never certify group_rows',()=>{
 const s={group:true,group_kind:'Фиксированный размер групп',group_size:'1',parallel:false,identifiers:false,ignore_errors:false,variable:'',save_configuration:false};
 assert.equal(loopSettingsSupported(s),true);
 for(const patch of [{group:false},{group_size:'2'},{parallel:true},{identifiers:true},{ignore_errors:true},{variable:'Page'},{save_configuration:true}])
  assert.equal(loopSettingsSupported({...s,...patch}),false);
});

// Observed cached graph/UI tree shapes; no proxy getter or server callback.
function sourceFixture(){
 class Workflow{};class ModelForm{};
 const w=new Workflow(),source={FGuid:'body',FIconCls:'bg-vendor-icon-modelgeneric',FLocked:false,FCell:{},data:{__ObjectId:{Module:'module',Instance:1}},FLabel:{FRawValue:'Same'}};
 source.FPorts=[{FCollection:[0,1].map(i=>({parent:source,FCell:{parent:source.FCell},FSubType:1,FType:i,FPortIndex:0,FGuid:'port'+i,FDisplayName:'Table'}))}];
 const loop={...source,FGuid:'loop',FIconCls:'bg-vendor-icon-loop',FCell:{}};
 loop.FPorts=[{FCollection:source.FPorts[0].FCollection.map(p=>({...p,parent:loop,FCell:{parent:loop.FCell}}))}];
 const tree={FGuid:'body',ParentNode:w,FModelNode:source.data};w.FSubNodes={FItems:[tree]};
 const model=new ModelForm();model.FDiagram={FNodes:{FCollection:[source,loop]}};
 const tab={classList:{contains:()=>true}},document={querySelectorAll:()=>[tab]};
 const preparation={document,id:'doc',receipts:new Map([['wf',{phase:'verified',workflowId:'wf',tab,nodeTargetWorkflowNode:w}]])};
 const workspace={getActiveTab:()=>({Controller:{FController:model,Node:{data:{node:w}}}})};
 const app={Version:'7.4.2',ModelForm,WorkFlowTreeNode:Workflow,Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}};
 const context={document,location:{origin:'https://app.loginom.ai'},__loginomDockPreparationV1:preparation,bg:{app}};
 const task={document_id:'doc',workflow_ref:request.workflow_ref,body,loop:{...body,node_id:'loop'},origin:'https://app.loginom.ai',build:'7.4.2'};
 const run=()=>vm.runInNewContext('('+readLoopSourceBrowser.toString()+')(task)',{...context,task});
 return {source,loop,tree,w,preparation,task,run};
}
test('live port replacements and added variables refuse before target mutation',()=>{
 const f=sourceFixture();assert.equal(f.run().actual_ports[0].guid,'port0');
 f.source.FPorts[0].FCollection[0].FGuid='replacement';assert.throws(f.run,/inherited ports differ/);
 const v=sourceFixture();v.source.FPorts[0].FCollection.push({...v.source.FPorts[0].FCollection[0],FSubType:3});assert.throws(v.run,/without variables/);
});
test('prepared workflow and source proxy identity are checked independently of labels',()=>{
 const f=sourceFixture();f.tree.FModelNode={__ObjectId:{Module:'module',Instance:1}};assert.throws(f.run,/tree identity/);
 const w=sourceFixture();w.preparation.receipts.get('wf').nodeTargetWorkflowNode={};assert.throws(w.run,/workflow changed/);
});
test('Finish cannot certify a replaced body after its selection',()=>{
 const f=sourceFixture();f.task.source=f.run();f.source.data.__ObjectId.Instance++;
 assert.throws(f.run,/changed since selection/);
 const p=sourceFixture();p.task.source=p.run();
 p.source.FPorts[0].FCollection[0].FGuid='new';p.loop.FPorts[0].FCollection[0].FGuid='new';
 assert.throws(p.run,/changed since selection/);
});
test('Loop reread rejects the old active execution and accepts only the new completed one',async()=>{
 const node={...body,node_id:'loop'},handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 const phases=['configure','node_finish','output_mapping','finish'].map(phase=>({phase,receipt_id:'created:'+phase,status:'verified'}));
 const s={parameters:request,outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,phases,
  execution:{status:'completed',execution_id:'old'},configuration:{status:'applied',readback:{kind:'loop',mode:'group_rows',group_size:1,
   parallel:false,iteration_identifiers:false,ignore_errors:false,save_configuration:false,body:{ref:body},node,
   scope:'observed_before_verified_finish',values_are:'observed_ui_values',receipt_ids:phases.map(p=>p.receipt_id)}},
  output:{ports:[{port:0,schema:[{index:0,name:'PageNo',label:'PageNo',type:'integer'}]}]}}}};
 const r=buildNodeReadRequest({operation_id:'read-loop',source_operation_id:'created',read:{sample_rows:100,require_exact_numbers:true}},s);
 assert.equal(r.finish,'execute');assert.equal(r.mode,'read_existing_output');
 for(const outputExecution of ['old','fresh']){
  let launches=0;const ok=v=>({verified:true,cleanup_complete:true,...v});
  const drivers={verifySource:async()=>ok({}),prepareTarget:async()=>ok({node}),
   finishGraph:async()=>{launches++;return ok({mode:'execute',settings_applied:false,execution_id:'fresh'});},
   waitExecution:async()=>ok({status:'completed',execution_id:'fresh'}),
   readOutput:async()=>ok({execution_id:outputExecution,status:'complete',evidence_ref:'read-loop:read',ports:[{port:0,fresh:true}]}),
   verifyContinuation:async()=>false};
  const out=await applyNode({request:r,operation:{id:r.operation_id},handlers,drivers,record:async e=>structuredClone(e)});
  assert.equal(out.status==='SUCCEEDED',outputExecution==='fresh');assert.equal(launches,1);
 }
});
