import test from 'node:test';import assert from 'node:assert/strict';
import {missingValuesConfigurationReadback as readback} from '../lib/missing-values-readback.mjs';
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={...node,verified:true};
 const source={record_id:'s',name:'Amount',label:'Amount',type:'real'},field={index:0,name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный'};
 const input={autosync:true,verified:true,inventory_complete:true,node_context:{...owner,input_port:{port:0}},source_fields:[source],target_fields:[{...field,source}]};
 const output={...input,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},target_fields:[{...field,excluded:false,source}]};
 const configuration={verified:true,inventory_complete:true,node_context:owner,input_fields:[field],fields:[{...field,used:true,method:'mean',method_code:3}],ordered:false,max_nulls_percent:100,options:{'RandSeedEdit;edtRandSeed':{value:'1234',switch_pressed:false},pedUseQuality:{value:false,switch_pressed:false},pedOrderedSample:{value:false,switch_pressed:false},pedMaxNullsPercent:{value:100,switch_pressed:false}}};
 const value={input_mapping:{native_mapping:input,finish:{settings_applied:true}},configure:{configuration,validation:{status:'accepted_by_loginom_next',node_context:owner}},node_finish:{settings_applied:true,mode:'done',node_context:owner},output_mapping:{native_mapping:output,finish:{settings_applied:true}},finish:{settings_applied:true,mode:'execute',node_context:owner}};
 return {node,operation_id:'op',phases:Object.entries(value).map(([phase,v])=>({phase,receipt_id:'op:'+phase,status:'verified',value:{verified:true,cleanup_complete:true,...v}}))};
}
test('missing values readback reports observed threshold and method without persistence or mean claims',()=>{const r=readback(fixture());assert.equal(r.max_nulls_percent,100);assert.equal(r.fields[0].method,'mean');assert.equal(r.package_persistence_verified,false);assert.equal(Object.hasOwn(r,'mean'),false);});
test('missing values refuses mismatched owners, receipts, methods and incomplete processing coverage',()=>{
 for(const mutate of [f=>f.phases[1].value.configuration.node_context={verified:true,node_id:'foreign'},f=>f.phases[1].receipt_id='old:configure',f=>f.phases[1].value.configuration.fields[0].method_code=6,f=>f.phases[1].value.configuration.fields[0].method='median',f=>f.phases[1].value.configuration.fields=[],f=>f.phases[1].value.configuration.max_nulls_percent=101,f=>f.phases[1].value.configuration.options.pedMaxNullsPercent.value=99,f=>f.phases[1].value.configuration.options.pedMaxNullsPercent.switch_pressed=true,f=>f.phases[2].value.settings_applied=false,f=>f.phases.push(f.phases[1])]){const f=fixture();mutate(f);assert.throws(()=>readback(f));}
});

test('published diagnostic job schema admits completed Missing Values readback and rejects malformed policies',async()=>{
 const {AjvJsonSchemaValidator}=await import('@modelcontextprotocol/sdk/validation/ajv');
 const {nodeApiTools}=await import('../lib/node-api.mjs');
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApiTools.find(t=>t.name==='dock_node_status').outputSchema);
 for(const finish of ['done','execute']){
  const f=fixture();f.phases.at(-1).value.mode=finish;
  const output={operation_id:'op',status:'SUCCEEDED',effect_possible:true,phases:[],node:f.node,
   execution:{status:finish==='done'?'not_requested':'completed',execution_id:finish==='done'?null:'execution'},
   output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,cleanup_complete:true,warnings:[],
   configuration:{status:'applied',readback:readback(f)}};
  const job={operation_id:'op',attempt:1,state:'settled',cancel_requested:false,server_stop_requested:false,progress:null,error:null,
   outcome:{status:'SUCCEEDED',action_key:'node.apply',action_revision:'1.0.0',operation_id:'op',phase:'node_ready',effect_possible:true,cleanup_complete:true,output,error:null,trace:[]}};
  assert.equal(validate(job).valid,true,validate(job).errorMessage);
  for(const change of [r=>r.node={},r=>r.fields[0].method='median',r=>r.max_nulls_percent=101,r=>r.options.pedMaxNullsPercent.value=1.5,
   r=>r.options.pedUseQuality.switch_pressed=true,r=>r.fields[0].value='unexpected',r=>r.fields[0].used=false,r=>r.extra=true]){
   const bad=structuredClone(job);change(bad.outcome.output.configuration.readback);assert.equal(validate(bad).valid,false);
  }
 }
});
