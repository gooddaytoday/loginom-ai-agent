import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {Page,origin,build} from './support/workspace-ui-fixture.mjs';
import {createNodeProcedure,NodeReadinessTimeout} from '../lib/node-procedure.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {withBrowserReceipt} from '../lib/executor.mjs';
import {performColdNodeAction} from '../../../../scripts/node-acceptance/cold-reader-policy.mjs';

// LAB-167 cold :41-42: completed btnProgress click at 27636ms, not a
// pre-gesture lock refusal. Real serialized dispatch and browser receipt.
for(const fault of ['none','busy','foreign_node','foreign_document','foreign_workflow','foreign_panel','duplicate_grid',
 'foreign_mask','foreign_dialog','unknown_owner','wrong_button','wrong_condition','unknown_transport','lost_reply',
 'pending_receipt','changed_receipt','no_gesture','duplicate_gesture','late_inspect','late_observe','late_record','expired'])
test('cold progress settles its single completed late click: '+fault,async()=>{
 let time=1,reads=0,inspections=0;
 class Clock extends Date {static now(){return time;}}
 const page=new Page({clock:Clock}),button='MF;cntMain;tlbMainToolbar;'+(fault==='wrong_button'?'btnOther':'btnProgress');
 page.add('button',button,'Progress',{x:100,y:100,width:40,height:20});
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
 const binding={document_id:'doc',node,workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',
  tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:'scenario',label:'Scenario'}]}};
 const context={verified:true,...node,surface:'graph',tid:'MF;TF-1;Graph;node',locked:false};
 page.context.readOwnedContext=async()=>context;
 const operation={id:'cold-progress',deadline:540000,action:{action_key:'acceptance.cold_read',revision:'1'}},records=[];
 const originalClick=page.mouse.click;
 page.mouse.click=async(...args)=>{await originalClick(...args);time=27637;};
 const execute=async code=>{
  const result=await runInContext('('+code.replaceAll(readPreparedNodeContext.toString(),'readOwnedContext')+')',page.context)(page);
  if(result.action_key==='ui.act'){
   if(fault==='unknown_transport')operation.transportUncertain=true;
   if(fault==='lost_reply')throw Error('lost reply');
   if(fault==='no_gesture')result.trace=result.trace.filter(e=>e.event!=='ui_gesture_applied');
   if(fault==='duplicate_gesture')result.trace.push(result.trace.find(e=>e.event==='ui_gesture_applied'));
  }
  return result;
 };
 const procedure=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:origin,targetBuild:build,
  now:()=>time,execute,record:async e=>{records.push(structuredClone(e));return structuredClone(e)},
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:'progress-test',
   receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const initial=await procedure.observe({condition:'progress available',ready:s=>s.ui.elements.some(e=>e.tid===button)});
 const channel={get lastPreparedStep(){return procedure.lastPreparedStep;},perform:o=>procedure.perform(o),observe:async o=>{
  reads++;assert.equal(o.readProcessControls,true);assert.equal(o.readProcesses,false);assert.ok(o.timeoutMs<=15000);
  const state=structuredClone(initial);state.node_process_controls_read=true;state.wizard={status:'absent'};
  state.observation_root={ref:'console-root',identity:{anchor_tid:'ConsoleForm',path:[]}};
  for(const tid of ['ConsoleForm;ProgressForm;trpProgress;treepanel;tree','ConsoleForm;ProgressForm;trpProgress;grd;tbl'])
   state.ui.elements.push({ref:tid,tid,allowed_actions:[]});
  if(fault==='foreign_node')state.prepared_node_context.node_id='other';
  if(fault==='foreign_document')state.dom_epoch.document='other';
  if(fault==='foreign_workflow')state.workflow_ref.tab_tid='other';
  if(fault==='foreign_panel')state.observation_root.identity.anchor_tid='foreign';
  if(fault==='duplicate_grid')state.ui.elements.push(state.ui.elements.at(-1));
  if(fault==='foreign_mask')state.ui.masks=[{kind:'busy',target_tid:'foreign'}];
  if(fault==='foreign_dialog')state.ui.dialogs=[{ref:'foreign'}];
  if(fault==='unknown_owner')state.prepared_node_context.verified=false;
  if(fault==='busy'&&reads===1||!o.ready(state)){time+=o.timeoutMs;throw new NodeReadinessTimeout(o.condition);}
  if(fault==='late_observe')time=operation.deadline;
  return state;
 }};
 const run=()=>performColdNodeAction(channel,{
  condition:fault==='wrong_condition'?'ordinary click':'execution control MF;cntMain;tlbMainToolbar;btnProgress',initialObservation:initial,
  ready:s=>s.ui.elements.filter(e=>e.tid===button&&e.allowed_actions.includes('click')).length===1,
  resolve:s=>({verb:'click',ref:s.ui.elements.find(e=>e.tid===button).ref}),identity:()=>node,
 },{node,operation,now:()=>time,record:async e=>{records.push(structuredClone(e));if(fault==='late_record')time=operation.deadline;},
  readReceipt:async ref=>{
   inspections++;const r=await execute(withBrowserReceipt('null',{receipt_namespace:'progress-test',receipt_id:ref.id,
    receipt_signature:ref.signature,operation_id:ref.operation_id,receipt_read:true}));
   const result=structuredClone(r.output);
   if(fault==='pending_receipt')result.state='running';
   if(fault==='changed_receipt')result.receipt.cleanup_complete=false;
   if(fault==='late_inspect')time=operation.deadline;
   return result;
  }});
 if(fault==='expired')time=operation.deadline;
 if(['none','busy'].includes(fault)){
  await run();assert.equal(inspections,1);assert.equal(reads,fault==='busy'?2:1);
  assert.equal(records.filter(e=>e.phase==='cold_process_console_settled').length,1);
 }else await assert.rejects(run());
 assert.equal(page.clickedPoints.length,['wrong_button','expired'].includes(fault)?0:1);
 assert.equal(operation.deadline,540000);
 if(page.clickedPoints.length&&fault!=='lost_reply'){
  const r=records.find(e=>e.phase==='node_step_completed').outcome;
  assert.equal(r.status,'AMBIGUOUS');assert.equal(r.error.code,'UI_DEADLINE_EXCEEDED');
 }
});
