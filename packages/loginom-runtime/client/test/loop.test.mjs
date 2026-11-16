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
import {loopConfigurationReadback} from '../lib/loop-readback.mjs';
import {createLoopNodeSupport} from '../lib/loop-node.mjs';

const body={document_id:'doc',workflow_id:'wf',node_id:'body'};
const request={operation_id:'loop',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},target:{kind:'new',type:'control.loop'},inputs:[],parameters:{body},mode:'group_rows',mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:60000,execute_ms:60000,total_ms:180000}};
const forParameters={body,count:3,variable:{port_guid:'input-guid',definition_id:7},iteration_identifiers:true};
test('FOR preflight accepts the observed NW1 variable port object, never an ordinal or control port',async()=>{
 // live1 main execution-events.jsonl:632–635: NW1 variable_inputs are objects.
 const port={kind:'variables',port:0,port_guid:'input-guid',native_index:0};
 const node={ref:body,type:'control.supernode',inputs:[],outputs:[0],variable_inputs:[port],variable_outputs:[],other_ports:['Input_Var-0']};
 for(const inputs of [[port],[0],[{...port,kind:'control'}],[{...port,port:1}],[{...port,port_guid:'foreign'}],[port,{...port,port:1}]]){
  let calls=0;
  const operation={parameters:{...request,mode:'for',parameters:forParameters},nodeTargetAdapter:{observe:async()=>({complete:true,nodes:[{...node,variable_inputs:inputs}]})}};
  const driver=createLoopNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyDriverFactory({operation,execute:async()=>{
   calls++;return calls===1?{status:'SUCCEEDED',cleanup_complete:true,variable_boundary:{port_guid:'input-guid',kind:'variables',native_index:0,definitions:[{id:7,index:0,name:'Page',type:'integer',value:99,is_null:false}]}}:{mode:'for',ports:[]};
  }});
  const run=()=>driver.verifySource({}, {deadline:Date.now()+60000});
  if(inputs[0]===port&&inputs.length===1){assert.equal((await run()).verified,true);assert.equal(calls,2);}
  else{await assert.rejects(run,/Supernode/);assert.equal(calls,0,'unsupported port must refuse before opening a source wizard');}
 }
});
test('FOR reaches the production handler with an observed variable definition identity',()=>{
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 const r={...request,mode:'for',parameters:forParameters};
 validateActionParameters(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema,r);
 validateNodeApplyRequest(r,handlers);
 validateLoopParameters({...forParameters,iteration_identifiers:false},'for',r);
});
test('FOR refuses unsupported count, identity, flags and external inputs before browser work',()=>{
 for(const patch of [{count:0},{count:-1},{count:1.5},{count:'3'},{count:{variable:'Count'}},{count:null},
  {variable:'Page'},{variable:{name:'Page'}},{variable:{port_guid:'input-guid',definition_id:null}},
  {parallel:true},{ignore_errors:true},{start:1},{step:2},{save_configuration:true},{group_keys:['Page']}])
  assert.throws(()=>validateLoopParameters({...forParameters,...patch},'for',request));
 for(const patch of [{inputs:[{input:0}]},{variable_inputs:[{}]},{bindings:[{}]},{mappings:[{}]}])
  assert.throws(()=>validateLoopParameters(forParameters,'for',{...request,...patch}));
});
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
 return {source,loop,tree,w,preparation,task,run,diagram:model.FDiagram};
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

test('unfinished Loop can be configured on the same target without claiming live ports',()=>{
 const f=sourceFixture();f.loop.FPorts=[];f.task.allow_unconfigured=true;
 assert.equal(f.run().actual_ports.length,0);
 delete f.task.allow_unconfigured;assert.throws(f.run,/without variables/);
 const partial=sourceFixture();partial.loop.FPorts[0].FCollection.pop();partial.task.allow_unconfigured=true;
 assert.throws(partial.run,/without variables/);
});

test('reopened single-table body binds an absent native index to its exact rendered Data-0',()=>{
 const f=sourceFixture();f.loop.FPorts=[];f.task.allow_unconfigured=true;
 const ports=f.source.FPorts[0].FCollection,shapes=new Map();
 for(const p of ports){delete p.FPortIndex;shapes.set(p.FCell,{getAttribute:()=>`MF;TF-1;Graph;Same;${p.FType===0?'Input':'Output'}_Data-0`});}
 const container={contains:e=>[...shapes.values()].includes(e),querySelectorAll:()=>[{}]};
 const diagram={FNodes:{FCollection:[f.source,f.loop]},FmxGraph:{container,view:{getState:cell=>({shape:{node:shapes.get(cell)}})}}};
 // Use the same native diagram object captured by the fixture's active model.
 Object.assign(f.diagram,diagram);
 assert.equal(f.run().actual_ports.length,0);
 shapes.get(ports[0].FCell).getAttribute=()=> 'MF;TF-1;Graph;Same;Input_Data-1';
 assert.throws(f.run,/port identity/);
});

test('FOR source binds the observed variable port GUID, preserving inherited port identities',()=>{
 const f=sourceFixture();f.task.mode='for';f.task.variables={port_guid:'port0',definitions:[{id:7,index:0,name:'Page',type:'integer',value:99,is_null:false}]};
 for(const n of [f.source,f.loop])n.FPorts[0].FCollection[0].FSubType=3;
 assert.equal(f.run().ports[0].kind,'variables');assert.equal(f.run().actual_ports[1].kind,'table');
 f.task.variables.port_guid='replaced';assert.throws(f.run,/boundary port differs/);
});
test('FOR settings retain literal count and both identifier states',()=>{
 const s={for:true,count:'3',count_literal:true,parallel:false,identifiers:true,ignore_errors:false,save_configuration:false,
  variable_identity:{port_guid:'input-guid',definition_id:7,type:'integer'}};
 assert.equal(loopSettingsSupported(s,{...forParameters,mode:'for'}),true);
 assert.equal(loopSettingsSupported({...s,identifiers:false},{...forParameters,mode:'for',iteration_identifiers:false}),true);
 for(const patch of [{count:'0'},{count_literal:false},{parallel:true},{ignore_errors:true},{save_configuration:true},{variable_identity:{definition_id:7,type:'real'}}])
  assert.equal(loopSettingsSupported({...s,...patch},{...forParameters,mode:'for'}),false);
});

test('FOR result requires independent saved readback with the same variable definition',()=>{
 const node={...body,node_id:'loop'},variable={port_guid:'input-guid',definition_id:7,name:'Page',type:'integer',proxy:{module:'vars',instance:7}};
 const ports=[{direction:'input',index:0,guid:'input-guid',label:'Params',kind:'variables'},{direction:'output',index:0,guid:'output-guid',label:'Answers',kind:'table'}];
 const config={verified:true,mode:'for',node_context:node,body:{ref:body,label:'Body'},input_port:ports[0],settings:{for:true,count:'3',count_literal:true,parallel:false,identifiers:true,ignore_errors:false,save_configuration:false,variable_identity:{...variable,selected:true}}};
 const phases=['configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:'created:'+phase,value:{verified:true,cleanup_complete:true,
  ...(phase==='configure'?{configuration:config,validation:{status:'accepted_by_loginom_next'}}:phase==='output_mapping'?{actual_ports:ports,derived_component:{module:'body',instance:3},saved_configuration:{mode:'for',count:3,iteration_identifiers:true,variable}}:{settings_applied:true})}}));
 const read=()=>loopConfigurationReadback({node,phases,operation_id:'created'});
 assert.equal(read().variable.definition_id,7);assert.equal(read().count,3);
 phases[2].value.saved_configuration.variable={...variable,definition_id:8};assert.throws(read,/saved FOR readback differs/);
});
