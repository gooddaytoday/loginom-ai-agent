import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
test('sequential sampling and partition are installed with explicit row counts and three output ports',()=>{
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 for(const type of ['preprocessing.sampling','preprocessing.data_partition']){
  assert.ok(handlers.has(type),type);
  assert.deepEqual(NODE_TYPES[type].modes,['sequential']);
 }
 assert.equal(NODE_TYPES['preprocessing.data_partition'].tabular_outputs,3);
 const schema=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
 assert.ok(schema.properties.read.properties.ports.items.maximum>=2);
 assert.ok(schema.properties.read.properties.ports.maxItems>=3);
});
import {validateSamplingParameters} from '../lib/sampling-parameters.mjs';
import {validateDataPartitionParameters} from '../lib/data-partition-parameters.mjs';
import {samplingOutputColumns,alignSamplingOutput,readSamplingOutputs} from '../lib/sampling-output.mjs';
import {samplingConfigurationReadback} from '../lib/sampling-readback.mjs';
import {sequentialGroup,sequentialSizes} from '../lib/sampling-procedure.mjs';
const request=(type,kind='new')=>({target:{kind,type},inputs:[{input:0}],mappings:[],read:{ports:type==='preprocessing.sampling'?[0]:[0,1,2]}});
test('validation rejects unsupported/random methods, percentages, invalid counts and foreign ports before UI',()=>{
 const r=request('preprocessing.sampling');
 validateSamplingParameters({count:5,position:'last'},'sequential',r);
 for(const p of [{count:-1,position:'first'},{count:1.5,position:'first'},{count:5,position:'middle'},{count:5,position:'first',seed:42},{}])assert.throws(()=>validateSamplingParameters(p,'sequential',r));
 assert.throws(()=>validateSamplingParameters({count:5,position:'first'},'random',r));
 assert.throws(()=>validateSamplingParameters({count:5,position:'first'},'sequential',{...r,read:{ports:[1]}}));
 validateSamplingParameters({},'sequential',request('preprocessing.sampling','existing'));
 const p=request('preprocessing.data_partition');
 validateDataPartitionParameters({train_count:10,test_count:5,allocation_order:'test_train_unused'},'sequential',p);
 assert.throws(()=>validateDataPartitionParameters({train_count:10,test_count:5,allocation_order:'random'},'sequential',p));
 assert.throws(()=>validateDataPartitionParameters({train_count:10,test_count:NaN,allocation_order:'test_train_unused'},'sequential',p));
});
const fields=[{name:'RowID',label:'RowID',type:'integer',data_kind:'Дискретный'},{name:'Value',label:'Value',type:'real',data_kind:'Непрерывный'}];
test('partition schemas prepend a Boolean service field only to combined port; exact order and type required even for zero rows',()=>{
 const c={kind:'data_partition',input_fields:fields};
 const combined=samplingOutputColumns(c,0);
 assert.deepEqual(combined.map(f=>[f.name,f.type]),[['IsTestSet','boolean'],['RowID','integer'],['Value','real']]);
 assert.deepEqual(samplingOutputColumns(c,1),fields);
 assert.deepEqual(samplingOutputColumns(c,2),fields);
 assert.throws(()=>samplingOutputColumns(c,3));
 assert.throws(()=>alignSamplingOutput([...combined].reverse(),combined));
 assert.throws(()=>alignSamplingOutput(combined.map(f=>({...f,type:'string'})),combined));
 assert.throws(()=>alignSamplingOutput([],combined));
});
test('fresh reads preserve NULL, false, zero and empty strings on every distinct output',async()=>{
 const row={RowID:0,Value:null,Flag:false,Class:''},schema=fields;
 const result=await readSamplingOutputs({readOutputPort:async({port})=>({output:{port,port_guid:'p'+port,schema:structuredClone(schema),sample_complete:true,sample:[structuredClone(row)]}})},
  {ports:[0,1,2],sample_rows:100,require_exact_numbers:true},{execution:{execution_id:'e'},receipt_id:'r',portExecution:{verified:true}},
  {ports:[0,1,2].map(port=>({port,schema}))});
 assert.equal(result.status,'complete');assert.equal(result.cleanup_complete,true);
 assert.deepEqual(result.ports.map(p=>p.sample[0]),[row,row,row]);
});
test('group binding follows observed group labels rather than current row positions',()=>{
 assert.equal(sequentialGroup({text:'Тестовое множество',values:{}},true),'test');
 assert.equal(sequentialGroup({text:'Обучающее множество',values:{}},true),'train');
 assert.equal(sequentialGroup({text:'Неиспользуемые',values:{}},false),'unused');
 assert.throws(()=>sequentialGroup({text:'unknown',values:{Index:0}},false));
 assert.deepEqual(sequentialSizes({kind:'data_partition',sizes:[{values:{AbsoluteSize:10}},{values:{AbsoluteSize:5}},{values:{Summary:15}}]}),[10,5]);
 assert.throws(()=>sequentialSizes({kind:'sampling',sizes:[{values:{AbsoluteSize:NaN}}]}));
});
test('readback refuses missing/foreign receipts and cannot claim package persistence',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={verified:true,...node};
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...value}});
 const phases=[phase('input_mapping',{native_mapping:{node_context:owner}}),phase('configure',{configuration:{verified:true,inventory_complete:true,node_context:owner,kind:'sampling',counts:[5],groups:['sample','unused']},validation:{status:'accepted_by_loginom_next',node_context:owner}}),
  phase('node_finish',{settings_applied:true,node_context:owner}),phase('output_mapping',{ports:[{port:0,schema:fields,native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},target_fields:fields},finish:{verified:true,cleanup_complete:true,settings_applied:true,node_context:owner}}]}),phase('finish',{settings_applied:true,node_context:owner})];
 const readback=samplingConfigurationReadback({node,phases,operation_id:'op'});
 assert.equal(readback.package_persistence_verified,false);
 assert.equal(readback.output_mappings[0].fields[0].source_name,'RowID');
 const foreign=structuredClone(phases);foreign[1].value.configuration.node_context.node_id='other';
 assert.throws(()=>samplingConfigurationReadback({node,phases:foreign,operation_id:'op'}));
 assert.throws(()=>samplingConfigurationReadback({node,phases:phases.slice(1),operation_id:'op'}));
});
