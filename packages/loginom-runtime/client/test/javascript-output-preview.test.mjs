import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {managedJavascriptPreviewAdmission} from '../lib/javascript-output-preview.mjs';
import {runInNewContext} from 'node:vm';
import {Element} from './support/workspace-ui-fixture.mjs';
import {captureManagedJavascriptSelection} from '../lib/javascript-managed-selection.mjs';
import {captureJavascriptSelection} from '../lib/javascript-owned-selection.mjs';
import {inspectJavascriptVisualizers} from '../lib/javascript-output-context.mjs';
import {inspectJavascriptPreviewPort} from '../lib/javascript-output-preview.mjs';
import {runJavascriptOutputPreview} from '../lib/javascript-output-preview.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {preflightGroupingSource} from '../lib/grouping-preflight.mjs';
import {preflightSortingSource} from '../lib/sorting-preflight.mjs';
const source=()=>JSON.parse(readFileSync(new URL('./fixtures/javascript-preflight-source.json',import.meta.url),'utf8'));
function fixture(){
 const history=source(),node=history.outcome.output.node;
 const binding={document_id:node.document_id,node,workflow_ref:{...history.request.workflow_ref,navigation_path:history.request.workflow_ref.navigation_path.map(p=>({...p,label:p.label==='Package1'?'SavedPackage':p.label}))}};
 const port={index:0,native_index:0,active:true,port_guid:history.outcome.output.output.ports[0].port_guid};
 return {history,binding,port};
}
test('completed actual managed JS receipt admits a fresh native preview under the current workflow',()=>{
 const f=fixture(),before=structuredClone(f);
 const proof=managedJavascriptPreviewAdmission([f.history],f.binding,f.port);
 assert.equal(proof.source_operation_id,'pareto-001');
 assert.equal(proof.execution_id,f.history.outcome.output.execution.execution_id);
 assert.deepEqual(proof.schema.map(f=>f.name),['item_id','item_name','annual_revenue','profit','total_storage_cost','cumulative_revenue','total_revenue','cumulative_share','abc_class']);
 assert.deepEqual(f,before);
});

for(const [name,change] of Object.entries({
 staleLatest:f=>{f.history.sequence=2;f.history.outcome.status='AMBIGUOUS';},
 missingCleanup:f=>f.history.cleanup_confirmed=false,
 foreignDocument:f=>f.binding.node.document_id='foreign',
 foreignWorkflow:f=>f.binding.workflow_ref.workflow_id='foreign',
 foreignNode:f=>f.binding.node.node_id='foreign',
 foreignPort:f=>f.port.port_guid='foreign',
 wrongIndex:f=>f.port.native_index=1,
 inactive:f=>f.port.active=false,
 incompleteExecution:f=>f.history.outcome.output.execution.status='pending',
 staleOutput:f=>f.history.outcome.output.output.ports[0].fresh=false,
 otherExecution:f=>f.history.outcome.output.output.ports[0].execution_id='other',
 missingMapping:f=>delete f.history.outcome.output.configuration.readback.output_mapping,
}))test('managed preview refuses '+name+' before browser mutation',()=>{
 const f=fixture();change(f);assert.throws(()=>managedJavascriptPreviewAdmission([f.history],f.binding,f.port));
});
test('later unfinished edit blocks an older successful source',()=>{
 const f=fixture(),pending={sequence:2,request:{...f.history.request,target:{...f.history.request.target,kind:'existing',ref:f.binding.node}},outcome:null,cleanup_confirmed:false};
 assert.throws(()=>managedJavascriptPreviewAdmission([f.history,pending],f.binding,f.port),/not settled/);
});

function browserFixture(){
 const f=fixture(),prefix=f.binding.workflow_ref.prefix,tid=prefix+';Graph;Сортировка_и_накопленная_доля_выручки';
 const shape=new Element('g',{'data-tid':tid},'',{x:10,y:10,width:100,height:40});
 const portShape=new Element('g',{'data-tid':tid+';Output_Data-0'},'',{x:40,y:50,width:15,height:24});
 portShape.append(new Element('image',{href:'output_table_active.svg'}));
 const container=new Element('div',{'data-tid':prefix+';ModelForm;cmpDiagram'});container.root=true;container.append(shape,portShape);
 const native={FGuid:f.binding.node.node_id,FIconCls:'bg-vendor-icon-javascript',data:{},FCell:{}};
 const port={FGuid:f.port.port_guid,FType:1,FSubType:1,parent:native,FCell:{parent:native.FCell},data:{}};native.FPorts=[{FCollection:[port]}];
 const selected=[];
 const graph={container,getSelectionCells:()=>selected,view:{getState:cell=>({shape:{node:cell===port.FCell?portShape:shape}})}};
 class ModelForm{}
 const model=new ModelForm();model.FDiagram={FNodes:{FCollection:[native]},FmxGraph:graph};
 const workflow={},tab={Controller:{Node:{data:{node:workflow}},FController:model}},tabElement=new Element('div',{class:'x-tab-active'});
 const document={elementFromPoint:()=>portShape,querySelectorAll:selector=>selector.includes('cmpDiagram')?[container]
  :selector.startsWith('[data-tid=')?[tabElement]:[]};
 const preparation={id:f.binding.document_id,document,receipts:new Map([['receipt',{phase:'verified',workflowId:f.binding.node.workflow_id,tab:tabElement,packageNode:{},nodeTargetWorkflowNode:workflow}]])};
 const task={owner:f.binding.node,workflow_ref:{prefix,tab_tid:f.binding.workflow_ref.tab_tid},output:f.port,targetOrigin:'http://localhost',targetBuild:'7.4.2',deadline:Date.now()+5000};
 const context={task,document,location:{origin:task.targetOrigin},getComputedStyle:e=>({visibility:'visible',display:'block',...e.style}),innerWidth:1280,innerHeight:800,
  bg:{app:{Version:task.targetBuild,ModelForm,Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}},Items:{Workspace:{getActiveTab:()=>tab}}}}}}},__loginomDockPreparationV1:preparation};
 const held=runInNewContext('('+captureManagedJavascriptSelection.toString()+')(task,('+captureJavascriptSelection.toString()+'))',context);
 const inspect=(ticket=null,capture=false)=>runInNewContext('('+inspectJavascriptPreviewPort.toString()+')(args,('+inspectJavascriptVisualizers.toString()+'))',{...context,args:{held,task,ticket,capture}});
 return {task,context,held,port,native,selected,portShape,inspect};
}
test('actual script output admits only a native-bound port preview without Visualizers or Setting',()=>{
 const f=browserFixture(),ticket=f.inspect(null,true),before=f.inspect(ticket);
 assert.equal(before.selected,false);assert.equal(before.port_guid,f.port.FGuid);
 assert.deepEqual({...before.point},{x:47.5,y:62});
 f.selected.push(f.port.FCell);
 assert.equal(f.inspect(ticket).selected,true);
});

test('owned preview performs one port click followed by one F3 and retains unknown gestures',async()=>{
 const f=browserFixture(),events=[],task={...f.task,operation_id:'preview',mode:'capture'};
 const page={evaluateHandle:async(fn,args)=>({value:fn(args),dispose:async()=>{events.push('dispose');},getProperty:async()=>({asElement:()=>({press:async key=>events.push(key)}),dispose:async()=>{}})}),
  evaluate:async(fn,args)=>fn({...args,held:args.held?.value,ticket:args.ticket?.value}),
  mouse:{click:async()=>{events.push('click');f.selected.push(f.port.FCell);}},
  locator:()=>({press:async key=>{events.push(key);}})};
 const capture=()=>f.held,inspect=args=>f.inspect(args.ticket,args.capture);
 const before=await runJavascriptOutputPreview(page,task,capture,inspect);
 assert.equal(before.selected,false);
 const selected=await runJavascriptOutputPreview(page,{...task,mode:'select',gesture_id:'select',expected:before},capture,inspect);
 assert.equal(selected.status,'SUCCEEDED');assert.equal(selected.cleanup_complete,true);
 const after=await runJavascriptOutputPreview(page,{...task,mode:'inspect'},capture,inspect);
 assert.equal(after.selected,true);
 const opened=await runJavascriptOutputPreview(page,{...task,mode:'open',gesture_id:'open',expected:after},capture,inspect);
 assert.equal(opened.status,'SUCCEEDED');assert.equal(opened.cleanup_complete,false);
 await assert.rejects(runJavascriptOutputPreview(page,{...task,mode:'open',gesture_id:'open',expected:after},capture,inspect),/already|lease/);
 assert.deepEqual(events,['click','F3']);
 await runJavascriptOutputPreview(page,{...task,mode:'dispose'},capture,inspect);
 assert.deepEqual(events,['click','F3','dispose','dispose']);
});

function channelFixture(){
 const f=browserFixture(),records=[],events=[];
 const unwrap=args=>Object.fromEntries(Object.entries(args).map(([k,v])=>[k,v?.handleValue??v]));
 const evaluate=(fn,args)=>runInNewContext('('+fn.toString()+')',f.context)(unwrap(args));
 const page={evaluate:async(fn,args)=>evaluate(fn,args),evaluateHandle:async(fn,args)=>({handleValue:evaluate(fn,args),dispose:async()=>{},getProperty:async()=>({asElement:()=>({press:async key=>events.push(key)}),dispose:async()=>{}})}),
  mouse:{click:async()=>{events.push('click');f.selected.splice(0,f.selected.length,f.port.FCell);}},
  locator:()=>({press:async key=>events.push(key)})};
 const operation={id:'group-001',action:{action_key:'node.apply',revision:'1.0.0'},deadline:Date.now()+10000,
  parameters:{target:{type:'transform.group_data'}}};
 const options={operation,targetOrigin:f.task.targetOrigin,targetBuild:f.task.targetBuild,preparedNodeContext:fixture().binding,
  record:async entry=>{records.push(entry);return structuredClone(entry);},
  wrapMutation:(code,options)=>({code,options}),execute:async code=>runInNewContext('('+(typeof code==='string'?code:code.code)+')',{Symbol,Map,Date})(page)};
 return {...f,page,operation,options,records,events,channel:createNodeProcedure(options)};
}
test('managed preview journals each fixed gesture and keeps cleanup pending until preview Close',async()=>{
 const f=channelFixture();await f.channel.openJavascriptPreview(f.task.output);
 assert.deepEqual(f.events,['click','F3']);assert.equal(f.operation.cleanupConfirmed,false);
 assert.equal(f.operation.nodeEffectPossible,true);
 const steps=f.records.filter(r=>r.phase==='node_step_prepared');
 assert.deepEqual(steps.map(r=>r.action.verb),['javascript_preview_select','javascript_preview_open']);
 assert.equal(f.records.filter(r=>r.phase==='node_step_completed').length,2);
 assert.equal(new Set(steps.map(r=>r.internal_operation_id)).size,2);
});

function preflightFixture(type){
 const f=fixture(),port={...f.port,tid:f.binding.workflow_ref.prefix+';Graph;Сортировка_и_накопленная_доля_выручки;Output_Data-0'};
 const context={verified:true,...f.binding.node,surface:'graph',locked:false};
 const state={origin:'http://localhost',loginom_build:'7.4.2',workflow_ref:f.binding.workflow_ref,dom_epoch:{document:f.binding.document_id},
  scan:{complete:true},wizard:{status:'absent'},prepared_node_context:context,
  ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[{tid:port.tid,ref:'script-port',kind:'port',
   signature:{native_graph:{status:'script',icon:'bg-vendor-icon-javascript'}},enabled:true,visible:true,allowed_actions:[]}]}};
 const calls=[],operation={id:'native-after-js',action:{action_key:'node.apply',revision:'1.0.0'},deadline:Date.now()+5000,
  parameters:{document_id:f.binding.document_id,workflow_ref:f.binding.workflow_ref,target:{kind:'new',type},
   inputs:[{source:f.binding.node,input:0,output:0}],mappings:[],parameters:type==='transform.group_data'
    ?{group_by:[{kind:'input_field',name:'abc_class'}],measures:[{field:{kind:'input_field',name:'annual_revenue'},function:'sum',name:'revenue',label:'Revenue'}]}
    :{keys:[{field:{kind:'input_field',name:'annual_revenue'},direction:'DESC'}]}}};
 const options={operation,nodeHistory:()=>[f.history],onRecord:async r=>structuredClone(r),
  receiptOptions:()=>assert.fail('no mutation before private capture'),execute:async code=>{
   calls.push(code);
   if(code.includes('runJavascriptOutputPreview'))throw Error('reached owned preview capture');
   if(code.includes('readOutputContext'))return {verified:true,node_context:context,ports:[port],execution_freshness_verified:false};
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }};
 return {history:f.history,binding:f.binding,context,state,port,calls,options,run:()=> (type==='transform.group_data'?preflightGroupingSource:preflightSortingSource)(options,{},
  {targetOrigin:'http://localhost',targetBuild:'7.4.2'})};
}
test('actual denied JS port routes Group preflight to owned fresh preview before any target creation',async()=>{
 const f=preflightFixture('transform.group_data');await assert.rejects(f.run(),/reached owned preview capture/);
 assert.equal(f.calls.filter(code=>code.includes('runJavascriptOutputPreview')).length,1);
});
test('new Sort after managed JS uses the same owned fresh preview',async()=>{
 const f=preflightFixture('transform.sorting');await assert.rejects(f.run(),/reached owned preview capture/);
 assert.equal(f.calls.filter(code=>code.includes('runJavascriptOutputPreview')).length,1);
});

test('F3 uses the retained native port element even when another graph has the same data-tid',async()=>{
 const f=channelFixture();f.page.locator=()=>assert.fail('global locator could address a cached foreign graph');
 await f.channel.openJavascriptPreview(f.task.output);assert.deepEqual(f.events,['click','F3']);
});

for(const [name,change] of Object.entries({
 account:f=>f.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName='foreign',
 receipt:f=>f.held.preparation.receipts.clear(),
 document:f=>f.context.document={},
 workflow:f=>f.held.binding.tab.Controller.Node.data.node={},
 node:f=>f.native.FGuid='foreign',
 icon:f=>f.native.FIconCls='bg-vendor-icon-calculator',
 port:f=>f.port.FGuid='foreign',
 portData:f=>f.port.data={},
 portCell:f=>f.port.FCell={parent:f.native.FCell},
 portType:f=>f.port.FType=0,
 portSubtype:f=>f.port.FSubType=2,
 nativeIndex:f=>f.task.output.native_index=1,
 selectedForeign:f=>f.selected.push({}),
 hidden:f=>f.portShape.style.display='none',
 covered:f=>f.context.document.elementFromPoint=()=>null,
 expiredOwner:f=>f.held.receipt.phase='pending',
}))test('native preview refuses changed '+name,()=>{
 const f=browserFixture(),ticket=f.inspect(null,true);change(f);
 assert.throws(()=>f.inspect(ticket));
});
test('lost port click is never replayed and leaves the operation unresolved',async()=>{
 const f=channelFixture();f.page.mouse.click=async()=>{f.events.push('lost click');throw Error('lost transport');};
 await assert.rejects(f.channel.openJavascriptPreview(f.task.output),/lost transport/);
 assert.equal(f.operation.transportUncertain,true);assert.equal(f.operation.cleanupConfirmed,false);
 assert.deepEqual(f.events,['lost click']);
 const lease=[...f.page[Symbol.for('loginom-dock.javascript-output-preview-v1')].values()][0];
 assert.equal(lease.selectAttempted,true);assert.equal(lease.selectReturned,undefined);
});
test('wrong prepare ACK authorizes neither port click nor F3',async()=>{
 const f=channelFixture();f.options.record=async record=>({...record,signature:'wrong'});
 await assert.rejects(createNodeProcedure(f.options).openJavascriptPreview(f.task.output),/durably prepared/);
 assert.deepEqual(f.events,[]);
});
for(const type of ['transform.calculator','transform.union_data'])test('private preview does not admit '+type,async()=>{
 const f=channelFixture();f.operation.parameters.target.type=type;
 await assert.rejects(f.channel.openJavascriptPreview(f.task.output),/restricted/);assert.deepEqual(f.events,[]);
});

for(const type of ['transform.group_data','transform.sorting'])test(type+' reads the fresh full preview and closes it even if schema changed',async()=>{
 for(const changed of [false,true]){
  const f=preflightFixture(type),browser=channelFixture(),records=[];
  const original=f.options.execute,root=f.binding.workflow_ref.prefix+';ModelForm;PreviewWindow';
  let receipt;
  f.options.onRecord=async r=>{records.push(r);return structuredClone(r);};
  f.options.receiptOptions=(id,action_key,signature)=>{receipt={id,action_key};return {receipt_namespace:'test',receipt_id:id,receipt_signature:signature};};
  const schema=f.history.outcome.output.configuration.readback.output_mapping.fields.map(({index,name,label,type})=>({index,name,label,type}));
  if(changed)schema[2].type='string';
  f.options.execute=async code=>{
   if(code.includes('runJavascriptOutputPreview'))return runInNewContext('('+code+')',{Symbol,Map,Date})(browser.page);
   if(code.includes('browserReceipt')){
    browser.events.push('close');return {status:'SUCCEEDED',action_key:receipt.action_key,operation_id:receipt.id,effect_possible:true,cleanup_complete:true};
   }
   if(code.includes('readNodePreviewSchema'))return {verified:true,inventory_complete:true,fields:schema,root_tid:root,
    port:0,port_guid:f.port.port_guid,node_id:f.binding.node.node_id,node_context:f.context};
   if(browser.events.includes('F3')&&!browser.events.includes('close')){
    const state=structuredClone(f.state);state.ui.elements=[{ref:'ui-preview',tid:root,allowed_actions:[]},
     {ref:'ui-close',tid:root+';p.h;close',allowed_actions:['click']}];
    state.ui.dialogs=[{ref:'ui-preview',identity:{anchor_tid:root}}];return {status:'SUCCEEDED',output:state};
   }
   return original(code);
  };
  if(changed)await assert.rejects(f.run(),/field identity changed/);
  if(!changed){const proof=await f.run();assert.equal(proof.verified,true);assert.equal(proof.parameters_valid,true);}
  assert.deepEqual(browser.events,['click','F3','close']);
  assert.equal(f.options.operation.cleanupConfirmed,true);
  assert.equal(records.at(-1).proof.parameters_valid,!changed);
  assert.deepEqual(records.at(-1).proof.managed_javascript_source,{source_operation_id:'pareto-001',execution_id:f.history.outcome.output.execution.execution_id});
 }
});
test('foreign managed gesture receipt cannot mark preview cleanup confirmed',async()=>{
 const f=channelFixture(),execute=f.options.execute;
 f.options.execute=async code=>{const result=await execute(code);return typeof code==='string'?result:
  {...result,output:{...result.output,node_context:{...result.output.node_context,node_id:'foreign'}}};};
 await assert.rejects(createNodeProcedure(f.options).openJavascriptPreview(f.task.output),/did not confirm/);
 assert.equal(f.operation.cleanupConfirmed,false);assert.deepEqual(f.events,['click']);
});
test('lost completed-step journal ACK retains unconfirmed cleanup',async()=>{
 const f=channelFixture();f.options.record=async record=>{if(record.phase==='node_step_completed')throw Error('journal unavailable');return record;};
 await assert.rejects(createNodeProcedure(f.options).openJavascriptPreview(f.task.output),/journal unavailable/);
 assert.equal(f.operation.cleanupConfirmed,false);assert.deepEqual(f.events,['click']);
});
test('locked managed producer refuses capture and revalidation before another gesture',()=>{
 for(const afterCapture of [false,true]){
  const f=browserFixture(),ticket=afterCapture?f.inspect(null,true):null;f.native.FLocked=true;
  assert.throws(()=>f.inspect(ticket,!afterCapture),/locked/);
 }
});
