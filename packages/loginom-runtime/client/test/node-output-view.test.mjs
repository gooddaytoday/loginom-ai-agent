import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {sampleFromReceipt} from '../lib/node-output-view.mjs';
import {nodeInputCount} from '../lib/user-results.mjs';
import {createRedactor} from '../lib/redact.mjs';

const makeCell=value=>({type:'string',value,is_null:value===null,precision:'source_text'});
const makeReceipt=({values,rowCount=values.length,nodeId='target',executionId='doc:root:3',portGuid='result-port'}={})=>({
 operation_id:nodeId,state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{
  node:{document_id:'doc',workflow_id:'flow',node_id:nodeId},execution:{status:'completed',execution_id:executionId},
  configuration:{status:'applied',readback:{kind:'row_filter',conditions:['confirmed']}},
  output:{ports:[{port:0,port_guid:portGuid,fresh:true,execution_id:executionId,freshness_basis:'completed_execution_port_source',
   schema:[{index:0,name:'item',label:'Item',type:'string'}],row_count:rowCount,sample:values.map(value=>[makeCell(value)]),
   sample_rows:values.length,sample_complete:values.length===rowCount}]},
 }},
});
const options={userProfile:true,tool:'dock_node_wait'};
const project=(receipt,extra={})=>nodeResultReply(receipt,{...options,outputView:true,...extra});
const readPort=receipt=>receipt.outcome.output.output.ports[0];

test('wait publishes the final model rows and explicit sample limit without changing either MCP result copy',()=>{
 const receipt=makeReceipt({values:['a','b','я'.repeat(30000)],rowCount:120});
 const {_meta,...reply}=project(receipt);
 assert.deepEqual(reply,nodeResultReply(receipt,options));
 assert.equal(reply.structuredContent.output.ports,undefined);
 const [delivered]=JSON.parse(reply.content[0].text).output.ports;
 const [view]=_meta.loginomNodeOutput.ports;
 assert.deepEqual(view.summary,{rowCount:120});
 assert.deepEqual(view.detail,{kind:'delivered',sample:[[makeCell('a')],[makeCell('b')]]});
 assert.deepEqual(view.detail.sample,delivered.sample);
 assert.deepEqual(view.expanded.sample,{targetRows:100,availableRows:2,limitation:'more_rows_not_delivered'});
 assert.deepEqual(view.expanded.columns,[{index:0,name:'item',label:'Item',type:'string'}]);
 assert.deepEqual(view.signals,[{kind:'seen_of_total',seen:2,total:120}]);
 assert.deepEqual(_meta.loginomNodeOutput.how.configuration,{kind:'row_filter',conditions:['confirmed']});
});

test('zero rows and NULL in read rows are distinct; zero and empty strings are not NULL',()=>{
 for(const [values,rowCount,signals] of [
  [[],0,[{kind:'zero_rows'}]],
  [[null,null],7,[{kind:'seen_of_total',seen:2,total:7},{kind:'null_in_read_rows',columns:[0]}]],
  [[null,'0',''],3,[]],
  [[],4,[{kind:'seen_of_total',seen:0,total:4}]],
 ]){
  const view=project(makeReceipt({values,rowCount}))._meta.loginomNodeOutput;
  const [port]=view.ports;
  assert.deepEqual(port.signals,signals);
  assert.deepEqual(view.how.configuration,{kind:'row_filter',conditions:['confirmed']});
 }
});

test('refused model delivery never publishes hidden rows or a claim about their NULLs',()=>{
 const receipt=makeReceipt({values:[null],rowCount:5});
 readPort(receipt).schema[0].label='x'.repeat(50000);
 const reply=project(receipt);
 assert.equal(reply.isError,true);
 const [port]=reply._meta.loginomNodeOutput.ports;
 assert.deepEqual(port.detail,{kind:'unavailable',reason:'rows_not_delivered'});
 assert.equal(port.expanded.columns,null);
 assert.equal(port.expanded.columnsLimitation,'columns_projection_limit');
 assert.deepEqual(port.signals,[{kind:'seen_of_total',seen:0,total:5}]);
});

test('expanded columns remain available when only the delivered rows exceed the budget',()=>{
 const receipt=makeReceipt({values:['x'.repeat(50000)],rowCount:1});
 receipt.outcome.output.configuration.readback={kind:'user_variables'};
 const reply=project(receipt);
 assert.equal(reply.isError,true);
 const [port]=reply._meta.loginomNodeOutput.ports;
 assert.deepEqual(port.detail,{kind:'unavailable',reason:'rows_not_delivered'});
 assert.deepEqual(port.expanded.columns,readPort(receipt).schema);
});

test('failure to build optional output metadata does not change the model reply',()=>{
 const receipt=makeReceipt({values:['visible']});
 assert.deepEqual(project(receipt,{inputCount:()=>{throw new Error('unavailable input evidence');}}),nodeResultReply(receipt,options));
});

test('before and after uses the confirmed linked input, not a neighbouring receipt',()=>{
 const target=makeReceipt({values:['result'],rowCount:3});
 const source=makeReceipt({values:[],rowCount:12,nodeId:'linked',executionId:'doc:root:1',portGuid:'input-source-port'});
 const unrelated=makeReceipt({values:[],rowCount:90,nodeId:'neighbour',executionId:'doc:root:2',portGuid:'neighbour-port'});
 const input={nodeId:'linked',portGuid:'input-source-port',inputPortGuid:'input-port',linkGuid:'link',executionId:'doc:root:1'};
 const resolve=receipts=>()=>receipts.map(receipt=>nodeInputCount(input,receipt,target.outcome.output.node)).find(Boolean);
 const getSignal=receipts=>project(target,{inputCount:resolve(receipts)})._meta.loginomNodeOutput.ports[0].signals.find(signal=>signal.kind==='before_after');
 assert.deepEqual(getSignal([unrelated,source]),{kind:'before_after',input:{...input,rowCount:12},after:3});
 readPort(source).port_guid='changed-port';
 assert.equal(getSignal([unrelated,source]),undefined);
});

test('expanded read uses only the same execution, port, schema and confirmed cleanup',()=>{
 const port=readPort(makeReceipt({values:['a'],rowCount:107}));
 const output={...port,sample:Array.from({length:100},()=>[makeCell('fresh-data')])};
 const evidence={verified:true,cleanup_complete:true,output};
 const redactor=createRedactor(['fresh-data']);
 assert.deepEqual(JSON.parse(JSON.stringify(sampleFromReceipt(port,evidence,redactor))),{
  rows:Array.from({length:100},()=>[makeCell('[redacted]')]),targetRows:100,
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
