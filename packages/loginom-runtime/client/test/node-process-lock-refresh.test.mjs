import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {Page,build,origin} from './support/workspace-ui-fixture.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';

// D65: saved p13 cold :99 (true -> false, no effect) and :75
// (false -> true, one earlier gesture) on the real serialized browser path.
for(const locked of [false,true])for(const fault of ['none','document','workflow','node','tid','surface','unverified','unknown_lock','other_control','other_verb','post_effect','unknown_reply','churn','cancel','deadline'])
test('D65 Process Console full observation refresh '+locked+' '+fault,async()=>{
 let current=!locked,dispatches=0,reading=0,acting=false,clicked=false,time=1,postReads=0;
 class Clock extends Date {static now(){return time;}}
 const page=new Page({clock:Clock}),tid=fault==='other_control'?'MF;cntMain;tlbMainToolbar;btnOther':'MF;cntMain;tlbMainToolbar;btnProgress';
 page.add('button',tid,'Процессы');
 const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:'scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'node'}};
 const owner={verified:true,...binding.node,surface:'graph',tid:'MF;TF-1;Graph;Reform'};
 const reader=async()=>{
  if(acting)reading++;
  const drift=acting&&(dispatches===1||fault==='churn')&&(fault==='post_effect'?clicked&&++postReads>=2:reading>=2);
  if(drift)current=locked;
  const value={...owner,locked:current};
  if(drift){
   if(fault==='document')value.document_id='foreign';
   if(fault==='workflow')value.workflow_id='foreign';
   if(fault==='node')value.node_id='foreign';
   if(fault==='tid')value.tid='MF;TF-1;Graph;Other';
   if(fault==='surface')value.surface='wizard';
   if(fault==='unverified')value.verified=false;
   if(fault==='unknown_lock')value.locked=undefined;
  }
  return value;
 };
 page.context.readOwnedContext=reader;
 const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);clicked=true;};
 const operation={id:'cold',deadline:10000,action:{action_key:'acceptance.cold_read',revision:'1'}};
 const controller=new AbortController(),records=[],receipts=[];
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:origin,targetBuild:build,now:()=>time,signal:controller.signal,
  record:async e=>{records.push(structuredClone(e));if(e.phase==='node_step_refresh_authorized'){
   if(fault==='cancel')controller.abort();if(fault==='deadline')time=operation.deadline;
  }return structuredClone(e)},wrapMutation:(code,receipt)=>({code,receipt}),
  execute:async code=>{
   const act=typeof code!=='string';acting=act;reading=0;postReads=0;
   if(act){dispatches++;if(fault==='churn')current=!locked;}
   const script=(act?code.code:code).replace(readPreparedNodeContext.toString(),'readOwnedContext');
   const result=await runInContext('('+script+')',page.context)(page);acting=false;
   if(act){receipts.push(result);if(fault==='unknown_reply')throw Error('unacknowledged dispatch');}
   return result;
  }});
 const run=()=>channel.perform({condition:'Process Console available',ready:s=>s.ui.elements.some(e=>e.tid===tid),
  resolve:s=>({verb:fault==='other_verb'?'double_click':'click',ref:s.ui.elements.find(e=>e.tid===tid).ref}),identity:()=>({tid})});
 if(fault==='none'){
  await run();assert.equal(dispatches,2);assert.equal(page.clickedPoints.length,1);
  assert.equal(receipts[0].status,'NOT_APPLIED');assert.equal(receipts[0].phase,'observing');
  assert.ok(receipts[0].trace.some(e=>e.event==='prepared_node_surface_mismatch'));
  const refresh=records.filter(e=>e.phase==='node_step_refresh_authorized');assert.equal(refresh.length,1);
  assert.equal(refresh[0].reason,'prepared_node_lock_changed');
  assert.equal(records.filter(e=>e.phase==='node_observation_completed').length,2);
 }else{
  await assert.rejects(run());
  assert.equal(dispatches,fault==='churn'?3:1);
  assert.equal(page.clickedPoints.length,fault==='post_effect'?1:0);
  const authorized=records.filter(e=>e.phase==='node_step_refresh_authorized').length;
  assert.equal(authorized,fault==='churn'?2:['cancel','deadline'].includes(fault)?1:0);
  if(fault==='post_effect'){assert.equal(receipts[0].status,'AMBIGUOUS');assert.equal(receipts[0].effect_possible,true);}
 }
 assert.equal(operation.deadline,10000);
});
