import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatorConfigurationReadback} from '../lib/calculator-readback.mjs';
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={verified:true,...node};
 const expression={index:0,name:'Result',label:'Same',type:'real',formula:'A * 2',replace:false,intermediate:false,cached:false,description:'kept'};
 const source={record_id:'s',field_id:'0',index:0,name:'Result',label:'Same',type:'real',required:true};
 const values={configure:{configuration:{verified:true,inventory_complete:true,mode:'expression',node_context:owner,expressions:[expression],input_fields:[]},syntax_validation:{status:'accepted_by_loginom_next',node_context:owner}},
 node_finish:{mode:'done',settings_applied:true,node_context:owner},output_mapping:{source_identity_verified:true,native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{...owner,output_port:{direction:'output',port:0}},source_fields:[source],target_fields:[{...source,record_id:'t',source,excluded:false,data_kind:'Непрерывный'}]}},finish:{mode:'execute',settings_applied:true,node_context:owner}};
 values.input_mapping={source_identity_verified:true,finish:{settings_applied:true,node_context:owner},native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{...owner,input_port:{direction:'input',port:0}},source_fields:[],target_fields:[]}};
 return {node,operation_id:'op',phases:Object.entries(values).map(([phase,v])=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...v}}))};
}
test('calculator readback projects observed expressions, preserved properties and mapping without claiming persistence',()=>{
 const r=calculatorConfigurationReadback(fixture());assert.equal(r.expressions[0].formula,'A * 2');assert.equal(r.expressions[0].description,'kept');assert.equal(r.output_mapping.fields[0].source_name,'Result');assert.equal(r.package_persistence_verified,false);
});
test('calculator readback refuses foreign, missing or unverified phase evidence',()=>{
 const mutations=[f=>f.phases.pop(),f=>f.phases.push(f.phases[0]),f=>f.phases[0].receipt_id='other:configure',
 f=>f.phases[0].value.configuration.node_context.node_id='other',f=>f.phases[0].value.syntax_validation.status='unverified',
 f=>f.phases[1].value.settings_applied=false,f=>f.phases[2].value.native_mapping.target_fields[0].source={record_id:'s'},
 f=>f.phases[2].value.native_mapping.node_context.output_port.direction='input',f=>f.phases[3].value.mode='close'];
 for(const [i,mutate] of mutations.entries()){const f=fixture();mutate(f);assert.throws(()=>calculatorConfigurationReadback(f),undefined,'mutation '+i);}
});

test('calculator readback requires saved input autosync and mappings from its own phase',()=>{
 const f=fixture(),v=f.phases.at(-1).value;
 const source={record_id:'input-source',name:'A',label:'A',type:'real'};
 v.native_mapping.source_fields=[source];v.native_mapping.target_fields=[{record_id:'input-target',index:0,source,name:'Renamed',label:'Input',type:'real',data_kind:'Непрерывный'}];
 f.phases[0].value.configuration.input_fields=[{name:'Renamed',label:'Input',type:'real'}];
 assert.equal(calculatorConfigurationReadback(f).input_mapping.fields[0].source_name,'A');
 assert.equal(calculatorConfigurationReadback(f).input_mapping.autosync,false);
 for(const mutate of [v=>delete v.native_mapping.autosync,v=>v.finish.settings_applied=false,
  v=>v.native_mapping.node_context.node_id='other',v=>v.source_identity_verified=false,
  v=>v.native_mapping.node_context.input_port.direction='output',
  v=>v.native_mapping.target_fields[0].source={...source,name:'foreign'},
  v=>v.native_mapping.target_fields[0].name='Different']){
  const g=structuredClone(f);mutate(g.phases.at(-1).value);assert.throws(()=>calculatorConfigurationReadback(g));
 }
});
