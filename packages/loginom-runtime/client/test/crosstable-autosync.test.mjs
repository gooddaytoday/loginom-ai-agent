import test from 'node:test';
import assert from 'node:assert/strict';
import {completedCrossTableOutput,verifyCrossTableRetainedOutput,prepareCrossTableAutosync} from '../lib/crosstable-autosync.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'cross'},ctx={document_id:'doc',node};
function fixture(){
 const f={name:'Id',label:'Id',type:'integer'},m={verified:true,inventory_complete:true,source_identity_verified:true,
  node_context:{...node,output_port:{port:0}},autosync:false,source_fields:[{...f,required:true}],target_fields:[{...f,index:0,excluded:false,source:{...f}}]};
 const ids=['input','configure','saved','mapped','finished','execute','read'];
 const o={status:'SUCCEEDED',node,cleanup_complete:true,execution:{status:'completed',execution_id:'doc:1:2'},
  phases:ids.map(receipt_id=>({receipt_id,status:'verified'})),configuration:{readback:{kind:'crosstable',values_are:'observed_ui_values',node,
   output_scope:'observed_after_verified_execution',execution_id:'doc:1:2',receipt_ids:ids,output_mapping:m}},
  output:{ports:[{port:0,port_guid:'port',fresh:true,execution_id:'doc:1:2',schema:[f]}]}};
 return {sequence:1,cleanup_confirmed:true,request:{target:{kind:'existing',type:'transform.cross_table',ref:node}},outcome:{status:'SUCCEEDED',output:o}};
}
test('retained output uses the latest settled private execution and semantic source links',()=>{
 const i=fixture(),p=completedCrossTableOutput([i],ctx),m=structuredClone(p.mapping);
 m.source_fields[0].record_id='new-native-record';m.target_fields[0].source.record_id='new-native-record';
 assert.equal(verifyCrossTableRetainedOutput(p,m,ctx),true);assert.equal(p.port_guid,'port');
});
test('an unfinished, failed or unexecuted own change invalidates the older output',()=>{
 for(const fault of ['unfinished','failed','unexecuted']){
  const i=fixture(),latest=fixture();latest.sequence=2;
  if(fault==='unfinished')latest.outcome=null;
  if(fault==='failed')latest.outcome.status='FAILED';
  if(fault==='unexecuted')latest.outcome.output.execution.status='not_started';
  assert.throws(()=>completedCrossTableOutput([i,latest],ctx),/latest owned completed/);
 }
});
test('foreign owner, stale port, missing receipt and mismatched schema never grant early editing',()=>{
 for(const fault of ['owner','fresh','execution','receipt','schema','required','excluded']){
  const i=fixture(),o=i.outcome.output,c=o.configuration.readback;
  if(fault==='owner')c.node={...node,node_id:'foreign'};
  if(fault==='fresh')o.output.ports[0].fresh=false;
  if(fault==='execution')o.output.ports[0].execution_id='doc:1:3';
  if(fault==='receipt')o.phases.pop();
  if(fault==='schema')o.output.ports[0].schema[0].type='real';
  if(fault==='required')c.output_mapping.source_fields[0].required=false;
  if(fault==='excluded')c.output_mapping.target_fields[0].excluded=true;
  assert.throws(()=>completedCrossTableOutput([i],ctx));
 }
});
test('live source, target order, type, links, owner and option must still match before mutation',()=>{
 const p=completedCrossTableOutput([fixture()],ctx);
 for(const fault of ['owner','source','type','index','link','option','required']){
  const m=structuredClone(p.mapping);
  if(fault==='owner')m.node_context.node_id='foreign';
  if(fault==='source')m.source_fields[0].name='Other';
  if(fault==='type')m.target_fields[0].type='real';
  if(fault==='index')m.target_fields[0].index=1;
  if(fault==='link')m.target_fields[0].source.name='Other';
  if(fault==='option')m.autosync=true;
  if(fault==='required')m.source_fields[0].required=false;
  assert.throws(()=>verifyCrossTableRetainedOutput(p,m,ctx));
 }
});
test('new nodes, disabled/unrequested autosync and close never open an early port',async()=>{
 const base={target:{kind:'existing'},finish:'execute',mappings:[{direction:'output',port:0,autosync:true}]};
 for(const r of [{...base,target:{kind:'new'}},{...base,finish:'close'},{...base,mappings:[]},
  {...base,mappings:[{direction:'output',port:0,autosync:false}]},{...base,mappings:[{direction:'input',port:0,autosync:true}]}]){
  await prepareCrossTableAutosync({operation:{nodeApply:{request:r}},nodeHistory(){throw Error('history was accessed');}},ctx,{});
 }
});
