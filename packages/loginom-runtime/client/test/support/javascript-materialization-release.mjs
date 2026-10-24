// Browser adapter seams only: retain the real source admission, JS lifecycle,
// node phase ACKs, public job manager and release proof.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createHash} from 'node:crypto';
import {createRedactor} from '../../lib/redact.mjs';
const fault=process.argv[2]??'safe',events=[],calls=[];
const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'nav',label:'Scenario'}]};
const source='import {OutputTable} from "builtIn/Data";\n';
let wizard=false,stopped=false,operation,sourceAdapter;
const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[
 {ref:{...node,node_id:'input'},type:'imports.text',label:'Input',position:{x:64,y:64},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
let graphReads=0;
const snapshot=()=>({prepared_node_context:{...node,node_id:stopped&&fault==='owner'?'foreign':'js',verified:true,
 surface:wizard?'wizard':'graph',locked:stopped&&fault==='locked'},wizard:wizard?{status:'observed',root_ref:'wizard',root_tid:'W',
 stage:'input_mapping',owner_context:{status:'observed'}}:{status:'absent'},
 ui:{elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}],dialogs:stopped&&fault==='toast'?[{identity:{anchor_tid:'toast'}}]:[],masks:[]},
 node_outputs:{verified:true},node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,
 state_source:'cached_mapping_stores',settings_applied:false,package_saved:false,autosync:true,
 node_context:{...node,surface:'wizard',input_port:{direction:'input',port:0}},source_fields:[{name:'Key'}],target_fields:[{name:'Key'}]}});
const procedure=await import('../../lib/node-procedure.mjs');
mock.module(new URL('../../lib/node-procedure.mjs',import.meta.url),{namedExports:{...procedure,
 createNodeProcedure:()=>({openPort:async()=>{wizard=true;},observe:async({ready})=>{
  const s=snapshot();if(!ready(s))throw Error('Readiness refused');return s;},perform:async()=>{wizard=false;}})}});
const managed=await import('../../lib/javascript-managed-source-adapter.mjs');
mock.module(new URL('../../lib/javascript-managed-source-adapter.mjs',import.meta.url),{namedExports:{...managed,
 createJavascriptManagedSourceAdapter:()=>{
  let active=false;const a={open:async({owner})=>{active=true;return {owner,settings:{generation:true},schema:{}};},
   read:async handle=>({owner:handle.owner,settings:handle.settings,source}),replace:async()=>({draft_exact:true,source_sha256:createHash('sha256').update(source).digest('hex')}),
   commit:async()=>{calls.push('Done');active=false;return {owned_done_settled:true,graph_owner_verified:true};},
   discard:async handle=>{active=false;return {closed:true,owner:handle.owner};},
   get active(){return active||stopped&&fault==='opening';},get uncertain(){return stopped&&fault==='source-uncertain';}};
  sourceAdapter=a;return a;
 }}});
const execution=await import('../../lib/node-execution-procedure.mjs');
mock.module(new URL('../../lib/node-execution-procedure.mjs',import.meta.url),{namedExports:{...execution,
 createNodeExecutionProcedure:()=>({prepare:async()=>{calls.push('prepare');},launchGraph:async()=>{
  calls.push('Execute');return {verified:true,launch_gesture_verified:true,receipt:{status:'SUCCEEDED',cleanup_complete:true,
   operation_id:'apply-js:n31',action_key:'ui.act',action_revision:'1',output:{gesture_applied:true}}};},
  identify:async()=>{throw new procedure.NodeReadinessTimeout('prepared node available for process console');}})}});
const {createJavascriptCodeNodeSupport}=await import('../../lib/javascript-code-node.mjs');
const {createActionRuntime}=await import('../../lib/executor.mjs');
const support=createJavascriptCodeNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()});
const request={operation_id:'apply-js',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'programming.javascript',position:{x:320,y:280}},inputs:[{source:{...node,node_id:'input'},output:0,input:0}],
 mode:'script',parameters:{source_text:source,schema_mode:'code'},mappings:[],finish:'execute',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:60000,execute_ms:10000,total_ms:60000}};
const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
 nodeApplyHandlers:support.nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  operation=options.operation;return support.nodeApplyDriverFactory(options);},
 nodeTargetAdapterFactory:()=>({preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
  mutate:async e=>{if(e.kind==='create')graph.nodes.push({ref:node,type:'programming.javascript',label:'Parser',position:e.parameters.position,inputs:[0],outputs:[0]});
   else if(e.kind==='connect')graph.links.push(e.parameters.edge);else assert.fail('Unexpected graph mutation '+e.kind);
   return {status:'SUCCEEDED',cleanup_complete:true};},observe:async()=>{
  const g=structuredClone(graph);if(stopped&&fault==='graph'&&graphReads++)g.nodes[0].label='foreign edit';return g;},
  verifyWorkflow:async()=>({status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow})}),
 onRecord:async e=>{events.push(structuredClone(e));return stopped&&fault==='ack'&&e.phase==='node_operation_released'?{...e,result:null}:e;},
 execute:async code=>{
  assert.ok(code.includes('"receipt_read":true'),'Release must only read its settled receipt');
  return {status:'SUCCEEDED',action_key:'operation.receipt',action_revision:'1',operation_id:'apply-js',
   phase:'observed',effect_possible:false,error:null,trace:[],
   output:{state:fault==='receipt'?'pending':'completed',receipt:{status:'SUCCEEDED',action_key:'ui.act',action_revision:'1',
    operation_id:'apply-js:n31',phase:'completed',effect_possible:true,error:null,trace:[],output:{gesture_applied:true},cleanup_complete:fault!=='cleanup'}}};
 }});
runtime.startNodeApply(request);
const job=await runtime.waitNodeApply('apply-js',{timeoutMs:1000});
assert.equal(job.outcome.output.pending_phase,'materialization_start',JSON.stringify({job,events:events.filter(e=>e.phase.includes('refused'))}));
assert.equal(job.outcome.status,'AMBIGUOUS');
assert.equal(operation.nodeApply.phases.at(-1).phase,'node_finish');
assert.ok(sourceAdapter);stopped=true;
operation.lastReceipt={id:'apply-js:n31',signature:'signature',action_key:'ui.act',operation_id:'apply-js:n31'};
if(fault==='transport')operation.transportUncertain=true;
const before=JSON.stringify(calls);
if(fault==='transport')await assert.rejects(runtime.recover('apply-js',{strategy:'abandon_operation',recoveryOperationId:'release-js'}),/Release proof unavailable/);
else {
 const result=await runtime.recover('apply-js',{strategy:'abandon_operation',recoveryOperationId:'release-js'});
 if(fault==='safe'){
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
  const released=result.output.original_outcome.output;
  assert.equal(released.status,'FAILED');assert.equal(released.cleanup_complete,true);
  assert.equal(released.pending_phase,null);assert.equal(released.released_phase,'materialization_start');
  assert.equal(released.configuration.status,'unknown');assert.equal(released.execution.status,'unknown');
  assert.equal(released.package_saved,false);assert.equal(runtime.hasUnsettledWork(),false);runtime.assertPreparationAllowed();
  assert.deepEqual(await runtime.recover('apply-js',{strategy:'abandon_operation',recoveryOperationId:'release-js'}),result);
 }else {assert.equal(result.status,'AMBIGUOUS',JSON.stringify(result));assert.equal(runtime.hasUnsettledWork(),true);
  assert.equal(operation.nodeApply.pending.phase,'materialization_start');assert.equal(operation.nodeApply.result,undefined);}
}
assert.equal(JSON.stringify(calls),before,'Release must not repeat Done, source reads or Execute');
assert.deepEqual(calls,['Done','prepare','Execute']);
console.log(JSON.stringify({fault,status:'PASS',calls}));
