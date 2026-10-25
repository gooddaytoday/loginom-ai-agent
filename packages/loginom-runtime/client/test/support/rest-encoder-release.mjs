import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createHash} from 'node:crypto';
import {createRedactor} from '../../lib/redact.mjs';
import {applyNode} from '../../lib/node-apply.mjs';
import {releaseNodeTarget} from '../../lib/node-target.mjs';
const fault=process.argv[2]??'safe',calls=[],events=[];
const node={document_id:'doc',workflow_id:'flow',node_id:'encoder'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'nav',label:'Scenario'}]};
let wizard=false,adapters=0,source;
const snapshot=()=>({prepared_node_context:{...node,verified:true,surface:wizard?'wizard':'graph',locked:wizard},
 wizard:wizard?{status:'observed',root_ref:'wizard',root_tid:'W',stage:'input_mapping',owner_context:{status:'observed'}}:{status:'absent'},
 ui:{elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}],dialogs:[],masks:[]},
 node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,state_source:'cached_mapping_stores',
  settings_applied:false,package_saved:false,autosync:true,node_context:{...node,surface:'wizard',input_port:{direction:'input',port:0}},
  source_fields:[{name:'Key'}],target_fields:[{name:'Key'}]}});
const procedure=await import('../../lib/node-procedure.mjs');
mock.module(new URL('../../lib/node-procedure.mjs',import.meta.url),{namedExports:{...procedure,
 createNodeProcedure:()=>({openPort:async()=>{wizard=true;},observe:async({ready})=>{const s=snapshot();assert.ok(ready(s));return s;},
  perform:async()=>{wizard=false;}})}});
const managed=await import('../../lib/javascript-managed-source-adapter.mjs');
mock.module(new URL('../../lib/javascript-managed-source-adapter.mjs',import.meta.url),{namedExports:{...managed,
 createJavascriptManagedSourceAdapter:()=>{
  const readback=adapters++>0;let active=false,uncertain=false;
  return {open:async()=>{if(readback){calls.push('source-read-refused');uncertain=fault==='opening-unknown';throw Error('capture refused');}
    active=true;return {settings:{generation:false},schema:{}};},
   read:async()=>({source}),replace:async()=>({draft_exact:true,source_sha256:createHash('sha256').update(source).digest('hex')}),
   commit:async()=>{calls.push('Done');if(fault==='done-unknown'){uncertain=true;throw Error('lost Done reply');}
    active=false;return {owned_done_settled:true,graph_owner_verified:true};},
   discard:async()=>{active=false;return {closed:true};},
   get active(){return active;},get uncertain(){return uncertain;}};
 }}});
const {createJavascriptCodeNodeSupport}=await import('../../lib/javascript-code-node.mjs');
const {createRestRequestNodeSupport,restQueryEncoderRequest}=await import('../../lib/rest-request-node.mjs');
const request={operation_id:'rest',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'integration.rest_request',label:'REST'},inputs:[{source:{...node,node_id:'input'},output:0,input:0}],
 mode:'request',parameters:{connection:{name:'Echo',base_url:'https://echo.test'},query_parameters:[{name:'Key',field:'Key'}]},mappings:[],finish:'execute',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:60000,execute_ms:60000,total_ms:60000}};
const childRequest=restQueryEncoderRequest(request,Date.now()+60000);source=childRequest.parameters.source_text;
const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:1,
 nodes:[{ref:node,type:'programming.javascript',label:'URL query encoding',inputs:[0],outputs:[0],position:{x:320,y:280},locked:false}],links:[],foreign_links:[]};
const adapter={observe:async()=>structuredClone(graph),verifyWorkflow:async()=>({status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow})};
const operation={id:childRequest.operation_id,parameters:childRequest,nodeTargetAdapter:adapter};
const record=async e=>{events.push(e);return fault==='ack'&&e.phase==='rest_query_encoder_released'?{...e,graph:null}:e;};
const support=createJavascriptCodeNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()});
const driver=support.nodeApplyDriverFactory({operation,execute:async()=>assert.fail('Unexpected browser transport'),
 onRecord:record,now:Date.now,readReceipt:async()=>({state:'completed',receipt:{cleanup_complete:fault!=='receipt'}}),receiptOptions:()=>({})});
const result=await applyNode({request:childRequest,operation,handlers:support.nodeApplyHandlers,record,
 drivers:{...driver,prepareTarget:async(_,ctx)=>{await driver.beforeTarget(ctx);return {verified:true,cleanup_complete:true,node};}}});
assert.equal(result.pending_phase,'node_finish',JSON.stringify(result));assert.deepEqual(calls,fault==='done-unknown'?['Done']:['Done','source-read-refused']);
if(fault==='transport')operation.transportUncertain=true;
if(fault==='receipt')operation.lastReceipt={id:'original'};
const parent={id:request.operation_id,parameters:request,nodeTargetAdapter:adapter,nodeEffectPossible:true,cleanupConfirmed:false,
 nodeApply:{request,pending:{phase:'target'},node:null},restQueryEncoder:{operation,drivers:driver,handlers:support.nodeApplyHandlers,result}};
if(fault==='owner')operation.id='foreign';
const rest=createRestRequestNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
const drivers=rest.nodeApplyDriverFactory({operation:parent,now:Date.now,onRecord:record,readReceipt:async()=>null,receiptOptions:()=>({})});
const release=()=>drivers.releaseBeforeTarget({deadline:Date.now()+90000});
if(fault==='safe'){
 await release();assert.equal(parent.cleanupConfirmed,true);assert.equal(operation.nodeApply.result.cleanup_complete,true);
 assert.equal(operation.nodeApply.result.configuration.status,'unknown');assert.equal(operation.nodeApply.result.execution.status,'unknown');
 const proof=await releaseNodeTarget({operation:parent,adapter,record,readReceipt:async()=>null,deadline:Date.now()+90000});
 assert.equal(proof.target_state,'not_created');assert.match(proof.warnings[0],/encoder.*remains/);assert.equal(proof.node,null);assert.equal(graph.nodes.length,1);
 assert.equal(events.filter(e=>e.phase==='rest_query_encoder_released').length,1);
 graph.nodes[0].label='foreign edit';
 await release();assert.equal(parent.preTargetGraph.nodes[0].label,'URL query encoding');
 await assert.rejects(releaseNodeTarget({operation:parent,adapter,record,readReceipt:async()=>null,deadline:Date.now()+90000}),/graph differs/);
}else{
 await assert.rejects(release());assert.equal(parent.cleanupConfirmed,false);assert.equal(parent.preTargetGraph,undefined);
 if(fault==='ack'){graph.nodes[0].label='foreign edit';await assert.rejects(release(),/graph changed/);
  assert.equal(parent.cleanupConfirmed,false);assert.equal(parent.preTargetGraph,undefined);}
}
assert.deepEqual(calls,fault==='done-unknown'?['Done']:['Done','source-read-refused']);
console.log(JSON.stringify({fault,status:'PASS',calls}));
