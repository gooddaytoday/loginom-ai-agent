import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {Page,origin,build} from './support/workspace-ui-fixture.mjs';
import {createNodeProcedure,NodeReadinessTimeout} from '../lib/node-procedure.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {withBrowserReceipt} from '../lib/executor.mjs';
import {prepareTableRead} from '../lib/node-output-procedure.mjs';
import * as cold from '../../../../scripts/node-acceptance/cold-reader-policy.mjs';

// D67: real serialized dispatch and browser receipt, with the 27-second
// response delay from p13-final1/cold :195-196. Only native reads are fixtures.
for(const fault of ['refresh_before_click','none','busy_window','foreign_node','foreign_port','foreign_view','unknown_owner','foreign_dialog',
 'foreign_mask','no_dialog','unknown_setting','unknown_transport','lost_reply','pending_receipt','wrong_signature',
 'changed_receipt','no_gesture_proof','duplicate_gesture','late_inspect','late_observation','late_record','expired'])
test('cold Filter settles only its single completed late click: '+fault,async()=>{
 let time=1,reads=0,inspections=0,applied=false,opened=false;
 class Clock extends Date {static now(){return time;}}
 const page=new Page({clock:Clock}),table={table_tid:'MF;TF-1;ViewsForm;BrowseView-2',
  view_guid:'11111111-1111-1111-1111-111111111111',port_guid:'22222222-2222-2222-2222-222222222222'};
 for(const [suffix,label] of [['btnDataGridShowNulls','Nulls'],['btnDataGridDataTypeIcon','Types'],['btnDataGridFilter','Фильтр']])
  page.add('button',table.table_tid+';'+suffix,label,{x:100+page.document.all().length*15,y:100,width:12,height:20});
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},binding={document_id:'doc',node,
  workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:"scenario",label:"Scenario"}]}};
 const context={verified:true,...node,surface:'views',tid:'MF;TF-1;ViewsForm'};
 page.context.readOwnedContext=async()=>context;
 const operation={id:'cold-filter',deadline:540000,action:{action_key:'acceptance.cold_read',revision:'1'}},records=[];
 const originalClick=page.mouse.click;
 page.mouse.click=async(...args)=>{await originalClick(...args);time=27002;opened=true;};
 let refreshed=false;
 const execute=async code=>{
  if(fault==='refresh_before_click'&&!refreshed&&code.includes('"mode":"act"')){
   refreshed=true;
   const old=page.document.all().find(e=>e.getAttribute('data-tid')===table.table_tid+';btnDataGridFilter');
   const parent=old.parentElement,box=old.box;old.remove();
   page.add('button',table.table_tid+';btnDataGridFilter','Фильтр',box,parent);
   page.mutationObserver.pending.push({type:'attributes',target:page.tab,attributeName:'title'});
  }
  const result=await runInContext('('+code.replaceAll(readPreparedNodeContext.toString(),'readOwnedContext')+')',page.context)(page);
  if(result.action_key==='ui.act'){
   if(fault==='unknown_transport')operation.transportUncertain=true;
   if(fault==='lost_reply')throw Error('lost browser reply');
   if(fault==='no_gesture_proof')result.trace=result.trace.filter(t=>t.event!=='ui_gesture_applied');
   if(fault==='duplicate_gesture')result.trace.push(result.trace.find(t=>t.event==='ui_gesture_applied'));
  }
  return result;
 };
 const procedure=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:origin,targetBuild:build,now:()=>time,
  record:async e=>{records.push(structuredClone(e));return structuredClone(e)},execute,
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:'test',receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const initial=await procedure.observe({condition:'fixture bound Filter',ready:s=>s.ui.elements.some(e=>e.tid===table.table_tid+';btnDataGridFilter')});
 const bound=structuredClone(initial);
 initial.node_outputs={verified:true,surface:'views',tables:[{...table,active:true}],port_panels:[{port_guid:table.port_guid}]};
 for(const [suffix,kind] of [['btnDataGridShowNulls','nulls'],['btnDataGridDataTypeIcon','data_types']])
  initial.ui.elements.find(e=>e.tid===table.table_tid+';'+suffix).view_toggle={kind,pressed:true};
 const after=()=>{
  const s=structuredClone(initial),modal=table.table_tid+';ModalWindow_BrowseFilter';
  s.node_table_dialog={table,kind:'filter'};
  s.ui.dialogs=applied?[]:[{ref:'filter-dialog',identity:{anchor_tid:modal}}];s.ui.masks=[];
  s.table_settings={status:'observed',kind:'filter',view_key:table.table_tid,modal_ref:'filter-dialog',
   filter:{enabled:{status:'observed',value:false}}};
  s.ui.elements.push({ref:'apply',tid:modal+';btnApply',allowed_actions:['click']});
  if(!applied){
   if(fault==='foreign_node')s.prepared_node_context.node_id='foreign';
   if(fault==='foreign_port')s.node_outputs.tables[0].port_guid='33333333-3333-3333-3333-333333333333';
   if(fault==='foreign_view')s.node_outputs.tables[0].view_guid='33333333-3333-3333-3333-333333333333';
   if(fault==='unknown_owner')s.node_outputs.verified=false;
   if(fault==='foreign_dialog')s.ui.dialogs[0].identity.anchor_tid='foreign';
   if(fault==='foreign_mask')s.ui.masks=[{kind:'busy',target_tid:'foreign'}];
   if(fault==='no_dialog')s.ui.dialogs=[];
   if(fault==='unknown_setting')s.table_settings.filter.enabled.status='unobserved';
  }
  return s;
 };
 const channel={get lastPreparedStep(){return procedure.lastPreparedStep;},
  perform:async options=>{
   if(options.condition==='open bound Table filter')return procedure.perform({...options,initialObservation:bound,ready:s=>options.ready({...s,node_outputs:initial.node_outputs})});
   assert.equal(options.resolve(after()).ref,'apply');applied=true;
  },
  observe:async options=>{
   if(options.condition==='Table nulls toggle available')return initial;
   const s=after();
   if(options.condition==='settle the dispatched cold Table Filter'){
    reads++;assert.ok(options.timeoutMs<=15000);assert.deepEqual(options.tableDialog,{table,kind:'filter'});
    if(fault==='busy_window'&&reads===1){time+=options.timeoutMs;throw new NodeReadinessTimeout(options.condition);}
    if(!options.ready(s)){time+=options.timeoutMs;throw new NodeReadinessTimeout(options.condition);}
    if(fault==='late_observation')time=operation.deadline;
   }else assert.equal(options.ready(s),true,options.condition);
   return s;
  }};
 const run=()=>prepareTableRead(channel,table,{openFilter:args=>cold.openColdTableFilter(channel,args,{node,operation,now:()=>time,
  record:async e=>{records.push(structuredClone(e));if(fault==='late_record')time=operation.deadline;return e;},
  readReceipt:async ref=>{
   inspections++;
   const r=await execute(withBrowserReceipt('null',{receipt_namespace:'test',receipt_id:ref.id,
    receipt_signature:fault==='wrong_signature'?'foreign':ref.signature,operation_id:ref.operation_id,receipt_read:true}));
   const inspected=structuredClone(r.output);
   if(fault==='pending_receipt')inspected.state='running';
   if(fault==='changed_receipt')inspected.receipt.cleanup_complete=false;
   if(fault==='late_inspect')time=operation.deadline;
   return inspected;
  }})});
 if(fault==='expired')time=operation.deadline;
 if(['refresh_before_click','none','busy_window'].includes(fault)){
  const result=await run();assert.equal(result.filter_enabled,false);assert.equal(applied,true);
  assert.equal(records.filter(e=>e.phase==='cold_table_filter_settled').length,1);
  assert.equal(inspections,1);assert.equal(reads,fault==='busy_window'?2:1);
  if(fault==='refresh_before_click'){
   assert.equal(records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
   assert.notEqual(procedure.lastPreparedStep.action.ref,initial.ui.elements.find(e=>e.tid.endsWith(';btnDataGridFilter')).ref);
  }
 }else{await assert.rejects(run());assert.equal(applied,false);}
 assert.equal(page.clickedPoints.length,fault==='expired'?0:1);
 assert.equal(operation.deadline,540000);
 if(opened&&fault!=='lost_reply'){
  const r=records.filter(e=>e.phase==='node_step_completed').at(-1).outcome;
  assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);
  assert.equal(r.error.code,'UI_DEADLINE_EXCEEDED');
 }
});
