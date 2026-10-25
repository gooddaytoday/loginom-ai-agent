import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {releasePendingNode,NODE_RELEASE_BUDGET_MS} from '../lib/node-pending-release.mjs';
import {readFilterOutputs} from '../lib/filter-output.mjs';
import {alignReadSchema} from '../lib/node-read-contract.mjs';
import {releaseNodeApply} from '../lib/node-apply.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
 navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]};
const execution={verified:true,owner_verified:true,status:'completed',execution_id:'doc:root:1',process_id:'1.1',process_record_id:'child'};
const field={index:0,name:'Value',label:'Value',type:'string'};
const clean=()=>({verified:true,cleanup_complete:true,node_context:{...node,verified:true},output:{port:0,port_guid:'p0',
 fresh:true,execution_id:execution.execution_id,freshness_basis:'completed_execution_port_source',schema:[field],
 row_count:0,sample_rows:0,sample_complete:true,sample:[],limitations:[]}});
function fixture(file,reply){
 const calls=[],operation={id:'read',deadline:10000,cleanupConfirmed:true,action:{action_key:'node.apply',revision:'1'},lastReceipt:{id:'old-gesture'},
  nodeApply:{node,pending:{phase:'read'},request:{document_id:'doc',workflow_ref:workflow}},
  nodeTargetAdapter:{observe:async()=>({complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node}],links:[],foreign_links:[]})}};
 const quiet={wizard:{status:'absent'},prepared_node_context:{...node,verified:true,surface:'graph',locked:false},ui:{dialogs:[],masks:[]}};
 const channel={...createNodeProcedure({operation,now:()=>1,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},
  targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async r=>r,execute:async code=>{assert.match(code,/readNodePortOutput/);calls.push('read');return reply();}}),
  observe:async({ready})=>{calls.push('observe');assert.ok(ready(quiet));return quiet;}};
 const source=readFileSync(new URL('../lib/'+file,import.meta.url),'utf8');
 const start=source.indexOf('async releasePending(state,'),end=source.indexOf('async verifyContinuation',start);
 const readStart=source.indexOf('async readOutput(read,ctx)'),readEnd=file==='calculator-node.mjs'
  ?source.indexOf('   ...((!implementation',readStart):start;
 const readReceipt=async()=>{calls.push('old-gesture');return {state:'completed',receipt:{cleanup_complete:true}};};
 const driver=vm.runInNewContext('({'+source.slice(readStart,readEnd)+source.slice(start,end)+'})',{
  enter:()=>{},now:()=>1,NODE_RELEASE_BUDGET_MS,requireValue:(ok,message)=>{if(!ok)throw Error(message);},
  verified:value=>({verified:true,cleanup_complete:true,...value}),executionReceipt:execution,columns:[field],outputColumns:[field],implementation:null,
  alignReadSchema,releasePendingNode,operation,channel,options:{readReceipt},readReceipt});
 return {operation,calls,channel,driver,read:port=>channel.readOutputPort({port,sampleRows:1,requireExactNumbers:true,execution}),
  release:()=>driver.releasePending(operation.nodeApply)};
}
for(const file of ['calculator-node.mjs','text-import-node.mjs'])test(file+' release retains failed port-proxy disposal despite a quiet graph and old gesture cleanup',async()=>{
 const f=fixture(file,()=>({verified:false,cleanup_complete:false,reason:'dispose_failed'}));
 await assert.rejects(()=>f.read(0),/dispose_failed/);
 assert.equal(f.operation.cleanupConfirmed,false);
 // Phase failure and later UI work must not overwrite the port cleanup fact.
 f.operation.cleanupConfirmed=true;
 await assert.rejects(f.release,/output-port read has no confirmed settled cleanup/);
 assert.deepEqual(f.calls,['read']);
});
for(const file of ['calculator-node.mjs','text-import-node.mjs'])test(file+' releases a cleaned schema refusal with completed execution and no Execute',async()=>{
 const f=fixture(file,()=>{const result=clean();result.output.schema=[{...field,label:'Changed'}];return result;});
 await assert.rejects(()=>f.driver.readOutput({ports:[0],sample_rows:1,require_exact_numbers:true},{execution,receipt_id:'read'}),{code:'NODE_READ_SCHEMA_CHANGED'});
 const request={operation_id:'read',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:1,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 Object.assign(f.operation.nodeApply,{request,execution,output:null,signature:'request',phases:[{phase:'finish',status:'verified'}]});
 f.operation.cleanupConfirmed=false;
 const result=await releaseNodeApply({operation:f.operation,drivers:f.driver,
  handlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:()=>{throw Error('Release must not configure');}}]]),record:async event=>event});
 assert.equal(result.cleanup_complete,true);assert.equal(result.execution.status,'completed');assert.equal(result.execution.execution_id,execution.execution_id);
 assert.equal(result.pending_phase,null);assert.equal(f.operation.nodeApply.pending,null);
 assert.deepEqual(f.calls,['read','old-gesture','observe','observe','observe']);
});
for(const file of ['calculator-node.mjs','text-import-node.mjs'])test(file+' release requires the current port attempt cleanup proof',async()=>{
 for(const fault of ['unknown','transport','unstarted']){
  const f=fixture(file,()=>{if(fault==='transport')throw Error('lost transport');return {cleanup_complete:true};});
  if(fault==='unstarted')f.operation.deadline=1;
  await assert.rejects(()=>f.read(0),/refused|lost transport|budget exhausted/);
  f.operation.cleanupConfirmed=true;
  await assert.rejects(f.release,/no confirmed settled cleanup|has not confirmed completion/);
  assert.deepEqual(f.calls,fault==='unstarted'?[]:['read']);
 }
});
for(const file of ['calculator-node.mjs','text-import-node.mjs'])test(file+' release cannot reuse cleanup from the first Filter output',async()=>{
 for(const fault of ['dispose','unstarted']){
  let attempts=0;
  const f=fixture(file,()=>{
   if(++attempts===1)return clean();
   return {verified:false,cleanup_complete:false,reason:'dispose_failed'};
  });
  const channel={...f.channel,readOutputPort:request=>{
   if(fault==='unstarted'&&request.port===1)f.operation.deadline=1;
   return f.channel.readOutputPort(request);
  }};
  await assert.rejects(()=>readFilterOutputs(channel,{ports:[0,1],sample_rows:1,require_exact_numbers:true},
   {execution,portExecution:execution}, {ports:[0,1].map(port=>({port,native_mapping:{target_fields:[field]}}))}),/dispose_failed|budget exhausted/);
  f.operation.cleanupConfirmed=true;
  await assert.rejects(f.release,/output-port read has no confirmed settled cleanup/);
  assert.equal(attempts,fault==='unstarted'?1:2);
 }
});
