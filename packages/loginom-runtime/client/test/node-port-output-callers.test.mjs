import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createTabularTransformNodeSupport} from '../lib/calculator-node.mjs';
import {alignReadSchema} from '../lib/node-read-contract.mjs';
import {openNewOutputTable} from '../lib/node-output-procedure.mjs';
import {readClusteringOutputs,clusteringOutputColumns} from '../lib/clustering-output.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readLinRegressionOutputs,linRegressionOutputColumns} from '../lib/linregression-output.mjs';
import {readFilterOutputs} from '../lib/filter-output.mjs';

const read={sample_rows:2,require_exact_numbers:true};
const ctx={execution:{status:'completed',execution_id:'exec'},portExecution:{verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'exec',group_id:'1',process_id:'1.1',process_record_id:'child'},receipt_id:'receipt'};
const field={name:'Value',label:'Значение',type:'integer',data_kind:'discrete'};
function portChannel(schemas){
 const calls=[];
 return {calls,channel:{async readOutputPort(options){calls.push(options);return {output:{port:options.port,port_guid:`guid-${options.port}`,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:options.execution.execution_id,schema:(schemas?.[options.port]??[field]).map(({data_kind,...f},index)=>({...f,index})),row_count:0,sample_rows:0,sample_complete:true,sample:[],precision:{numbers_verified:true,limitations:[]},limitations:['zero_rows']}};},async observe(){throw Error('Output reading must not use UI');},async perform(){throw Error('Output reading must not use UI');}}};
}
test('filter_reads_only_requested_ports',async()=>{
 const mapped={ports:[0,1].map(port=>({port,native_mapping:{target_fields:[field]}}))};
 for(const requested of [[1],[1,0]]){
  const {channel,calls}=portChannel();
  const result=await readFilterOutputs(channel,{...read,ports:requested},ctx,mapped);
  assert.deepEqual(calls.map(c=>c.port),requested);
  assert.equal(calls[0].execution,ctx.portExecution);
  assert.deepEqual(calls.map(c=>[c.sampleRows,c.requireExactNumbers]),requested.map(()=>[2,true]));
  assert.deepEqual(result.ports.map(p=>p.port),requested);
  assert.equal(result.execution_id,ctx.execution.execution_id);
  assert.equal(Object.hasOwn(result,'port_evidence'),false);
  assert.equal(result.ports[0].schema[0].data_kind,field.data_kind);
  assert.equal(new Set(result.ports.map(p=>p.port_guid)).size,requested.length);
 }
});

test('regression reads predictions and only selected coefficients in observed schema order',async()=>{
 const configuration={fields:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',usage_type:0},{name:'Response',label:'Target',type:'real',data_kind:'Непрерывный',usage_type:4}]};
 const schemas=[0,1].map(port=>linRegressionOutputColumns(configuration,port));
 const mapped={ports:schemas.map((schema,port)=>({port,schema}))};
 const observed=schemas.map(schema=>[...schema].reverse()),{channel,calls}=portChannel(observed);
 const result=await readLinRegressionOutputs(channel,{...read,ports:[1,0]},ctx,mapped);
 assert.deepEqual(calls.map(c=>c.port),[1,0]);assert.ok(calls.every(c=>c.execution===ctx.portExecution));
 assert.deepEqual(result.ports.map(p=>p.schema.map(f=>f.name)),[observed[1],observed[0]].map(schema=>schema.map(f=>f.name)));
 assert.equal(result.ports[1].schema.find(f=>f.name==='Id').data_kind,'Дискретный');
 assert.equal(new Set(result.ports.map(p=>p.port_guid)).size,2);assert.equal(Object.hasOwn(result,'port_evidence'),false);
 const extra=portChannel([schemas[0],[...schemas[1],{name:'PValue',label:'PValue',type:'real'}]]);
 await assert.rejects(()=>readLinRegressionOutputs(extra.channel,{...read,ports:[1]},ctx,mapped),/schema|fields/);
});

test('filter refuses reordered fields and shared output identities',async()=>{
 const fields=[field,{name:'Other',label:'Other',type:'string',data_kind:'continuous'}];
 const mapped={ports:[0,1].map(port=>({port,native_mapping:{target_fields:fields}}))};
 const reordered=portChannel([fields.toReversed(),fields]);
 await assert.rejects(()=>readFilterOutputs(reordered.channel,{...read,ports:[0]},ctx,mapped),/field order/);
 const duplicate=portChannel([fields,fields]),original=duplicate.channel.readOutputPort;
 duplicate.channel.readOutputPort=async options=>{const result=await original(options);result.output.port_guid='same';return result;};
 await assert.rejects(()=>readFilterOutputs(duplicate.channel,{...read,ports:[0,1]},ctx,mapped),/unexpected identity/);
});

test('clustering reads Cluster Distance and permitted passthrough order on requested ports',async()=>{
 const configuration={fields:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',usage_type:0},{name:'Factor',label:'Factor',type:'real',data_kind:'Непрерывный',usage_type:3}]};
 const schemas=[0,1].map(port=>clusteringOutputColumns(configuration,port));
 const mapped={ports:schemas.map((schema,port)=>({port,schema}))};
 const observed=schemas.map(schema=>[...schema].reverse()),{channel,calls}=portChannel(observed);
 const result=await readClusteringOutputs(channel,{...read,ports:[1,0]},ctx,mapped);
 assert.deepEqual(calls.map(c=>c.port),[1,0]);assert.ok(calls.every(c=>c.execution===ctx.portExecution));
 assert.deepEqual(result.ports.map(p=>p.schema.map(f=>f.name)),[observed[1],observed[0]].map(schema=>schema.map(f=>f.name)));
 assert.equal(result.ports[1].schema.find(f=>f.name==='Id').data_kind,'Дискретный');
 assert.equal(new Set(result.ports.map(p=>p.port_guid)).size,2);assert.equal(Object.hasOwn(result,'port_evidence'),false);
 const absent=portChannel([schemas[0].filter(f=>f.name!=='Distance'),schemas[1]]);
 await assert.rejects(()=>readClusteringOutputs(absent.channel,{...read,ports:[0]},ctx,mapped),/Clustering output/);
});

test('REST actual support reads its fixed schemas without repeating execution or HTTP configuration',async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'rest'},calls=[];
 const schemas=[[['RequestID','Идентификатор запроса','integer'],['Response','Ответ сервера','string']],
  [['RequestID','Идентификатор запроса','integer'],['ErrorCode','Код завершения','integer'],['ErrorDesc','Описание ошибки','string'],['HttpStatusCode','Код состояния HTTP','integer']]]
  .map(schema=>schema.map(([name,label,type],index)=>({index,name,label,type})));
 let httpRequests=0,configurations=0,reading=false;
 const channel={async observe(){if(reading)throw Error('REST reader must not open UI');return {prepared_node_context:node,wizard:{root_tid:'wizard'},ui:{elements:[]}};},
  async perform(){},async revealGraphNode(){},async readOutputPort(options){calls.push(options);return {output:{port:options.port,port_guid:'rest-'+options.port,execution_id:'exec',fresh:true,freshness_basis:'completed_execution_port_source',
   schema:structuredClone(schemas[options.port]),row_count:0,sample_rows:0,sample_complete:true,sample:[],precision:{numbers_verified:true,limitations:[]},limitations:['zero_rows']}};}};
 const context={structuredClone,alignReadSchema,calculatorConfigurationReadback:()=>{},calculatorParametersSchema:{},
  requireValue:(ok,message)=>{if(!ok)throw Error(message);},verified:value=>({verified:true,cleanup_complete:true,effect_possible:false,...value}),
  createNodeProcedure:()=>channel,createNodeExecutionProcedure:()=>({async prepare(){},async waitCompleted(){return ctx.portExecution;}}),
  selectPreparedGraphNode:async()=>{},openPreparedWizard:async()=>{},finishedImportSurface:()=>({}),
  finishConfiguredGraph:async()=>{httpRequests++;return {execution_id:'exec'};}};
 const shared=vm.runInNewContext('('+createTabularTransformNodeSupport.toString()+')',context);
 const source=readFileSync(new URL('../lib/rest-request-node.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const create=vm.runInNewContext(source+'\ncreateRestRequestNodeSupport;',{
  ...context,createTabularTransformNodeSupport:shared,validateRestRequestParameters:()=>{},restRequestParametersSchema:{},
  runRestStep:async()=>{configurations++;return {configuration:{}};},makeRestRequestCode:()=>{},openNewOutputTable});
 const support=create({}),phase={...ctx,node,document_id:'doc',workflow_ref:{workflow_id:'flow'},deadline:10000};
 const request={parameters:{},target:{kind:'new'},finish:'execute',document_id:'doc',workflow_ref:phase.workflow_ref};
 const driver=support.nodeApplyDriverFactory({operation:{id:'rest',parameters:request,nodeApply:{request,node,phases:[]}},now:()=>1});
 await driver.openWizard(phase);await driver.configureCalculator(phase,{});await driver.mapPorts([],phase);
 await driver.finishGraph('execute',phase);await driver.waitExecution(phase);reading=true;
 const result=await driver.readOutput({...read,ports:[1,0]},phase);
 assert.deepEqual(calls.map(c=>c.port),[1,0]);assert.ok(calls.every(c=>c.execution===ctx.portExecution));
 assert.equal(httpRequests,1);assert.equal(configurations,1);assert.equal(Object.hasOwn(result,'port_evidence'),false);
 assert.deepEqual(structuredClone(result.ports.map(p=>p.schema.map(f=>f.name))),[schemas[1],schemas[0]].map(schema=>schema.map(f=>f.name)));
 assert.equal(result.ports[1].schema[1].data_kind,'Дискретный');assert.notEqual(result.ports[0].port_guid,result.ports[1].port_guid);
});
