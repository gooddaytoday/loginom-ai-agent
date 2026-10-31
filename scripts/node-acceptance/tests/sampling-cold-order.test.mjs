import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('sampling cold activates the saved source before inspecting its output definition',async()=>{
 const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const types=new Set'),source.indexOf('  const matched=correspondence.map'));
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('f','with(f){'+body+'return correspondence;}');
 const node={document_id:'doc',workflow_id:'flow',node_id:'sample'},target={ref:node,type:'preprocessing.sampling',label:'sample'};
 const columns=[{name:'RowID',label:'RowID',type:'integer'}],calls=[];let active=false;
 const result=await run({sampling:{sample_rows:20},samplingBaseline:{},expectedOutputs:[{output_node_type:target.type,output_port:0,rows:[]}],
  expected:{nodes:[{type:target.type}]},graph:{nodes:[target]},saved:{path:'/own/sample.lgp'},prepared:{document_id:'doc',workflow_ref:{}},
  origin:'https://app.loginom.ai',multiple:true,load:async()=>({}),channelFor:()=>({}),execute:async()=>({}),record:async()=>{},
  session:'cold',createNodeProcedure:()=>({}),createNodeExecutionProcedure:()=>({}),withBrowserReceipt:()=>'',performColdNodeAction:async()=>{},
  coldProcessObservation:()=>({execute:async()=>{},observe:async()=>{}}),staticSources:undefined,
  selectColdOutputReads:()=>[{node:target,ports:[{port:0}]}],
  runColdExecution:async()=>{calls.push('execute');active=true;return {status:'completed',verified:true,owner_verified:true,execution_id:String(calls.length)};},
  observeSamplingColdMapping:async()=>{assert.ok(active,'native output definition requires confirmed cold activation');calls.push('definition');return {verified:true};},
  openNewOutputTable:async()=>({table:{}}),configureTablePrecision:async()=>({fields:columns.map(c=>({...c,key:c.name}))}),
  prepareTableRead:async()=>({}),readTableOutputPages:async()=>{calls.push('read');return {schema:columns,sample:[]};},decodeTableOutput:raw=>raw,
  returnFromOutputTable:async()=>{active=false;},writeFile:async()=>{},join:()=>'',args:{output:''},config:{},loginPassword:'',exportCsv:undefined,state:{},
  checkSamplingCold:(_expected,actual)=>{assert.equal(actual.length,2);assert.ok(actual.every(r=>r.sampling_mapping.verified));return {correspondence:[{node,output_port:0}]};}});
 assert.equal(result.length,1);
 assert.deepEqual(calls,['execute','definition','read','execute','definition','read']);
});
