import test from 'node:test';
import assert from 'node:assert/strict';
import {configureDuplicatesOutput} from '../lib/duplicates-node.mjs';
import {DUPLICATES_OUTPUT} from '../lib/duplicates-parameters.mjs';

for(const {kind,layout,explicitAutosync,expectedAutosync,name} of [
 {kind:'new',expectedAutosync:true,name:'new Duplicates retains native autosync without a layout request'},
 {kind:'existing',expectedAutosync:true,name:'existing Duplicates retains native autosync without a layout request'},
 {kind:'new',layout:true,expectedAutosync:false,name:'new Duplicates freezes an explicitly requested layout'},
 {kind:'new',layout:true,explicitAutosync:true,expectedAutosync:true,name:'explicit autosync takes precedence over a Duplicates layout request'},
]){
 test(name,async()=>{
  const fields=[{name:'RowID',type:'integer'},{name:'R',type:'real'},{name:'Value',type:'string'}]
   .map((f,index)=>({...f,index,label:f.name,data_kind:'Дискретный'}));
  const all=[...DUPLICATES_OUTPUT,...fields].map((f,index)=>({...f,index,data_kind:'Дискретный'}));
  const source_fields=all.map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),required:false}));
  const targets=source_fields.toReversed().map((source,index)=>({...source,index,record_id:'t'+index,field_id:String(index),source,excluded:false}));
  let autosync=true;const gestures=[];
  const state=()=>({wizard:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W',output_columns:{
   auto_sync:{status:'observed',value:autosync,ref:'auto'},
   page:{status:'complete_definition_page',schema_id:autosync?'sync':'fixed',offset:0,limit:8,total_columns:all.length,returned:all.length,next_offset:null},
   fields:targets.map(f=>({...f,status:'observed',source:{status:'rendered_source',label:f.source.label,type:f.source.type}}))}},
   node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync,
    source_fields,target_fields:targets},
   ui:{elements:[{ref:'auto',tid:'W;DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns',allowed_actions:['click']}]}});
  const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},
   async perform(o){const s=state();assert.ok(o.ready(s));const gesture=o.resolve(s);assert.deepEqual(gesture,{verb:'click',ref:'auto'});gestures.push(gesture);autosync=!autosync;}};
  const mapping={};
  if(layout)mapping.fields=targets.map(f=>({source:{kind:'configured_field',name:f.source.name}}));
  if(explicitAutosync!==undefined)mapping.autosync=explicitAutosync;
  const result=await configureDuplicatesOutput(channel,{fields},{},mapping,{target:{kind}});
  assert.equal(result.native_mapping.autosync,expectedAutosync);
  assert.deepEqual(result.native_mapping.target_fields,targets);
  assert.deepEqual(gestures,expectedAutosync?[]:[{verb:'click',ref:'auto'}]);
 });
}
