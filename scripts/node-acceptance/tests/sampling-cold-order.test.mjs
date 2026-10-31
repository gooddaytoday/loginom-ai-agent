import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const partition of [false,true])test(`${partition?'partition':'sampling'} cold reselects and reactivates after Cancel before reading`,async()=>{
 const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const types=new Set'),source.indexOf('  const matched=correspondence.map'));
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('f','with(f){'+body+'return correspondence;}');
 const node={document_id:'doc',workflow_id:'flow',node_id:'sample'},target={ref:node,type:partition?'preprocessing.data_partition':'preprocessing.sampling',label:'sample'};
 const columns=[{name:'RowID',label:'RowID',type:'integer'}],calls=[],ports=partition?[0,1,2]:[0];let active=false,selected=false,materialized=false,sequence=0;
 const result=await run({sampling:{sample_rows:20},samplingBaseline:{},expectedOutputs:ports.map(output_port=>({output_node_type:target.type,output_port,rows:[]})),
  expected:{nodes:[{type:target.type}]},graph:{nodes:[target]},saved:{path:'/own/sample.lgp'},prepared:{document_id:'doc',workflow_ref:{}},
  origin:'https://app.loginom.ai',multiple:true,load:async()=>({}),channelFor:()=>({}),execute:async()=>({}),record:async()=>{},
  session:'cold',createNodeProcedure:()=>({}),createNodeExecutionProcedure:()=>({}),withBrowserReceipt:()=>'',performColdNodeAction:async()=>{},
  coldProcessObservation:()=>({execute:async()=>{},observe:async()=>{}}),staticSources:undefined,
  selectColdOutputReads:()=>[{node:target,ports:ports.map(port=>({port}))}],
  runColdExecution:async()=>{calls.push('execute');active=selected=materialized=true;return {status:'completed',verified:true,owner_verified:true,execution_id:String(++sequence)};},
  observeSamplingColdMapping:async({port})=>{assert.ok(materialized,'definition needs activation');calls.push('definition'+port);active=selected=false;return {verified:true};},
  openNewOutputTable:async()=>{assert.ok(selected,partition?'Requested output is not active':'Requested output port missing');assert.ok(active,'Requested output is not active');return {table:{}};},configureTablePrecision:async()=>({fields:columns.map(c=>({...c,key:c.name}))}),
  prepareTableRead:async()=>({}),readTableOutputPages:async()=>{calls.push('read');return {schema:columns,sample:[]};},decodeTableOutput:raw=>raw,
  returnFromOutputTable:async()=>{},writeFile:async()=>{},join:()=>'',args:{output:''},config:{},loginPassword:'',exportCsv:undefined,state:{},
  checkSamplingCold:(_expected,actual)=>{assert.equal(actual.length,2*ports.length);assert.ok(actual.every(r=>r.sampling_mapping.verified));assert.deepEqual([...new Set(actual.map(r=>r.execution.execution_id))],['2','4']);return {correspondence:[{node,output_port:0}]};}});
 assert.equal(result.length,1);
 const round=['execute',...ports.map(p=>'definition'+p),'execute',...ports.map(()=>'read')];
 assert.deepEqual(calls,[...round,...round]);
});
