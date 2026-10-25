import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {alignReadSchema} from '../lib/node-read-contract.mjs';

const fields=[{index:0,name:'Value',label:'Значение',type:'string',data_kind:'Дискретный',excluded:false}];
const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh',process_id:'1.1',process_record_id:'child'};
function fixture(change=()=>{},mapping=fields){
 const calls=[];let tableActions=0;
 const output={port:0,port_guid:'physical-output0',fresh:true,freshness_basis:'completed_execution_port_source',execution_id:'fresh',
  schema:mapping.filter(field=>!field.excluded).map(({data_kind,excluded,...field},index)=>({...field,index})),row_count:1,sample_rows:1,sample_complete:true,
  sample:[[{type:'string',is_null:false,value:'data',precision:'source_text',representation:'data_source_string'}]],limitations:[]};
 change(output);
 const source=readFileSync(new URL('../lib/javascript-code-node.mjs',import.meta.url),'utf8');
 const start=source.indexOf('      async readOutput(read,ctx){'),end=source.indexOf('      releasePendingPhases:',start);
 const table=()=>{tableActions++;throw Error('JavaScript output must not open Table');};
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  enter:()=>{},need:(ok,message)=>{if(!ok)throw Error(message);},verified:value=>({verified:true,cleanup_complete:true,...value}),
  executionReceipt:execution,outputMapping:{node_context:{output_port:{port_guid:'physical-output0'}},target_fields:mapping},
  channel:{readOutputPort:async options=>{calls.push(options);return {output};}},alignReadSchema,
  openNewOutputTable:table,configureTablePrecision:table,prepareTableRead:table,readTableOutputPages:table,
  restoreTablePrecision:table,returnFromOutputTable:table,
 });
 return {run:read=>runtime.readOutput({ports:[0],sample_rows:100,require_exact_numbers:true,...read},{execution:{execution_id:'fresh'},receipt_id:'read'}),calls,get tableActions(){return tableActions;}};
}
test('production JavaScript sample uses observed physical output0 and its own full execution receipt',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].execution,execution);
 assert.deepEqual([f.calls[0].port,f.calls[0].sampleRows,f.calls[0].requireExactNumbers],[0,100,true]);
 assert.equal(result.ports[0].port_guid,'physical-output0');assert.equal(result.ports[0].schema[0].data_kind,'Дискретный');
 assert.deepEqual(structuredClone(result.ports[0].schema),[{index:0,name:'Value',label:'Значение',type:'string',data_kind:'Дискретный'}]);
 assert.equal(f.tableActions,0);
});
test('production JavaScript sample and full reject physical schema and cell reordering',async()=>{
 const mapping=['A','B'].map((name,index)=>({...fields[0],index,name,label:name}));
 for(const coverage of [undefined,'full']){
  const f=fixture(output=>{
   output.schema.reverse().forEach((field,index)=>field.index=index);
   output.sample=[['b','a'].map(value=>({type:'string',is_null:false,value,precision:'source_text',representation:'data_source_string'}))];
  },mapping);
  await assert.rejects(()=>f.run({coverage}),/output field order/i);
  assert.equal(f.calls.length,1);assert.equal(f.tableActions,0);
 }
});
test('production JavaScript preserves configured active column order and cells in sample and full',async()=>{
 const mapping=['A','Hidden','B'].map((name,index)=>({...fields[0],index,name,label:name,excluded:name==='Hidden'}));
 const sample=[['a','b'].map(value=>({type:'string',is_null:false,value,precision:'source_text',representation:'data_source_string'}))];
 for(const coverage of [undefined,'full']){
  const f=fixture(output=>output.sample=sample,mapping),result=await f.run({coverage});
  assert.equal(result.status,'complete');assert.equal(result.ports[0].port_guid,'physical-output0');
  assert.deepEqual(structuredClone(result.ports[0].sample),sample);
  assert.deepEqual(structuredClone(result.ports[0].schema),['A','B'].map((name,index)=>({index,name,label:name,type:'string',data_kind:'Дискретный'})));
 }
});
test('production JavaScript full requires complete bounded exact output on the physical port',async()=>{
 const full=fixture();assert.equal((await full.run({coverage:'full'})).status,'complete');assert.equal(full.tableActions,0);
 for(const change of [output=>output.port_guid='foreign',output=>output.port=1,output=>output.sample_complete=false,
  output=>output.sample_rows=0,output=>output.limitations=['numeric_display_precision']]){
  const refused=fixture(change);await assert.rejects(()=>refused.run({coverage:'full'}),/physical output|bounded read coverage/);
  assert.equal(refused.tableActions,0);
 }
});
