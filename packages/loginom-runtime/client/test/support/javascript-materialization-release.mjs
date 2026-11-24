// Browser adapter seams only: retain the real source admission, JS lifecycle,
// node phase ACKs, public job manager and release proof.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createHash} from 'node:crypto';
import {createRedactor} from '../../lib/redact.mjs';
const fault=process.argv[2]??'safe',events=[],calls=[];
const variableSource=fault==='declared-variable-source';
const guarded=fault.startsWith('effects-'),declared=fault.startsWith('declared-'),sourceExecution=['source-execute','source-reapply'].includes(fault)||declared||guarded,ledger=[];let executed=false,nativeActive=false,mappingDirection='input',executionCount=0;
const columns=[{name:'Key',label:'Key',type:'integer',data_kind:'Непрерывный',usage:'Не задано'}];
const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
const variables={...node,node_id:'variables'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'nav',label:'Scenario'}]};
const source=(fault.includes('late')?'/*'+'padding '.repeat(700)+'*/\n':'')
 +(guarded?'import "builtIn/'+(fault.includes('fetch')?'Fetch':'FS')+'";\n':declared&&!variableSource?'import * as fs from "builtIn/FS";\n':'')
 +(variableSource?'import {InputVariables,OutputTable} from "builtIn/Data";\nconst count=InputVariables.Items.Count.Value;\n':'import {OutputTable} from "builtIn/Data";\n');
const callback=Promise.withResolvers();
let wizard=false,stopped=false,operation,sourceAdapter;
const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[
 {ref:{...node,node_id:'input'},type:'imports.text',label:'Input',position:{x:64,y:64},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
let graphReads=0;
if(sourceExecution)graph.nodes=[];
if(variableSource)graph.nodes.push({ref:variables,type:'variables.user',label:'Scenario variables',
 position:{x:64,y:64},inputs:[],outputs:[],variable_outputs:[{kind:'variables',port:4}]});
if(guarded&&fault.includes('existing'))graph.nodes=[{ref:node,type:'programming.javascript',label:'Existing',position:{x:320,y:280},inputs:[0],outputs:[0]}];
const snapshot=()=>{const result={prepared_node_context:{...node,node_id:stopped&&fault==='owner'?'foreign':'js',verified:true,
 surface:wizard?'wizard':'graph',locked:stopped&&fault==='locked'},wizard:wizard?{status:'observed',root_ref:'wizard',root_tid:'W',
 stage:'input_mapping',owner_context:{status:'observed'}}:{status:'absent'},
 ui:{elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}],dialogs:stopped&&fault==='toast'?[{identity:{anchor_tid:'toast'}}]:[],masks:[]},
 node_outputs:{verified:true},node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,
 state_source:'cached_mapping_stores',settings_applied:false,package_saved:false,autosync:true,
 node_context:{...node,surface:'wizard',input_port:{direction:'input',port:0}},source_fields:[{name:'Key'}],target_fields:[{name:'Key'}]}};
 if(sourceExecution){
  const input=mappingDirection==='input',name=fault==='declared-stale-output'?'OldKey':'Key',field={index:0,name,label:name,type:'integer',data_kind:'Непрерывный',excluded:false};
  if(result.wizard.status==='observed')result.wizard.stage=mappingDirection+'_mapping';
  result.node_mapping={...result.node_mapping,mapping_wizard:input?'TuneDataSourceMappingWizard':'DataSetOutputSocketWizard',
   node_context:{...node,verified:true,surface:'wizard',[mappingDirection+'_port']:{direction:mappingDirection,port:0,port_guid:input?'in-port':'out-port'}},
   source_fields:input?[]:[field],target_fields:input?[]:[{...field,source:field}]};
 }
 return result;};
const procedure=await import('../../lib/node-procedure.mjs');
mock.module(new URL('../../lib/node-procedure.mjs',import.meta.url),{namedExports:{...procedure,
 createNodeProcedure:()=>({openPort:async direction=>{if(sourceExecution)calls.push('Mapping-'+direction);mappingDirection=direction;wizard=true;if(sourceExecution&&direction==='output')nativeActive=false;},observe:async({ready})=>{
  const s=snapshot();if(!ready(s))throw Error('Readiness refused');return s;},perform:async()=>{wizard=false;},
  readOutputPort:async()=>{
   if(!nativeActive)throw Error('Direct output read refused: inactive_output');
   return {output:{port:0,port_guid:'out-port',execution_id:'execution-'+executionCount,fresh:true,
    freshness_basis:'completed_execution_port_source',schema:[{index:0,name:'Key',label:'Key',type:'integer'}],
    row_count:0,sample_rows:0,sample_complete:true,sample:[],limitations:[],precision:{numbers_verified:true,limitations:[],strings:'native source text'}}};
  }})}});
const managed=await import('../../lib/javascript-managed-source-adapter.mjs');
mock.module(new URL('../../lib/javascript-managed-source-adapter.mjs',import.meta.url),{namedExports:{...managed,
 createJavascriptManagedSourceAdapter:()=>{
  let active=false;const a={open:async({owner})=>{active=true;if(sourceExecution&&executed){nativeActive=false;calls.push('Settings-after-Execute');}
   const schema=declared?{verified:true,inventory_complete:true,form:'JavaScriptColumnsWizard',page_tid:'page',
    node_context:{...owner,verified:true,surface:'wizard'},generation:{checked:false},grids:[
     {tid:'page;grdSourceColumns;tbl',count:0,total:0,fields:[]},
     {tid:'page;grdTargetColumns;tbl',count:1,total:1,fields:[{record_id:'declared-key',Index:0,Name:'Key',DisplayName:'Key',DataType:4,DataKind:1,
      UsageType:0,DefaultUsageType:0,Required:false,Broken:false}]}]}:sourceExecution?{verified:true,node_context:{...owner,verified:true,surface:'wizard'},generation:{checked:true},grids:[]}:{};
   return {owner,settings:declared?managed.javascriptManagedSourceSettings(schema):sourceExecution?{generation:true,grids:[]}:{generation:true},schema,
    ...(declared?{declaredColumns:[{...columns[0],index:0,usage_type:0,default_usage_type:0,required:false}]}:{})};},
   read:async handle=>({owner:handle.owner,settings:handle.settings,source}),replace:async()=>({draft_exact:true,source_sha256:createHash('sha256').update(source).digest('hex')}),
   commit:async()=>{calls.push('Done');active=false;return {owned_done_settled:true,graph_owner_verified:true};},
   discard:async handle=>{active=false;return {closed:true,owner:handle.owner};},
   get active(){return active||stopped&&fault==='opening';},get uncertain(){return stopped&&fault==='source-uncertain';}};
  sourceAdapter=a;return a;
 }}});
const execution=await import('../../lib/node-execution-procedure.mjs');
const fakeExecutionDriver=()=>({prepare:async()=>{calls.push('prepare');},launchGraph:async()=>{
  calls.push('Execute');if(sourceExecution){executionCount++;ledger.push('run');}return {verified:true,launch_gesture_verified:true,receipt:{status:'SUCCEEDED',cleanup_complete:true,
   operation_id:'apply-js:n31',action_key:'ui.act',action_revision:'1',output:{gesture_applied:true}}};},
  identify:async()=>{if(fault==='callback-active')await callback.promise;
   if(fault==='declared-execution-error'){const error=Error('LAB669 intentional execution failure');error.nodeExecutionFailure={code:'NODE_EXECUTION_FAILED',message:error.message};throw error;}
   if(sourceExecution){executed=true;nativeActive=true;return {node,execution_id:'execution-'+executionCount};}
   throw new procedure.NodeReadinessTimeout('prepared node available for process console');},
  waitCompleted:async()=>({verified:true,cleanup_complete:true,status:'completed',execution_id:'execution-'+executionCount,owner_verified:true})});
mock.module(new URL('../../lib/node-execution-procedure.mjs',import.meta.url),{namedExports:{...execution,createNodeExecutionProcedure:fakeExecutionDriver}});
const {createJavascriptCodeNodeSupport}=await import('../../lib/javascript-code-node.mjs');
const {createActionRuntime}=await import('../../lib/executor.mjs');
const support=createJavascriptCodeNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()});
const request={operation_id:'apply-js',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'programming.javascript',position:{x:320,y:280}},inputs:[{source:{...node,node_id:'input'},output:0,input:0}],
 mode:'script',parameters:{source_text:source,schema_mode:'code'},mappings:[],finish:'execute',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:60000,execute_ms:10000,total_ms:60000}};
if(fault==='callback-active')request.budgets={configure_ms:500,execute_ms:500,total_ms:500};
if(sourceExecution){request.inputs=[];request.parameters.input_state='unconnected';request.read.ports=[0];}
if(declared){request.parameters.schema_mode='declared';request.parameters.columns=columns;}
if(variableSource)request.variable_inputs=[{source:variables,output:4,input:0,kind:'variables'}];
if(['declared-done-downstream','declared-stale-output'].includes(fault))request.read.ports=[];
if(fault==='declared-done-downstream')request.finish='done';
if(guarded&&fault.includes('existing')){
 request.target={kind:'existing',type:'programming.javascript',ref:node};
 if(fault.includes('replace'))request.parameters.expected_source_sha256=createHash('sha256').update(source).digest('hex');
 else {delete request.parameters.source_text;delete request.parameters.schema_mode;}
}
const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
 nodeApplyHandlers:support.nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  operation=options.operation;return support.nodeApplyDriverFactory(options);},
 nodeTargetAdapterFactory:()=>({preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
  mutate:async e=>{if(guarded)calls.push('MUTATION');if(e.kind==='create')graph.nodes.push({ref:node,type:'programming.javascript',label:'Parser',position:e.parameters.position,inputs:[0],outputs:[0],
   ...(variableSource?{variable_inputs:[{kind:'variables',port:0}]}:{})});
   else if(e.kind==='connect'&&e.parameters.edge.kind==='variables'){
    graph.variable_links=[{...e.parameters.edge,source_port_guid:'count-output',target_port_guid:'js-variable-input'}];
   }else if(e.kind==='connect')graph.links.push(e.parameters.edge);else assert.fail('Unexpected graph mutation '+e.kind);
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
let job;
do{job=await runtime.waitNodeApply('apply-js',{timeoutMs:1000});}while(!job.outcome);
if(sourceExecution){
 if(fault==='declared-execution-error'){
  const result=job.outcome.output;assert.equal(result.cleanup_complete,true,JSON.stringify(result));
  assert.equal(result.pending_phase,null);assert.equal(result.status,'FAILED');assert.equal(result.error.code,'NODE_EXECUTION_FAILED');
  assert.match(result.error.message,/LAB669 intentional/);assert.ok(result.next_step);assert.equal(executionCount,1);
  assert.equal(runtime.hasUnsettledWork(),false);runtime.assertPreparationAllowed();
  console.log(JSON.stringify({outcome:result,calls,ledger}));process.exit(0);
 }
 if(guarded){
  assert.notEqual(job.outcome.status,'SUCCEEDED');assert.equal(executionCount,0);assert.ok(!calls.includes('MUTATION'));
  assert.ok(!calls.includes('Done'));assert.equal(job.outcome.output.error.code,'JAVASCRIPT_EFFECTS_REQUIRE_DECLARED_OUTPUT',JSON.stringify(job.outcome));
  assert.equal(job.outcome.output.cleanup_complete,true);assert.equal(job.outcome.output.pending_phase,null);
  assert.equal(job.outcome.output.next_step.tool,'dock_node_apply');assert.match(job.outcome.output.next_step.instruction,/declared/);
  assert.match(job.outcome.output.next_step.instruction,/done/);
  console.log(JSON.stringify({fault,status:'PASS',calls,ledger,outcome:job.outcome.output}));process.exit(0);
 }
 if(fault==='declared-stale-output'){
  assert.notEqual(job.outcome.status,'SUCCEEDED');assert.equal(executionCount,0,'Stale mapping must refuse before script effects');
  console.log(JSON.stringify({fault,status:'PASS',calls,ledger}));process.exit(0);
 }
 assert.equal(job.outcome.status,'SUCCEEDED',JSON.stringify(job.outcome));
 if(fault==='declared-done-downstream'){
  assert.equal(executionCount,0,'Done must not dispatch explicit Execute');
  assert.equal(job.outcome.output.execution.status,'not_requested');
  // Native dependency activation seam: an inactive upstream is evaluated once,
  // while another downstream read reuses that active upstream in the same graph.
  const downstream=async()=>{if(!nativeActive){const driver=fakeExecutionDriver();await driver.launchGraph();await driver.identify();}};
  await downstream();await downstream();assert.equal(executionCount,1);assert.deepEqual(ledger,['run']);
  console.log(JSON.stringify({fault,status:'PASS',calls,ledger}));process.exit(0);
 }
 const count=declared?1:2;
 assert.equal(calls.filter(c=>c==='Execute').length,count);
 assert.equal(job.outcome.output.execution.execution_id,'execution-'+count);
 if(declared)assert.equal(calls.at(-1),'Execute','No source/mapping wizard may reopen after the sole execution');
 assert.equal(job.outcome.output.configuration.readback.input_state,'unconnected');
 if(variableSource){
  const mapping=job.outcome.output.configuration.readback.input_mapping;
  assert.equal(mapping.no_incoming_links_verified,true);
  assert.deepEqual(mapping.fields,[]);
  assert.deepEqual(operation.targetPhase.result.variable_links,graph.variable_links);
 }
 if(['source-reapply','declared-reapply'].includes(fault)){
  const second={...request,operation_id:'reapply-js',target:{kind:'existing',type:'programming.javascript',ref:node},
   parameters:{...request.parameters,expected_source_sha256:createHash('sha256').update(source).digest('hex')}};
  delete second.parameters.columns;
  runtime.startNodeApply(second);
  let reapplied;
  do{reapplied=await runtime.waitNodeApply('reapply-js',{timeoutMs:1000});}while(!reapplied.outcome);
  assert.equal(reapplied.outcome.status,'SUCCEEDED',JSON.stringify(reapplied.outcome));
  assert.equal(reapplied.outcome.output.execution.execution_id,'execution-'+count*2);
  assert.equal(calls.filter(c=>c==='Execute').length,count*2);
 }
 console.log(JSON.stringify({fault,status:'PASS',calls,ledger,...(declared?{outcome:job.outcome.output}:{})}));
 process.exit(0);
}
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
callback.resolve();
if(fault==='callback-active'){
 await new Promise(setImmediate);
 const settled=await runtime.recover('apply-js',{strategy:'abandon_operation',recoveryOperationId:'release-settled'});
 assert.equal(settled.status,'SUCCEEDED',JSON.stringify(settled));
 assert.equal(runtime.hasUnsettledWork(),false);assert.equal(JSON.stringify(calls),before);
}
console.log(JSON.stringify({fault,status:'PASS',calls}));
