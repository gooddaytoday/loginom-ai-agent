import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {alignReadSchema} from '../lib/node-read-contract.mjs';
import {applyNode} from '../lib/node-apply.mjs';
import * as portReadRefusals from '../lib/native-read-refusal.mjs';

const fields=[{index:0,name:'Value',label:'Значение',type:'string',data_kind:'Дискретный',excluded:false}];
const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh',process_id:'1.1',process_record_id:'child'};
const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
function fixture(change=()=>{},mapping=fields,{operation={},changeReceipt=()=>{}}={}){
 const calls=[];let tableActions=0;
 const output={port:0,port_guid:'physical-output0',fresh:true,freshness_basis:'completed_execution_port_source',execution_id:'fresh',
  schema:mapping.filter(field=>!field.excluded).map(({data_kind,excluded,...field},index)=>({...field,index})),row_count:1,sample_rows:1,sample_complete:true,
  sample:[[{type:'string',is_null:false,value:'data',precision:'source_text',representation:'data_source_string'}]],limitations:[]};
 change(output);
 const receipt={verified:true,cleanup_complete:true,node_context:{...node,verified:true,surface:'graph'},output};changeReceipt(receipt);
 const source=readFileSync(new URL('../lib/javascript-code-node.mjs',import.meta.url),'utf8');
 const start=source.indexOf('      async readOutput(read,ctx){'),end=source.indexOf('      releasePendingPhases:',start);
 const table=()=>{tableActions++;throw Error('JavaScript output must not open Table');};
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  enter:()=>{},need:(ok,message)=>{if(!ok)throw Error(message);},verified:value=>({verified:true,cleanup_complete:true,...value}),
  executionReceipt:execution,outputMapping:{node_context:{output_port:{port_guid:'physical-output0'}},target_fields:mapping},
  channel:{readOutputPort:async options=>{calls.push(options);operation.cleanupConfirmed=receipt.cleanup_complete===true;return receipt;}},alignReadSchema,refuseJavascriptPortFullRead:portReadRefusals.refuseJavascriptPortFullRead,
  openNewOutputTable:table,configureTablePrecision:table,prepareTableRead:table,readTableOutputPages:table,
  restoreTablePrecision:table,returnFromOutputTable:table,
 });
 return {driver:runtime.readOutput,run:read=>runtime.readOutput({ports:[0],sample_rows:100,require_exact_numbers:true,...read},{node,execution:{status:'completed',execution_id:'fresh'},receipt_id:'read'}),calls,get tableActions(){return tableActions;}};
}

test('incomplete structured port refusal proofs return false without throwing',()=>{
 for(const proof of [undefined,null,{}, {execution:{status:'completed',execution_id:'fresh'}}])
  assert.equal(portReadRefusals.verifiedJavascriptPortReadRefusal({phase:'read',status:'FAILED',verification:'javascript_full_bound_refused',
   effect_possible:false,cleanup_complete:true,settings_unchanged:true,proof},node,
   {status:'completed',execution_id:'fresh'},{coverage:'full',sample_rows:100,require_exact_numbers:true}),false);
});

for(const bound of ['rows','cells','bytes'])for(const fault of [null,'cleanup','owner','receipt','basis','port','transport','journal','proof-owner','proof-execution','proof-port','proof-cleanup','proof-bound'])test('production JS port full refusal through applyNode '+bound+': '+fault,async()=>{
 const operation={id:'port-full'},events=[];
 const mapping=bound==='cells'?Array.from({length:101},(_,index)=>({...fields[0],index,name:'C'+index,label:'C'+index})):fields;
 const f=fixture(output=>{
  output.row_count=bound==='rows'?212:bound==='cells'?100:2;output.sample_rows=bound==='rows'?100:bound==='cells'?99:1;output.sample_complete=false;
  output.sample=Array.from({length:output.sample_rows},()=>mapping.map(()=>structuredClone(output.sample[0][0])));
  if(bound!=='rows')output.read_limit='preview_cell_or_byte_budget';
  if(fault==='basis')output.freshness_basis='table';
  if(fault==='port')output.port_guid='foreign';
 },mapping,{operation,changeReceipt:r=>{
  if(fault==='cleanup')r.cleanup_complete=false;
  if(fault==='receipt')r.verified=false;
  if(fault==='owner')r.node_context.node_id='foreign';
 }});
 const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
 const request={operation_id:operation.id,contract_revision:'1.0.0',document_id:node.document_id,
  workflow_ref:{workflow_id:node.workflow_id,prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},
  target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters:{},mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}};
 const handlers=new Map([['programming.javascript',{revision:'port-full-replay',modes:['script'],fullUiOutput:true,validate(){},configure:async()=>verified()}]]);
 const drivers={verifySource:async()=>verified(),prepareTarget:async()=>verified({node}),openWizard:async()=>verified(),mapPorts:async()=>verified(),
  finish:async mode=>verified({mode,execution_started:true,execution_id:'fresh'}),waitExecution:async()=>verified({status:'completed',execution_id:'fresh'}),
  readOutput:async(...args)=>{
   if(fault==='transport')operation.transportUncertain=true;
   try{return await f.driver(...args);}catch(error){
    const proof=error.nodePhaseRefusal?.proof;
    if(fault==='proof-owner')proof.port_read.node_context.node_id='foreign';
    if(fault==='proof-execution')proof.execution.execution_id='foreign';
    if(fault==='proof-port')proof.port_read.output.port_guid='foreign';
    if(fault==='proof-cleanup')proof.port_read.cleanup_complete=false;
    if(fault==='proof-bound'){proof.port_read.output.row_count=proof.port_read.output.sample_rows;delete proof.port_read.output.read_limit;}
    throw error;
   }
  }};
 const result=await applyNode({request,operation,handlers,drivers,now:()=>1,record:async e=>{
  events.push(structuredClone(e));if(fault==='journal'&&e.phase==='node_phase_refused')throw Error('ACK unavailable');return structuredClone(e);
 }});
 assert.equal(result.status,fault?'AMBIGUOUS':'FAILED',JSON.stringify(result));assert.equal(result.cleanup_complete,!fault);
 assert.equal(operation.nodeApply.pending?.phase??null,fault?'read':null);
 assert.equal(f.calls.length,1);assert.equal(f.tableActions,0);
 if(!fault){assert.match(result.error.message,bound==='rows'?/212.*100/:/cell or byte limit/);assert.match(result.next_step.instruction,/sample.*CSV/);assert.doesNotMatch(result.next_step.instruction,/Table read/);assert.ok(events.some(e=>e.phase==='node_phase_refused'&&e.receipt.verification==='javascript_full_bound_refused'));}
});
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
