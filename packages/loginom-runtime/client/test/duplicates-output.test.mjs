import test from 'node:test';
import assert from 'node:assert/strict';
import {configureDuplicatesOutput} from '../lib/duplicates-node.mjs';
import {DUPLICATES_OUTPUT} from '../lib/duplicates-parameters.mjs';

test('new Duplicates fixes the complete output order before Save; existing nodes retain autosync',async()=>{
 for(const kind of ['new','existing']){
  const fields=[{name:'RowID',type:'integer'},{name:'R',type:'real'},{name:'Value',type:'string'}]
   .map((f,index)=>({...f,index,label:f.name,data_kind:'Дискретный'}));
  const all=[...DUPLICATES_OUTPUT,...fields].map((f,index)=>({...f,index,data_kind:'Дискретный'}));
  const source_fields=all.map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),required:false}));
  let autosync=true;const gestures=[];
  const state=()=>({wizard:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W',output_columns:{
   auto_sync:{status:'observed',value:autosync,ref:'auto'},
   page:{status:'complete_definition_page',schema_id:autosync?'sync':'fixed',offset:0,limit:8,total_columns:all.length,returned:all.length,next_offset:null},
   fields:all.map(f=>({...f,status:'observed',source:{status:'rendered_source',label:f.label,type:f.type}}))}},
   node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync,
    source_fields,target_fields:source_fields.map((source,index)=>({...all[index],record_id:'t'+index,field_id:String(index),source,excluded:false}))},
   ui:{elements:[{ref:'auto',tid:'W;DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns',allowed_actions:['click']}]}});
  const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},
   async perform(o){const s=state();assert.ok(o.ready(s));const gesture=o.resolve(s);assert.deepEqual(gesture,{verb:'click',ref:'auto'});gestures.push(gesture);autosync=!autosync;}};
  const result=await configureDuplicatesOutput(channel,{fields},{},{},{target:{kind}});
  assert.equal(result.native_mapping.autosync,kind==='existing');
  assert.deepEqual(result.native_mapping.target_fields.map(f=>f.name),all.map(f=>f.name));
  assert.equal(gestures.length,kind==='new'?1:0);
 }
});
