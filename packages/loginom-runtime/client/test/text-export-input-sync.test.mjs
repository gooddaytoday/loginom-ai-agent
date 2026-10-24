import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeTextExportInput} from '../lib/text-export-node.mjs';

function state({autosync=true,ordered=false}={}) {
 const sources=['OrderID','Customer','OrderAmount','PaidAmount','Debt'].map((name,index)=>({
  record_id:'s'+index,field_id:String(index),index,name,label:name,type:index<2?'string':'real',required:false}));
 const order=ordered?[0,1,2,3,4]:[4,0,1,2,3];
 return {wizard:{stage:'input_mapping',root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},node_mapping:{
  verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync,
  node_context:{verified:true,node_id:'export',document_id:'document',workflow_id:'workflow',surface:'wizard',
   input_port:{port:0,port_guid:'input',opening_operation_id:'opening'}},
  source_fields:sources,target_fields:order.map((n,index)=>({...sources[n],record_id:'t'+n,index,
   usage_type:0,default_usage_type:0,origin_type:0,inherited:false,data_kind:n<2?'Дискретный':'Непрерывный',source:sources[n]}))},
  ui:{elements:[{tid:'MF;TF-1;WizrdMCF;TuneDataSourceMappingWizard;btnSyncThroughColumns',ref:'sync',allowed_actions:['click']}]}};
}
function fixture(options={}) {
 const initial=state(options),calls=[];let current=structuredClone(initial);
 const channel={perform:async o=>{
  options.before?.(current);
  assert.equal(o.ready(current),true,'sync precondition');calls.push(o.resolve(current));
  if(options.lost)throw Error('unknown sync reply');
  current.node_mapping.target_fields.sort((a,b)=>a.source.index-b.source.index).forEach((f,index)=>f.index=index);
  options.after?.(current);
 },observe:async o=>{assert.equal(o.readMappings,true);assert.equal(o.ready(current),true,'sync readback owner');return current;}};
 return {initial,calls,run:()=>synchronizeTextExportInput(channel,initial)};
}
test('existing autosync Export synchronizes reordered source through the native Sync control',async()=>{
 const f=fixture(),after=await f.run();
 assert.deepEqual(f.calls,[{verb:'click',ref:'sync'}]);
 assert.deepEqual(after.target_fields.map(f=>f.name),after.source_fields.map(f=>f.name));
 for(const field of after.target_fields) {
  const original=f.initial.node_mapping.target_fields.find(f=>f.source.record_id===field.source.record_id);
  assert.deepEqual({...field,index:original.index},original);
 }
});
for(const options of [{autosync:false},{ordered:true}])test('Export preserves mapping without Sync '+JSON.stringify(options),async()=>{
 const f=fixture(options);assert.deepEqual(await f.run(),f.initial.node_mapping);assert.deepEqual(f.calls,[]);
});
for(const change of [s=>s.node_mapping.target_fields[0].name='CustomDebt',s=>s.node_mapping.target_fields[0].label='Custom debt',
 s=>s.node_mapping.target_fields[0].origin_type=1,s=>s.node_mapping.target_fields[0].source=null,
 s=>s.node_mapping.target_fields[0].excluded=true])test('Export does not synchronize a custom or incomplete mapping '+change,async()=>{
 const f=fixture();change(f.initial);assert.deepEqual(await f.run(),f.initial.node_mapping);assert.deepEqual(f.calls,[]);
});
const ownerFaults={node:s=>s.node_mapping.node_context.node_id='foreign',port:s=>s.node_mapping.node_context.input_port.port_guid='foreign',
 opening:s=>s.node_mapping.node_context.input_port.opening_operation_id='foreign',root:s=>s.wizard.root_ref='foreign',
 stage:s=>s.wizard.stage='output_mapping',inventory:s=>s.node_mapping.inventory_complete=false};
for(const [name,change] of Object.entries(ownerFaults))for(const when of ['before','after'])test('Sync refuses changed '+name+' '+when,async()=>{
 const f=fixture({[when]:change});await assert.rejects(f.run());assert.equal(f.calls.length,when==='before'?0:1);
});
for(const change of [s=>s.node_mapping.target_fields.reverse(),s=>s.node_mapping.target_fields.pop(),
 s=>s.node_mapping.target_fields[0].label='Changed',s=>s.node_mapping.target_fields[0].type='real',
 s=>s.node_mapping.target_fields[0].data_kind='Непрерывный',s=>s.node_mapping.target_fields[0].required=true,
 s=>s.node_mapping.target_fields[0].usage_type=1,s=>s.node_mapping.target_fields[0].field_id='changed',
 s=>s.node_mapping.target_fields[0].source=s.node_mapping.source_fields[1],s=>s.node_mapping.autosync=false,
 s=>s.node_mapping.source_fields[0].label='Changed'])test('Sync refuses changed mapping readback '+change,async()=>{
 const f=fixture({after:change});await assert.rejects(f.run());assert.equal(f.calls.length,1);
});
for(const change of [s=>s.ui.elements=[],s=>s.ui.elements[0].allowed_actions=[],s=>s.ui.elements.push({...s.ui.elements[0]})])
 test('Sync refuses unavailable or ambiguous native control '+change,async()=>{
  const f=fixture({before:change});await assert.rejects(f.run());assert.equal(f.calls.length,0);
 });
test('Sync never retries an unknown reply',async()=>{
 const f=fixture({lost:true});await assert.rejects(f.run(),/unknown sync reply/);assert.equal(f.calls.length,1);
});
