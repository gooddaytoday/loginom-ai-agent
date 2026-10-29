import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSortingOutput} from '../lib/sorting-output.mjs';

function fixture() {
 const fields=[['Id','integer'],['Key','real'],['Text','string']].map(([name,type],index)=>({index,name,label:name,type,data_kind:'Дискретный'}));
 let autosync=true,changed=false;const gestures=[];
 const source_fields=fields.map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),required:false}));
 const state=()=>({wizard:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W',output_columns:{
  auto_sync:{status:'observed',value:autosync,ref:'auto'},
  page:{status:'complete_definition_page',schema_id:autosync?'sync':'fixed',offset:0,limit:8,total_columns:3,returned:3,next_offset:null},
  fields:fields.map(f=>({...f,name:changed&&f.name==='Key'?'Changed':f.name,status:'observed',source:{status:'rendered_source',label:f.label,type:f.type}}))}},
  node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync,
   source_fields,target_fields:source_fields.map((source,index)=>({...fields[index],record_id:'t'+index,field_id:String(index),source,excluded:false}))},
  ui:{elements:[{ref:'auto',tid:'W;DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns',allowed_actions:['click']}]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},
  async perform(o){const s=state();assert.ok(o.ready(s));const gesture=o.resolve(s);assert.deepEqual(gesture,{verb:'click',ref:'auto'});gestures.push(gesture);autosync=!autosync;channel.afterMutation?.();}};
 return {channel,configuration:{input_fields:fields},gestures,changeSchema:()=>{changed=true;}};
}

test('new Sorting fixes the complete output layout before Save, including non-key Key',async()=>{
 const f=fixture();const r=await configureSortingOutput(f.channel,f.configuration,{}, {},{target:{kind:'new'}});
 assert.equal(r.native_mapping.autosync,false);
 assert.deepEqual(r.native_mapping.target_fields.map(v=>[v.name,v.label,v.type]),[['Id','Id','integer'],['Key','Key','real'],['Text','Text','string']]);
 assert.equal(r.changes[0].rendered_definition_preserved,true);assert.equal(f.gestures.length,1);
});
test('existing Sorting retains autosync; an explicit new-node autosync still wins',async()=>{
 for(const [kind,mapping] of [['existing',{}],['new',{autosync:true}]]){
  const f=fixture();const r=await configureSortingOutput(f.channel,f.configuration,{},mapping,{target:{kind}});
  assert.equal(r.native_mapping.autosync,true);assert.equal(f.gestures.length,0);
 }
});
test('Sorting does not accept a changed schema while fixing the layout or repeat the gesture',async()=>{
 const f=fixture();f.channel.afterMutation=f.changeSchema;
 await assert.rejects(configureSortingOutput(f.channel,f.configuration,{}, {},{target:{kind:'new'}}),/definition changed/i);
 assert.equal(f.gestures.length,1);
});

// Saved Sorting after 6 -> 2 -> 6 input fields: Debt and the excluded key
// survive, but the separate output wizard has not added the other four.
function expandedFixture(){
 const names=['OrderID','Customer','OrderAmount','PaidAmount','Debt','OrderPosition'];
 const configuration={input_fields:names.map((name,i)=>({name,label:name,type:i<2?'string':i===5?'integer':'real'}))};
 const source_fields=[4,5,0,1,2,3].map((i,index)=>({...configuration.input_fields[i],index,record_id:'s'+i,field_id:String(index),required:false}));
 const target=(i,excluded=false)=>{const source=source_fields.find(s=>s.name===names[i]);return {
  record_id:'t'+i,field_id:String(i),name:source.name,label:source.label,type:source.type,
  data_kind:excluded?'Неопределенное':'Непрерывный',required:false,inherited:false,excluded,
  source:excluded?null:source,exclusion_source:excluded?source:null};};
 const reindex=fields=>{const groups=new Map();return fields.map((f,index)=>{
  const group_index=groups.get(f.excluded)??0;groups.set(f.excluded,group_index+1);return {...f,index,group_index};});};
 let native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
  node_context:{verified:true,node_id:'sorting'},autosync:false,source_fields,target_fields:reindex([target(4),target(5,true)])};
 let selected;const gestures=[];
 const state=()=>({node_mapping:structuredClone(native),prepared_node_context:native.node_context,
  wizard:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W',output_columns:{
   auto_sync:{status:'observed',value:native.autosync,ref:'auto'},
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:native.target_fields.length,
    returned:native.target_fields.length,next_offset:null},
   fields:native.target_fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:f.record_id===selected}))}},
  ui:{elements:[...native.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click']})),
   ...[['sync','btnSyncThroughColumns'],['up','btnMoveMappingColumnUp']].map(([ref,key])=>({ref,tid:'W;DerivedDataSourceOutputSocketWizard;'+key,allowed_actions:['click']}))]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=state();assert.ok(o.ready(s),o.condition);const g=o.resolve(s);gestures.push(g);
  if(g.ref==='sync'){
   native.target_fields=reindex([native.target_fields[0],...[0,1,2,3].map(i=>target(i)),native.target_fields[1]]);
   channel.afterSync?.(native);
  }else if(g.ref==='up'){
   const index=native.target_fields.findIndex(f=>f.record_id===selected);
   [native.target_fields[index-1],native.target_fields[index]]=[native.target_fields[index],native.target_fields[index-1]];
   native.target_fields=reindex(native.target_fields);
  }else selected=g.ref;
 }};
 return {configuration,channel,gestures,native,mapping:{autosync:false,fields:names.map(name=>({source:{kind:'configured_field',name},excluded:name==='OrderPosition'}))}};
}
test('full Sorting output mapping adds restored sources, preserves the excluded key and applies requested order',async()=>{
 const f=expandedFixture(),before=structuredClone(f.native);
 const result=await configureSortingOutput(f.channel,f.configuration,{},f.mapping,{target:{kind:'existing'}});
 assert.deepEqual(result.native_mapping.target_fields.map(t=>[t.name,t.excluded]),f.mapping.fields.map(t=>[t.source.name,t.excluded]));
 assert.equal(result.native_mapping.autosync,false);
 assert.equal(result.native_mapping.target_fields.at(-1).field_id,before.target_fields[1].field_id);
 assert.deepEqual(result.native_mapping.source_fields,before.source_fields);
 assert.equal(f.gestures.filter(g=>g.ref==='sync').length,1);
});
test('Sorting refuses nonexistent, duplicate and incomplete requested sources before synchronization',async()=>{
 for(const mutate of [m=>m.fields[0].source.name='Foreign',m=>m.fields[0].source.name='Customer',m=>m.fields.pop()]){
  const f=expandedFixture();mutate(f.mapping);
  await assert.rejects(configureSortingOutput(f.channel,f.configuration,{},f.mapping,{target:{kind:'existing'}}));
  assert.equal(f.gestures.length,0);
 }
});
test('Sorting keeps an existing partial output unless a full layout requests restored fields',async()=>{
 const f=expandedFixture();
 const result=await configureSortingOutput(f.channel,f.configuration,{}, {},{target:{kind:'existing'}});
 assert.deepEqual(result.native_mapping,f.native);assert.equal(f.gestures.length,0);
});
test('Sorting refuses unbound, duplicate or foreign retained links before synchronization',async()=>{
 for(const mutate of [n=>n.target_fields[0].source=null,n=>n.target_fields[0].source=n.source_fields[1],
  n=>n.target_fields[0].source={...n.source_fields[0],field_id:'Foreign'},n=>n.target_fields[0].inherited=true]){
  const f=expandedFixture();mutate(f.native);
  await assert.rejects(configureSortingOutput(f.channel,f.configuration,{},f.mapping,{target:{kind:'existing'}}));
  assert.equal(f.gestures.length,0);
 }
});
test('Sorting synchronization refuses source, retained output, ownership and autosync drift without a retry',async()=>{
 for(const mutate of [n=>n.source_fields[0].label='Foreign',n=>n.target_fields[0].name='Changed',
  n=>n.target_fields[0].field_id='Changed',n=>n.target_fields.at(-1).excluded=false,
  n=>n.node_context.node_id='Foreign',n=>n.autosync=true,n=>n.target_fields.pop()]){
  const f=expandedFixture();f.channel.afterSync=mutate;
  await assert.rejects(configureSortingOutput(f.channel,f.configuration,{},f.mapping,{target:{kind:'existing'}}));
  assert.deepEqual(f.gestures,[{verb:'click',ref:'sync'}]);
 }
});
