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
