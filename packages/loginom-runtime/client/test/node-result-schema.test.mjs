import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema,deliveryJobResultSchema} from '../lib/node-result-schema.mjs';
const provider=new AjvJsonSchemaValidator(),validate=provider.getValidator(nodeApplyResultSchema);
const result=()=>({operation_id:'op',status:'AMBIGUOUS',effect_possible:true,phases:[],node:null,
 execution:{status:'pending',execution_id:'process'},output:{status:'not_refreshed',evidence_ref:null,ports:[]},
 package_saved:false,cleanup_complete:false,warnings:[],pending_phase:'execute',error:{code:'UNKNOWN',message:'Await original receipt'}});
test('result schema preserves uncertainty and forbids claiming node-level package persistence',()=>{
 assert.equal(validate(result()).valid,true);
 for(const patch of [{package_saved:true},{persisted_package_verified:true},{pending_phase:'retry'},
  {execution:{status:'cancelled'}},{cleanup_complete:'yes'}])assert.equal(validate({...result(),...patch}).valid,false);
});
test('explicit workflow activation survives public result validation',()=>{
 const r=result();r.pending_phase='workflow';r.phases=[{phase:'workflow',receipt_id:'op:workflow',status:'verified',effect_possible:true}];
 assert.equal(validate(r).valid,true);
});
test('table output requires typed values, precision and bounded samples',()=>{
 const r=result();r.output={status:'complete',evidence_ref:'read',ports:[{port:0,port_guid:'p',fresh:true,execution_id:'e',
  schema:[{index:0,name:'Id',label:'Id',type:'integer'}],row_count:1,
  sample:[[{type:'integer',is_null:false,value:'9007199254740993',precision:'exact_integer',representation:'decimal_integer'}]],
  sample_rows:1,sample_complete:true,precision:{numbers_verified:true,limitations:[],strings:'UI text'}}]};
 assert.equal(validate(r).valid,true);
 const bad=structuredClone(r);delete bad.output.ports[0].sample[0][0].precision;assert.equal(validate(bad).valid,false);
 const hundred=structuredClone(r);hundred.output.ports[0].sample=Array(100).fill(r.output.ports[0].sample[0]);hundred.output.ports[0].sample_rows=100;hundred.output.ports[0].row_count=100;assert.equal(validate(hundred).valid,true);
 const long=structuredClone(r);long.output.ports[0].sample=Array(101).fill(r.output.ports[0].sample[0]);assert.equal(validate(long).valid,false);
});
test('delivery result distinguishes unresolved transfer from a worker or successful node',()=>{
 const check=provider.getValidator(deliveryJobResultSchema),r={operation_id:'delivery',state:'settled',phase:'verify',upload_operation_id:'delivery:upload',
  outcome:{status:'AMBIGUOUS',effect_possible:true},error:{code:'ARTIFACT_DELIVERY_INCOMPLETE',message:'Inspect original upload'}};
 assert.equal(check(r).valid,true);assert.equal(check({...r,state:'completed'}).valid,false);assert.equal(check(result()).valid,false);
});
test('calculator readback has its own public shape and cannot masquerade as text import or persistence',()=>{
 const r=result();r.configuration={status:'applied',readback:{kind:'calculator',input_mapping:{port:0,autosync:false,fields:[]},scope:'observed_before_verified_finish',node:{document_id:'d',workflow_id:'w',node_id:'n'},
 receipt_ids:['op:input_mapping','op:configure','op:node_finish','op:output_mapping','op:finish'],values_are:'observed_ui_values',mode:'expression',
 expressions:[{index:0,name:'R',label:'R',type:'real',formula:'A * 2',replace:false,intermediate:false,cached:false,description:''}],
 input_fields:[{name:'A',label:'A',type:'real'}],syntax_validation:'accepted_by_loginom_next',output_mapping:{port:0,autosync:true,fields:[{index:0,name:'R',label:'R',type:'real',data_kind:'Непрерывный',source_name:'R',excluded:false}]},package_persistence_verified:false}};
 assert.equal(validate(r).valid,true);
 for(const change of [v=>v.kind='text_import',v=>v.mode='javascript',v=>v.package_persistence_verified=true,v=>v.receipt_ids.pop(),v=>delete v.expressions[0].formula]){
  const invalid=structuredClone(r);change(invalid.configuration.readback);assert.equal(validate(invalid).valid,false);
 }
});

test('reform readback has a registered shape with input identities and preservation evidence',()=>{
 const r=result(),field={index:0,field_id:'0',name:'Amount',label:'Same',type:'real',data_kind:'Непрерывный',usage_type:7,caching_method:0,excluded:false,
  input_field:{index:0,field_id:'0',name:'Raw',label:'Same',type:'string',source_name:'Raw',source_field_id:'0'}};
 r.configuration={status:'applied',readback:{kind:'field_parameters',scope:'observed_before_verified_finish',node:{document_id:'d',workflow_id:'w',node_id:'n'},
 receipt_ids:['op:input_mapping','op:configure','op:node_finish','op:output_mapping','op:finish'],values_are:'observed_ui_values',fields:[field],
 caching:{value:0,display:'Отключено',variable:false},preservation:{unrequested_fields:true,unrequested_properties:true,caching:true},
 input_mapping:{port:0,autosync:true,fields:[{index:0,field_id:'0',name:'Raw',label:'Same',type:'string',data_kind:'Дискретный',source_name:'Raw'}]},
 output_mapping:{port:0,autosync:true,fields:[{index:0,name:'Amount',label:'Same',type:'real',data_kind:'Непрерывный',excluded:false,source_name:'Amount'}]},package_persistence_verified:false}};
 assert.equal(validate(r).valid,true);
 for(const change of [v=>v.kind='calculator',v=>delete v.fields[0].input_field,v=>v.fields[0].usage_type=1,v=>v.caching.value=4,
  v=>v.receipt_ids.pop(),v=>v.package_persistence_verified=true,v=>delete v.preservation]){
  const bad=structuredClone(r);change(bad.configuration.readback);assert.equal(validate(bad).valid,false);
 }
});
test('replacement public readback admits typed Null and exact Int64 without claiming package persistence',()=>{
 const r=result(),field={index:0,name:'Code',label:'Code',type:'integer',data_kind:'Дискретный',source_name:'Code'};
 r.configuration={status:'applied',readback:{kind:'replacement',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:{document_id:'d',workflow_id:'w',node_id:'n'},receipt_ids:['i','c','s','m','f'],mode:'exact',output_mode:'add',rules:[{field:{kind:'input_field',name:'Code'},type:'integer',precision:0,pairs:[{from:{type:'integer',value:null},to:{type:'integer',value:'9223372036854775807'}}],other:{mode:'keep'}}],input_mapping:{port:0,autosync:true,fields:[field]},output_mapping:{port:0,autosync:true,fields:[{...field,excluded:false}]},package_persistence_verified:false}};
 assert.equal(validate(r).valid,true);
 for(const patch of [{output_mode:'external'},{package_persistence_verified:true},{mode:'regex'}]){const bad=structuredClone(r);Object.assign(bad.configuration.readback,patch);assert.equal(validate(bad).valid,false);}
});

test('date/time readback crosses the public schema with complete matrices and source mappings',()=>{
 const r=result(),mapping={port:0,autosync:true,fields:[{index:0,name:'A',label:'Дата',type:'datetime',data_kind:'Дискретный',source_name:'A'}]};
 const rows=[...Array.from({length:19},(_,func)=>({func,iso:false})),...[0,1,2,4,5,6,7,8,10,18].map(func=>({func,iso:true}))];
 r.configuration={status:'applied',readback:{kind:'date_time',scope:'observed_before_verified_finish',node:{document_id:'d',workflow_id:'w',node_id:'n'},
 receipt_ids:['op:input_mapping','op:configure','op:node_finish','op:output_mapping','op:finish'],values_are:'observed_ui_values',mode:'calendar',
 fields:[{name:'A',matrix:rows.map((row,index)=>({...row,index,record_id:String(index),first:false,last:false,number:row.func===4&&!row.iso,string:false,string_format:''}))}],
 input_mapping:mapping,output_mapping:{...mapping,fields:mapping.fields.map(f=>({...f,excluded:false}))},package_persistence_verified:false}};
 assert.equal(validate(r).valid,true);
 for(const change of [v=>v.kind='calculator',v=>v.mode='iso',v=>v.fields[0].matrix.pop(),v=>delete v.fields[0].matrix[0].record_id,
  v=>v.fields[0].matrix[0].func=19,v=>v.receipt_ids.pop(),v=>v.package_persistence_verified=true,v=>delete v.output_mapping.fields[0].source_name]){
  const bad=structuredClone(r);change(bad.configuration.readback);assert.equal(validate(bad).valid,false);
 }
});
