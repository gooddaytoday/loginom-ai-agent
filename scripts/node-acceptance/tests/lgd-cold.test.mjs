import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLgdFields} from '../lgd-cold.mjs';
import {readFile} from 'node:fs/promises';
import {parseExpectedOutputs} from '../expected-outputs.mjs';
test('LGD variable fixtures use the stock cold expected contract for both source contents',async()=>{
 for(const name of ['expected.json','expected-initial.json']){
  const expected=JSON.parse(await readFile(new URL('../../../docs/node-development/nodes/imports-lgd/acceptance/variable/'+name,import.meta.url),'utf8'));
  assert.equal(parseExpectedOutputs({...expected,package_path:'/own/variable.lgp'}).outputs.length,1);
 }
});
test('LGD checksum fixture uses the stock cold expected contract',async()=>{
 const expected=JSON.parse(await readFile(new URL('../../../docs/node-development/nodes/imports-lgd/acceptance/checksum/expected.json',import.meta.url),'utf8'));
 assert.equal(parseExpectedOutputs({...expected,package_path:'/own/checksum.lgp'}).outputs.length,3);
});
test('LGD cold audits retained source before execution and materialized output properties after full reading',async()=>{
 const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  let coldChannelSequence=0;'),source.indexOf('  const matched=correspondence.map'));
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('f','with(f){'+body+'return correspondence;}');
 for(const valid of [true,false])for(const variable of [true,false]){
  const node={document_id:'doc',workflow_id:'flow',node_id:'lgd'},target={ref:node,type:'imports.lgd',label:'LGD'};
  const field={name:'RecordId',label:'Идентификатор',type:'integer',data_kind:'discrete'};
  const calls=[];let materialized=false;
  const result=run({sampling:undefined,expectedOutputs:[{output_node_type:'imports.lgd',output_port:0,rows:[{RecordId:1}]}],
   expected:{nodes:[{type:'imports.lgd'}],lgd:{columns:[field],...(variable?{source_variable:'SourceFile'}:{})}},graph:{nodes:[target]},saved:{path:'/own/lgd.lgp'},
   prepared:{document_id:'doc',workflow_ref:{}},origin:'https://app.loginom.ai',multiple:true,session:'cold',
   load:async()=>({}),execute:async()=>({}),record:async()=>{},createNodeProcedure:()=>({}),withBrowserReceipt:()=>'',
   createNodeExecutionProcedure:()=>({}),performColdNodeAction:async()=>{},coldProcessObservation:()=>({execute:async()=>{},observe:async()=>{}}),
   selectColdOutputReads:()=>[{node:target,ports:[{port:0}]}],
   runColdExecution:async()=>{calls.push('execute');materialized=true;return {status:'completed',verified:true,owner_verified:true};},
   openNewOutputTable:async()=>({table:{}}),configureTablePrecision:async()=>({fields:[{...field,key:field.name}]}),
   prepareTableRead:async()=>({}),readTableOutputPages:async()=>{calls.push('read');return {row_count:1};},decodeTableOutput:raw=>raw,
   returnFromOutputTable:async()=>{},writeFile:async()=>{},join:()=>'',args:{output:''},config:{},loginPassword:'',state:{},exportCsv:undefined,
   matchExpectedOutputs:()=>[{node,output_port:0}],
   inspectSavedLgd:async({outputProperties})=>{
    calls.push(outputProperties?'output_properties':'source_settings');
    if(!outputProperties){assert.equal(materialized,variable);return;}
    assert.equal(materialized,true,'LGD output schema is absent before cold Execute');
    verifyLgdFields([{...field,label:valid?field.label:'Changed',data_kind:'Дискретный'}],[field]);
   }});
  if(valid)assert.equal((await result).length,1);
  else await assert.rejects(result,/LGD_COLD_FIELD_PROPERTIES/);
  assert.deepEqual(calls,variable?['execute','read','output_properties',...(valid?['source_settings']:[])]:['source_settings','execute','read','output_properties']);
 }
});
test('LGD cold checks exact names, labels, types, kinds, order and exclusions',()=>{
 const expected=[{name:'RecordId',label:'Идентификатор',type:'integer',data_kind:'discrete'},{name:'Amount',label:'Сумма',type:'real',data_kind:'continuous'}];
 const fields=expected.map(f=>({...f,data_kind:f.data_kind==='discrete'?'Дискретный':'Непрерывный',excluded:false}));
 assert.equal(verifyLgdFields(fields,expected),true);
 for(const [key,value]of Object.entries({name:'Id',label:'RecordId',type:'real',data_kind:'Непрерывный',excluded:true})){
  const bad=structuredClone(fields);bad[0][key]=value;assert.throws(()=>verifyLgdFields(bad,expected),/LGD_COLD_FIELD_PROPERTIES/);
 }
 assert.throws(()=>verifyLgdFields([...fields].reverse(),expected));
});
