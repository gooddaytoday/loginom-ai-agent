import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSamplingOutputs} from '../lib/sampling-node.mjs';
import {samplingOutputColumns} from '../lib/sampling-output.mjs';

// LAB-764 cold.execution-events.jsonl:85–86: autosync reopened the saved
// Class stratum before pass-through RowID/Value, despite the main definition.
for(const kind of ['sampling','data_partition'])for(const mode of ['stratified','biased','random','sequential'])for(const new_node of [true,false])
test(`${kind} ${mode} new=${new_node}: save explicit order only for new modes`,async()=>{
 const c={kind,mode,new_node,input_fields:[{name:'RowID',type:'integer'},{name:'Class',type:'string'},{name:'Value',type:'integer'}].map(f=>({...f,label:f.name,data_kind:f.type==='string'?'Дискретный':'Непрерывный'}))};
 let port=0;
 const values=Array(kind==='data_partition'?3:1).fill(true),saved=[];
 const snapshot=()=>{
  const fields=samplingOutputColumns(c,port),root='port'+port;
  return {wizard:{status:'observed',stage:'output_mapping',root_ref:root,root_tid:root,
   output_columns:{auto_sync:{status:'observed',value:values[port],ref:'auto'+port},
    page:{status:'complete_definition_page',schema_id:root+values[port],offset:0,limit:8,total_columns:fields.length,returned:fields.length,next_offset:null},
    fields:fields.map((f,index)=>({...f,index,status:'observed',source:{cell_ref:'cell'+index,status:'rendered_source',label:f.label,type:f.type}}))}},
   node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:values[port],node_context:{output_port:{port}},target_fields:fields},
   ui:{elements:[{ref:'auto'+port,tid:root+';DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns',allowed_actions:['click']}]}};
 };
 const channel={openOutputPort:async p=>{port=p;},observe:async o=>{const s=snapshot();assert.ok(o.ready(s));return s;},
  perform:async o=>{const s=snapshot();assert.ok(o.ready(s));assert.deepEqual(o.resolve(s),{verb:'click',ref:'auto'+port});values[port]=!values[port];}};
 const result=await configureSamplingOutputs(channel,c,{},[],async(finish,applied,definition)=>{
  assert.equal(finish,'done');assert.equal(applied,true);
  assert.deepEqual(definition.fields.map(f=>f.name),samplingOutputColumns(c,port).map(f=>f.name));
  saved.push(values[port]);return {verified:true,cleanup_complete:true,settings_applied:true};
 });
 const expected=!(new_node&&['stratified','biased'].includes(mode));
 assert.deepEqual(saved,values.map(()=>expected));
 assert.equal(result.ports.length,values.length);
});
