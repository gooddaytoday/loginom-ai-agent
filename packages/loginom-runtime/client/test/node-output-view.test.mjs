import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {sampleFromReceipt} from '../lib/node-output-view.mjs';
import {linkedInputReceipt,loginomFeedMetadata} from '../lib/user-results.mjs';
import {createRedactor} from '../lib/redact.mjs';

const makeCell=value=>({type:'string',value,is_null:value===null,precision:'source_text'});
const makeReceipt=({values,rowCount=values.length,nodeId='target',executionId='doc:root:3',portGuid='result-port'}={})=>({
 id:nodeId,operation_id:nodeId,state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{
  node:{document_id:'doc',workflow_id:'flow',node_id:nodeId},execution:{status:'completed',execution_id:executionId},
  configuration:{status:'applied',readback:{kind:'row_filter',conditions:['confirmed']}},
  output:{ports:[{port:0,port_guid:portGuid,fresh:true,execution_id:executionId,freshness_basis:'completed_execution_port_source',
   schema:[{index:0,name:'item',label:'Item',type:'string'}],row_count:rowCount,sample:values.map(value=>[makeCell(value)]),
   sample_rows:values.length,sample_complete:values.length===rowCount}]},
 }},
});
const options={userProfile:true,tool:'dock_node_wait'};
const project=(receipt,extra={})=>loginomFeedMetadata(nodeResultReply(receipt,options),{tool:options.tool,...extra});
const readPort=receipt=>receipt.outcome.output.output.ports[0];

test('wait publishes the final model rows and explicit sample limit without changing either MCP result copy',()=>{
 const receipt=makeReceipt({values:['a','b','я'.repeat(30000)],rowCount:120});
 const reply=nodeResultReply(receipt,options),before=structuredClone(reply);
 assert.equal(reply.structuredContent.output.ports,undefined);
 const [delivered]=JSON.parse(reply.content[0].text).output.ports;
 const node=receipt.outcome.output;
 const metadata=loginomFeedMetadata(reply,{tool:options.tool,facts:{node:{ref:node.node},configuration:node.configuration}});
 assert.deepEqual(reply,before);
 const [port]=metadata.ports;
 assert.equal(port.rowCount,120);
 assert.deepEqual(port.details,{delivered:{kind:'preview'},sampleLimitation:'more_rows_not_delivered'});
 assert.deepEqual(port.preview.sample,delivered.sample);
 assert.equal(port.preview.schema[0].name,'item');
 assert.deepEqual(metadata.evidence,[{kind:'tableRead',port:0,portGuid:port.guid,rowsRead:2,rowCount:120,executionId:metadata.executionId}]);
 assert.equal(metadata.outputConfiguration.kind,'confirmed');
 assert.deepEqual(metadata.outputConfiguration.readback.conditions,['confirmed']);
});

test('zero rows and NULL in read rows are distinct; zero and empty strings are not NULL',()=>{
 for(const [values,rowCount,nullColumns] of [
  [[],0,undefined],
  [[null,null],7,[0]],
  [[null,'0',''],3,undefined],
  [[],4,undefined],
 ]){
  const [port]=project(makeReceipt({values,rowCount})).ports;
  assert.equal(port.rowCount,rowCount);
  assert.deepEqual(port.details.nullColumns,nullColumns);
 }
});

test('refused model delivery never publishes hidden rows or a claim about their NULLs',()=>{
 const receipt=makeReceipt({values:[null],rowCount:5});
 readPort(receipt).schema[0].label='x'.repeat(50000);
 const reply=nodeResultReply(receipt,options);
 assert.equal(reply.isError,true);
 assert.equal(project(receipt),undefined);
});

test('expanded columns remain available when only the delivered rows exceed the budget',()=>{
 const receipt=makeReceipt({values:['x'.repeat(20000)],rowCount:1});
 const metadata=project(receipt);
 const [port]=metadata.ports;
 assert.equal(metadata.outputConfiguration.kind,'confirmed');
 assert.deepEqual(port.details.delivered,{kind:'unavailable',reason:'projection_limit'});
 assert.deepEqual(JSON.parse(JSON.stringify(port.details.columns)),readPort(receipt).schema);
 assert.ok(Buffer.byteLength(JSON.stringify(metadata))<=16384);
});

test('detail stores one copy of all delivered rows when they fit without the ten-row preview',()=>{
 const values=Array.from({length:11},(_,index)=>'row '+index+'я'.repeat(464));
 const receipt=makeReceipt({values});
 const [delivered]=JSON.parse(nodeResultReply(receipt,options).content[0].text).output.ports;
 assert.equal(delivered.sample.length,11);
 const metadata=project(receipt);
 const [port]=metadata.ports;
 assert.ok(!port.preview);
 assert.deepEqual(port.details.delivered,{kind:'rows',rows:delivered.sample});
 assert.equal(port.details.columns[0].name,'item');
 assert.ok(Buffer.byteLength(JSON.stringify(metadata))<=16384);
});

test('detail does not expose redacted cells',()=>{
 const receipt=makeReceipt({values:['row 0']});
 readPort(receipt).schema[0].name='password';
 const metadata=project(receipt);
 assert.deepEqual(metadata.ports[0].details.delivered,{kind:'unavailable',reason:'rows_redacted'});
 assert.equal(metadata.ports[0].preview.sample[0][0].value,'[redacted]');
 assert.ok(!JSON.stringify(metadata).includes('row 0'));
});

test('before and after uses the confirmed linked input, not a neighbouring receipt',()=>{
 const target=makeReceipt({values:['result'],rowCount:3});
 const source=makeReceipt({values:[],rowCount:12,nodeId:'linked',executionId:'doc:root:1',portGuid:'input-source-port'});
 const unrelated=makeReceipt({values:[],rowCount:90,nodeId:'neighbour',executionId:'doc:root:2',portGuid:'neighbour-port'});
 const input={nodeId:'linked',portGuid:'input-source-port',inputPortGuid:'input-port',linkGuid:'link',executionId:'doc:root:1'};
 const resolve=receipts=>()=>receipts.map(receipt=>linkedInputReceipt(input,receipt,target.outcome.output.node)).find(Boolean);
 const getSignal=receipts=>project(target,{inputReceipt:resolve(receipts)}).ports[0].details.input;
 assert.deepEqual(getSignal([unrelated,source]),{operationId:'linked',executionId:input.executionId,portGuid:input.portGuid});
 assert.equal(project(source).ports[0].rowCount,12);
 assert.equal(project(target).ports[0].rowCount,3);
 readPort(source).port_guid='changed-port';
 assert.equal(getSignal([unrelated,source]),undefined);
});

test('expanded read uses only the same execution, port, schema and confirmed cleanup',()=>{
 const port=readPort(makeReceipt({values:['a'],rowCount:107}));
 const output={...port,sample:Array.from({length:100},()=>[makeCell('fresh-data')])};
 const evidence={verified:true,cleanup_complete:true,output};
 const redactor=createRedactor(['fresh-data']);
 assert.deepEqual(JSON.parse(JSON.stringify(sampleFromReceipt(port,evidence,redactor))),{
  rows:Array.from({length:100},()=>[makeCell('[redacted]')]),
 });
 assert.equal(sampleFromReceipt(port,{...evidence,cleanup_complete:false},redactor),null);
 for(const changed of [{execution_id:'other'},{port_guid:'other'},{row_count:108},{schema:[{...port.schema[0],name:'other'}]}])
  assert.equal(sampleFromReceipt(port,{...evidence,output:{...output,...changed}},redactor),null);
 const large=Array.from({length:100},()=>[makeCell('x'.repeat(900))]);
 const bounded=sampleFromReceipt(port,{...evidence,output:{...output,sample:large}},redactor);
 assert.equal(bounded.limitation,'preview_limit');
 assert.ok(bounded.rows.length>0&&bounded.rows.length<100);
 assert.deepEqual(JSON.parse(JSON.stringify(bounded.rows)),large.slice(0,bounded.rows.length));
});
