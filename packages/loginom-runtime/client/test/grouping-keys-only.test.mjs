import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupingParameters,resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';
import {groupingConfigurationReadback} from '../lib/grouping-readback.mjs';
import {groupingParametersSchema,nodeApplyInputSchema} from '../lib/node-api.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';

const parameters={group_by:[{kind:'input_field',name:'Key'},{kind:'input_field',name:'Text'}],measures:[]};
const fields=[{name:'Key',label:'Key',type:'integer'},{name:'Text',label:'Text',type:'string'}];
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const configuration={verified:true,inventory_complete:true,input_fields:fields,keys:fields.map((f,order)=>({...f,order})),measures:[],options:{pedDimCache:{value:true,switch_pressed:false},pedSortResult:{value:true,switch_pressed:false}}};

test('keys-only request passes both advertised schemas and production validation',()=>{
 for(const schema of [groupingParametersSchema,nodeApplyInputSchema.properties.parameters])assert.doesNotThrow(()=>validateActionParameters(schema,parameters));
 assert.doesNotThrow(()=>validateGroupingParameters(parameters,'aggregate',request));
 assert.deepEqual(resolveGroupingParameters(parameters,fields),{keys:fields,measures:[],field_order:[],functions:[]});
 for(const bad of [undefined,null,{},''])assert.throws(()=>validateGroupingParameters({...parameters,measures:bad},'aggregate',request));
 assert.throws(()=>validateGroupingParameters({...parameters,group_by:[]},'aggregate',request));
});

test('saved keys-only grouping is preserved without any gesture',async()=>{
 const channel={observe:async options=>{const state={wizard:{stage:'grouping'},node_grouping:configuration};assert.ok(options.ready(state));return state;},perform:()=>assert.fail('preservation must not mutate')};
 const result=await configureGrouping(channel,{});
 assert.equal(result.preservation.unchanged,true);
 assert.deepEqual(result.configuration.measures,[]);
});

test('keys-only output retains exact key source identity and requested order',()=>{
 const sources=fields.map((f,index)=>({...f,record_id:'s'+index}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:sources,
  target_fields:sources.map((source,index)=>({...source,index,record_id:'t'+index,source,inherited:false,excluded:false}))};
 assert.deepEqual(groupingOutputDefinitions(configuration).map(f=>f.name),['Key','Text']);
 assert.deepEqual(resolveGroupingOutput(configuration,parameters,native).fields.map(f=>f.source.record_id),['s0','s1']);
 assert.deepEqual(resolveGroupingOutput(configuration,{},native),{fields:null});
 native.target_fields[1].source=sources[0];
 assert.throws(()=>resolveGroupingOutput(configuration,parameters,native),/identity differs/);
});

function readbackFixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={...node,verified:true};
 const sources=fields.map((f,index)=>({...f,index,record_id:'s'+index}));
 const mapping={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:sources,
  target_fields:sources.map((source,index)=>({...source,index,record_id:'t'+index,source,inherited:false,excluded:false,data_kind:index?'Дискретный':'Непрерывный'}))};
 const values={input_mapping:{native_mapping:{...mapping,node_context:{...owner,input_port:{port:0}}},finish:{settings_applied:true}},
  configure:{configuration:{...configuration,node_context:owner},validation:{status:'accepted_by_loginom_next',node_context:owner}},
  node_finish:{settings_applied:true,mode:'done',node_context:owner},
  output_mapping:{native_mapping:{...mapping,mapping_wizard:'DerivedDataSourceOutputSocketWizard',node_context:{...owner,output_port:{port:0}}},finish:{settings_applied:true}},
  finish:{settings_applied:true,mode:'execute',node_context:owner}};
 return {node,operation_id:'op',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
}

test('keys-only readback passes public result schema with complete key output evidence',()=>{
 const fixture=readbackFixture(),result=groupingConfigurationReadback(fixture);
 assert.deepEqual(result.measures,[]);
 assert.deepEqual(result.output_mapping.fields.map(f=>f.source_name),['Key','Text']);
 assert.doesNotThrow(()=>validateActionParameters(nodeApplyResultSchema.properties.configuration.properties.readback,result));
 for(const mutate of [f=>f.phases[1].value.configuration.keys=[],f=>f.phases[1].value.configuration.measures=null,
  f=>f.phases[1].value.configuration.node_context.node_id='foreign',f=>f.phases[3].value.native_mapping.source_fields=[]]){
  const bad=structuredClone(fixture);mutate(bad);assert.throws(()=>groupingConfigurationReadback(bad));
 }
});
