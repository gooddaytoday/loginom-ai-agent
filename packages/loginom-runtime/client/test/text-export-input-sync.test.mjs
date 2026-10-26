import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeTextExportInput} from '../lib/text-export-node.mjs';

function state({autosync=true,ordered=false}={}) {
 const sources=['OrderID','Customer','OrderAmount','PaidAmount','Debt'].map((name,index)=>({
  record_id:'s'+index,field_id:String(index),index,name,label:name,type:index<2?'string':'real',required:false}));
 const order=ordered?[0,1,2,3,4]:[4,0,1,2,3];
 return {wizard:{status:'observed',stage:'input_mapping',root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},node_mapping:{
  verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync,
  node_context:{verified:true,node_id:'export',document_id:'document',workflow_id:'workflow',surface:'wizard',
   input_port:{port:0,port_guid:'input',opening_operation_id:'opening'}},
  source_fields:sources,target_fields:order.map((n,index)=>({...sources[n],record_id:'t'+n,index,
   usage_type:0,default_usage_type:0,origin_type:0,inherited:false,data_kind:n<2?'Дискретный':'Непрерывный',source:sources[n]}))},
  ui:{elements:[{tid:'MF;TF-1;WizrdMCF;TuneDataSourceMappingWizard;btnSyncThroughColumns',ref:'sync',allowed_actions:['click']}]}};
}
function fixture(options={}) {
 const initial=state(options),calls=[];let current=structuredClone(initial),selected=null;
 const snapshot=()=>{
  const s=structuredClone(current),base=s.wizard.root_tid+';TuneDataSourceMappingWizard;';
  s.wizard.output_columns={auto_sync:{status:'observed',value:s.node_mapping.autosync,ref:'auto'},
   fields:s.node_mapping.target_fields.map(f=>({...f,status:'observed',name_ref:'name-'+f.record_id,selected:selected===f.record_id,
    usage:'Не использовать',source:{status:'rendered_source',label:f.source?.label,type:f.source?.type}})),
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:5,returned:5,next_offset:null}};
  s.ui.elements.push({tid:base+'btnAutoSyncThroughColumns',ref:'auto',allowed_actions:['click']},
   {tid:base+'btnMoveMappingColumnUp',ref:'up',allowed_actions:['click']},
   ...s.node_mapping.target_fields.map(f=>({ref:'name-'+f.record_id,allowed_actions:['click']})));
  return s;
 };
 const channel={perform:async o=>{
  const fresh=snapshot();options.before?.(fresh);
  assert.equal(o.ready(fresh),true,'gesture precondition');const action=o.resolve(fresh);calls.push(action);
  if(options.lost)throw Error('unknown sync reply');
  const fields=current.node_mapping.target_fields;
  if(action.ref==='sync'){
   if(!options.nativeStale)fields.sort((a,b)=>a.source.index-b.source.index).forEach((f,index)=>f.index=index);
   if(options.recreate)fields.forEach(f=>f.record_id='sync-'+f.record_id);
   options.after?.(current);
  }else if(action.ref==='auto')current.node_mapping.autosync=!current.node_mapping.autosync;
  else if(action.ref.startsWith('name-'))selected=action.ref.slice(5);
  else if(action.ref==='up'){
   const i=fields.findIndex(f=>f.record_id===selected);assert.ok(i>0);assert.equal(current.node_mapping.autosync,false);
   [fields[i-1],fields[i]]=[fields[i],fields[i-1]];fields.forEach((f,index)=>f.index=index);
  }else assert.fail('unexpected gesture '+action.ref);
  options.onAction?.(current,action);
 },observe:async o=>{const s=snapshot();assert.equal(o.ready(s),true,'observation precondition');return s;}};
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
test('observed Loginom Sync recreates cached records without reordering; Export repairs only order and restores autosync',async()=>{
 const f=fixture({nativeStale:true,recreate:true}),after=await f.run();
 assert.equal(after.autosync,true);assert.deepEqual(after.target_fields.map(f=>f.name),after.source_fields.map(f=>f.name));
 assert.equal(f.calls.filter(a=>a.ref==='sync').length,1);assert.equal(f.calls.filter(a=>a.ref==='auto').length,2);
 assert.equal(f.calls.filter(a=>a.ref==='up').length,4);
 for(const field of after.target_fields){
  const old=f.initial.node_mapping.target_fields.find(f=>f.field_id===field.field_id);
  assert.deepEqual({...field,index:old.index,record_id:old.record_id},old);
 }
});
test('recreated cache record IDs do not require reordering when native Sync already restored source order',async()=>{
 const f=fixture({recreate:true}),after=await f.run();assert.deepEqual(after.target_fields.map(f=>f.name),after.source_fields.map(f=>f.name));
 assert.deepEqual(f.calls,[{verb:'click',ref:'sync'}]);
});
for(const change of [s=>s.node_mapping.source_fields[0].label='Changed',s=>s.node_mapping.target_fields[0].usage_type=1,
 s=>s.node_mapping.node_context.input_port.port_guid='foreign'])test('order repair refuses a changed mapping after disabling autosync '+change,async()=>{
 const f=fixture({nativeStale:true,recreate:true,onAction:(s,a)=>{if(a.ref==='auto')change(s);}});
 await assert.rejects(f.run());assert.deepEqual(f.calls.map(a=>a.ref),['sync','auto']);
});
for(const ref of ['auto','up'])test('unknown order-repair '+ref+' reply is not retried or followed by further gestures',async()=>{
 const f=fixture({nativeStale:true,recreate:true,onAction:(s,a)=>{if(a.ref===ref)throw Error('unknown repair reply');}});
 await assert.rejects(f.run(),/unknown repair reply/);assert.equal(f.calls.at(-1).ref,ref);assert.equal(f.calls.filter(a=>a.ref===ref).length,1);
});
for(const change of [s=>s.node_mapping.autosync=false,s=>s.node_mapping.target_fields[0].usage_type=1,
 s=>s.node_mapping.node_context.node_id='foreign'])test('final autosync restoration must preserve the owned mapping '+change,async()=>{
 let toggles=0;
 const f=fixture({nativeStale:true,recreate:true,onAction:(s,a)=>{if(a.ref==='auto'&&++toggles===2)change(s);}});
 await assert.rejects(f.run());assert.equal(f.calls.filter(a=>a.ref==='auto').length,2);assert.equal(f.calls.at(-1).ref,'auto');
});
