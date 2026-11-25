import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {managedJavascriptPreviewAdmission} from '../lib/javascript-output-preview.mjs';
import {preflightSortingSource,preflightTabularSource} from '../lib/sorting-preflight.mjs';
import {resolveSortingParameters} from '../lib/sorting-parameters.mjs';
import {createNodeReadDrivers} from '../lib/node-read-driver.mjs';
import {resolveCrossTableSchema} from '../lib/crosstable-schema.mjs';
import {buildNodeReadRequest,alignReadSchema,isUnchangedTextImportExecution,isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {applyNode,releaseNodeApply,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {dispatchNodeApi,nodeApiTools} from '../lib/node-api.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';
import {javascriptCodeReadback} from '../lib/javascript-code-node.mjs';
import {restRequestReadback} from '../lib/rest-request-node.mjs';
import {existingOutputExecution} from '../lib/node-execution-evidence.mjs';
import {observeStepwiseSourceFreshness} from '../lib/node-source-freshness.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const schema=[{index:0,name:'value',label:'Value',type:'real'}];
const source=()=>({parameters:{contract_revision:'1.0.0',target:{type:'transform.calculator',label:'Calculation'},workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]}},outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,execution:{status:'completed'},output:{ports:[{port:0,schema}]}}}});
const args={operation_id:'read',source_operation_id:'created',execution:'execute',read:{sample_rows:100,require_exact_numbers:true}};
test('output reading preserves the current execution unless Execute is explicitly requested',()=>{
 const current=buildNodeReadRequest({...args,execution:undefined},source());
 assert.equal(current.parameters.execution_policy,'existing');
 assert.equal(current.finish,'done');
 assert.equal(current.target.label,undefined,'A read must not restore an old caption');
 assert.equal(buildNodeReadRequest({...args,execution:'execute'},source()).parameters.execution_policy,'execute');
 assert.equal(buildNodeReadRequest({...args,execution:'execute'},source()).target.label,'Calculation');
});
const handlers=new Map([['transform.calculator',{revision:'1',modes:['expression'],validate(){throw Error('Configuration validation must not run');},configure(){throw Error('Configuration must not run');},configurationReadback(){throw Error('No configuration readback');}}]]);
for(const fault of [null,'cleanup','owner','transport','journal'])test('cancelled JavaScript reread releases only confirmed owned cleanup: '+fault,async()=>{
 const request=buildNodeReadRequest(args,source()),operation={id:'read'},controller=new AbortController(),calls=[];
 request.target.type='programming.javascript';request.parameters.javascript_source={source_sha256:'a'.repeat(64),source_utf8_bytes:1,source_lf_lines:1};
 const installed=new Map([['programming.javascript',handlers.get('transform.calculator')]]);
 const ok=value=>({verified:true,cleanup_complete:true,...value});
 const drivers={verifySource:async()=>ok({}),prepareTarget:async()=>ok({node}),
  finishGraph:async()=>{calls.push('execute');return ok({mode:'execute',execution_id:'fresh',settings_applied:false});},
  waitExecution:async()=>ok({execution_id:'fresh',status:'completed'}),
  readOutput:async()=>{calls.push('read');controller.abort(Error('Local node cancellation requested'));
   operation.transportUncertain=fault==='transport';throw controller.signal.reason;},
  releasePending:async(state,{signal}={})=>{assert.equal(signal?.aborted,undefined);calls.push('release');
   if(operation.transportUncertain)throw Error('Browser call uncertain');
   return {verified:true,cleanup_complete:fault!=='cleanup',node_context:fault==='owner'?{...node,node_id:'foreign'}:node,
    cleanup:{wizard_closed:false,read_view_restored:true,views_returned:true}};}};
 const record=async e=>{if(fault==='journal'&&e.phase==='node_operation_released')throw Error('ACK lost');return structuredClone(e);};
 const result=await applyNode({request,operation,handlers:installed,drivers,record,signal:controller.signal});
 if(fault){assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,false);assert.equal(operation.nodeApply.pending.phase,'read');return;}
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'NODE_READ_CANCELLED');
 assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);assert.equal(operation.nodeApply.pending,null);
 assert.equal(result.execution.status,'completed');assert.equal(result.execution.execution_id,'fresh');
 assert.deepEqual(calls,['execute','read','release']);assert.match(result.next_step.instruction,/source_operation_id:"created"/);
 assert.deepEqual(await applyNode({request,operation,handlers:installed,drivers,record}),result);
 assert.deepEqual(calls,['execute','read','release']);
});
test('JavaScript reread admits release only at read, preserving the finish refusal',()=>{
 const request=buildNodeReadRequest(args,source());request.target.type='programming.javascript';
 const driver=createNodeReadDrivers({operation:{id:'read',parameters:request}},{});
 assert.deepEqual(driver.releasePendingPhases,['read']);
 return assert.rejects(()=>driver.releasePending({pending:{phase:'finish'}}),/stopped output-read/);
});
function portReadFixture(request,output,snapshots,{admit,now=()=>1,sleep=setTimeout}={}){
 const calls=[];let tableActions=0,launches=0;
 const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh',process_id:'1.1',process_record_id:'child'};
 const table=()=>{tableActions++;throw Error('Reread must not open Table or wizards');};
 const channel={async readExistingProcesses(){return structuredClone(snapshots.length>1?snapshots.shift():snapshots[0]);},
  async readOutputPort(options){calls.push(options);return {output};},observe:table,perform:table};
 const create=vm.runInNewContext('('+createNodeReadDrivers.toString()+')',{
  createNodeProcedure:()=>channel,createNodeExecutionProcedure:()=>({async prepare(){},async waitCompleted(){return execution;}}),
  finishConfiguredGraph:async()=>{launches++;return {verified:true,cleanup_complete:true,execution_id:'fresh'};},
  need:(ok,message)=>{if(!ok)throw Error(message);},verified:value=>({verified:true,cleanup_complete:true,...value}),
  alignReadSchema,isUnchangedTextImportExecution,isUnchangedTransformExecution,resolveCrossTableSchema,openNewOutputTable:table,existingOutputExecution,setTimeout:sleep,
  createJavascriptSourceAdmission:({expectedSource})=>({admit:async()=>admit?admit(expectedSource):({intent:'preserve',effective_source:{...expectedSource,policy:'javascript-module-v1'},settings_sha256:'b'.repeat(64)})}),
  createJavascriptManagedSourceAdapter:()=>({}),withJavascriptSourcePolicyBoundary:(_,run)=>run(),
 });
 const operation={id:'read',parameters:request,nodeApply:{}};
 const driver=create({operation,now},{});
 const ctx={node:request.target.ref,document_id:request.document_id??'doc',workflow_ref:request.workflow_ref,execution:{execution_id:output?.execution_id??'fresh'},portExecution:{execution_id:'foreign-shell'},receipt_id:'read:target',deadline:2000};
 return {async run(){if(snapshots)await driver.beforeTarget(ctx);await driver.finishGraph(request.finish,ctx);await driver.waitExecution(ctx);return driver.readOutput(request.read,ctx);},calls,execution,
  driver,operation,ctx,get tableActions(){return tableActions;},get launches(){return launches;}};
}
function nativeExecution({running=false,active=true}={}){
 const progress_state={verified:true,source:'native_progress_record',state:running?'running':'completed'};
 return {verified:true,show_completed:true,inventory_complete:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},
  native_state:{active,running,locked:running},processes:[
   {process_id:'1',record_id:'group',parent_id:null,error:false,children_loaded:true,progress_state},
   {process_id:'1.1',record_id:'child',parent_id:'1',error:false,progress_state,
    owner:{verified:true,node_id:node.node_id,source:'native_process_model_identity'}}]};
}
test('source reuse is journaled only for the same completed active execution and exact port',async()=>{
 const execution_id='doc:root:1',port_guid='port0',operationId='next';
 const input={source:node,output:0,input:0};
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'new',type:'transform.sorting'},inputs:[input]};
 const history=[{sequence:1,request:{operation_id:'source',document_id:'doc',workflow_ref:request.workflow_ref},
  cleanup_confirmed:true,outcome:{status:'SUCCEEDED',cleanup_complete:true,operation_id:'source',output:{operation_id:'source',node,status:'SUCCEEDED',cleanup_complete:true,
   execution:{status:'completed',execution_id},output:{verified:true,execution_id,ports:[{port:0,port_guid,execution_id,fresh:true}]}}}}];
 const records=[],record=async e=>{records.push(e);return structuredClone(e);};
 const ports={verified:true,node_context:{...node,verified:true,surface:'graph'},ports:[{index:0,port_guid,active:true}]};
 const observe=async()=>({processes:nativeExecution(),ports});
 await observeStepwiseSourceFreshness({request,operationId,history,observe,record});
 assert.equal(records.at(-1).proof.status,'fresh');
 assert.equal(records.at(-1).proof.execution_id,execution_id);
 assert.equal(records.at(-1).proof.port_guid,port_guid);
 await observeStepwiseSourceFreshness({request,operationId,history,observe:async()=>({processes:nativeExecution({active:false}),ports}),record});
 assert.equal(records.at(-1).proof.status,'unverified');
 await observeStepwiseSourceFreshness({request,operationId,history,observe:async()=>({processes:nativeExecution(),ports:{...ports,ports:[{index:0,port_guid:'other',active:true}]}}),record});
 assert.equal(records.at(-1).proof.status,'unverified');
 const two={...history[0],sequence:2,request:{...history[0].request,target:{kind:'existing',ref:node}},outcome:{status:'FAILED'}};
 await observeStepwiseSourceFreshness({request,operationId,history:[...history,two],observe:()=>assert.fail('Older execution cannot prove freshness'),record});
 assert.equal(records.at(-1).proof.status,'unverified');
});
for(const running of [false,true])test('production current-output read '+(running?'waits for native completion':'preserves execution')+' without Execute or wizard',async()=>{
 const request=buildNodeReadRequest({...args,execution:undefined},source());
 const output={port:0,port_guid:'p',fresh:true,execution_id:'doc:root:1',schema,sample_complete:true};
 const snapshots=running?[nativeExecution({running:true}),nativeExecution()]:[nativeExecution()];
 const f=portReadFixture(request,output,snapshots),result=await f.run();
 assert.equal(result.execution_id,'doc:root:1');assert.equal(f.calls[0].execution.process_record_id,'child');
 assert.equal(f.launches,0);assert.equal(f.tableActions,0);
});
test('native current-output proof refuses stale, cancelled, missing and foreign process evidence',()=>{
 for(const change of [s=>s.native_state.active=false,s=>s.processes[1].owner.node_id='foreign',
  s=>s.processes[1].error=true,s=>s.processes[0].progress_state.state='cancelled',
  s=>s.processes[1].progress_state.verified=false,s=>s.root_id='',s=>s.node_context.node_id='foreign',
  s=>s.processes.push({...s.processes[1],process_id:'1.2',record_id:'duplicate'})]){
  const s=nativeExecution();change(s);assert.throws(()=>existingOutputExecution(s,node));
 }
});
for(const active of [true,false])test('production current-output lifecycle '+(active?'reads with Done':'settles stale refusal')+' without a launch',async()=>{
 const request=buildNodeReadRequest({...args,execution:undefined},source());
 const output={port:0,port_guid:'p',fresh:true,execution_id:'doc:root:1',schema,sample_complete:true};
 const f=portReadFixture(request,output,[nativeExecution({active})]);delete f.operation.nodeApply;
 const result=await applyNode({request,operation:f.operation,handlers,drivers:{...f.driver,
  prepareTarget:async(_,ctx)=>{await f.driver.beforeTarget(ctx);return {verified:true,cleanup_complete:true,node};}},
  record:async e=>structuredClone(e),now:()=>1});
 assert.equal(result.status,active?'SUCCEEDED':'FAILED',JSON.stringify(result));
 assert.equal(result.cleanup_complete,true);assert.equal(f.launches,0);assert.equal(f.tableActions,0);
 if(active){assert.equal(result.execution.execution_id,'doc:root:1');assert.equal(result.configuration.status,'not_requested');}
 else{assert.equal(result.pending_phase,null);assert.equal(result.error.code,'NODE_OUTPUT_NOT_FRESH');assert.match(result.next_step.instruction,/explicit request/);}
});
test('production reread uses its own completed execution and retained mapping without Table',async()=>{
 const request=buildNodeReadRequest(args,source());
 request.parameters.schemas[0].schema[0].data_kind='Непрерывный';
 const output={port:0,port_guid:'p',fresh:true,freshness_basis:'completed_execution_port_source',execution_id:'fresh',schema,
  row_count:0,sample_rows:0,sample_complete:true,sample:[],limitations:['zero_rows']};
 const f=portReadFixture(request,output),result=await f.run();
 assert.equal(f.calls[0].execution,f.execution);assert.equal(f.calls[0].port,0);
 assert.equal(result.ports[0].schema[0].data_kind,'Непрерывный');assert.equal(f.tableActions,0);
});
test('production sliding CrossTable reread resolves fresh categories from observed output schema',async()=>{
 const request=buildNodeReadRequest(args,source());request.target.type='transform.cross_table';
 const configuration={kind:'crosstable',category_mode:'sliding',row_keys:[{name:'Region',label:'Region',type:'string'}],
  column:{name:'Category',label:'Category',type:'string'},facts:[{name:'Amount',label:'Amount',type:'real',functions:['sum']}],
  options:{separator:'|',unique_names:true,limit:0,min_values:0}};
 request.parameters.cross_table_policy={kind:'crosstable_sliding',node,port_guid:'cross0',source_execution_id:'old',configuration};
 const columns=[{index:0,name:'Region',label:'Region',type:'string'},...['B','C'].map((name,index)=>({index:index+1,name,label:name,type:'real'}))];
 const output={port:0,port_guid:'cross0',fresh:true,freshness_basis:'completed_execution_port_source',execution_id:'fresh',schema:columns,
  row_count:0,sample_rows:0,sample_complete:true,sample:[],limitations:['zero_rows']};
 const f=portReadFixture(request,output),result=await f.run();
 assert.equal(f.calls[0].execution,f.execution);assert.notEqual(f.execution.execution_id,request.parameters.cross_table_policy.source_execution_id);
 assert.deepEqual(result.ports[0].category_fields,resolveCrossTableSchema(columns,configuration).category_fields);
 assert.equal(result.ports[0].port_guid,request.parameters.cross_table_policy.port_guid);assert.equal(f.tableActions,0);
 for(const change of [r=>r.parameters.cross_table_policy.source_execution_id='fresh',r=>r.parameters.cross_table_policy.port_guid='foreign',
  r=>r.parameters.cross_table_policy.node={...node,node_id:'foreign'}]){
  const changed=structuredClone(request);change(changed);await assert.rejects(()=>portReadFixture(changed,output).run(),/owner\/port differs/);
 }
});
test('production reread preserves NODE_READ_SCHEMA_CHANGED for changed name label and type',async()=>{
 const request=buildNodeReadRequest(args,source());
 for(const field of [{...schema[0],name:'Changed'},{...schema[0],label:'Changed'},{...schema[0],type:'string'}]){
  const output={port:0,port_guid:'p',schema:[field],sample_complete:true};
  await assert.rejects(()=>portReadFixture(request,output).run(),error=>error.code==='NODE_READ_SCHEMA_CHANGED'&&/NEW dock_node_apply/.test(error.message));
 }
});
test('read API accepts only local operation identity and bounded reading options',async()=>{
 const calls=[],runtime={tools:nodeApiTools,startNodeRead:a=>{calls.push(a);return a;}};
 await dispatchNodeApi(runtime,'dock_node_read',args);assert.deepEqual(calls,[args]);
 for(const patch of [{parameters:{}},{target:node},{finish:'done'},{read:{sample_rows:101}},{read:{coverage:'full'}},{source_operation_id:''}]){
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_read',{...args,...patch}));
 }
 assert.equal(calls.length,1);
});
test('unknown, failed, unsettled, file-only and absent-port sources refuse before execution',()=>{
 for(const mutate of [s=>s.outcome.status='FAILED',s=>s.outcome.cleanup_complete=false,s=>s.outcome.output.execution.status='pending',s=>s.parameters.target.type='exports.text',s=>s.outcome.output.output.ports=[]]){
  const s=source();mutate(s);assert.throws(()=>buildNodeReadRequest(args,s));
 }
 assert.throws(()=>buildNodeReadRequest(args,undefined));
 assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[1]}},source()));
 const s=source(),before=structuredClone(s),request=buildNodeReadRequest(args,s);
 validateNodeApplyRequest(request,handlers);assert.deepEqual(s,before);
 assert.deepEqual(request.inputs,[]);assert.deepEqual(request.mappings,[]);assert.equal(request.target.kind,'existing');
});
test('JavaScript output reread refuses until it can verify the effective source',()=>{
 const prior=source();prior.parameters.target.type='programming.javascript';
 assert.throws(()=>buildNodeReadRequest(args,prior),/source-bound admission/);
});
test('host reread allowance reaches every phase while full diagnostic defaults and explicit budgets remain unchanged',()=>{
 const s=source(),before=structuredClone(s),expanded=createUserWorkflowBindings().expandNodeRead(args);
 const request=buildNodeReadRequest(expanded,s);validateNodeApplyRequest(request,handlers);
 assert.deepEqual(request.budgets,{configure_ms:600000,execute_ms:600000,total_ms:600000});
 assert.deepEqual(request.read,{ports:[0],sample_rows:100,require_exact_numbers:true});
 assert.deepEqual(s,before);
 for(const budget of [undefined,60000]){
  const explicit=buildNodeReadRequest({...args,...(budget===undefined?{}:{budget_ms:budget})},s);
  assert.deepEqual(explicit.budgets,{configure_ms:budget??300000,execute_ms:budget??300000,total_ms:budget??300000});
 }
});
for(const expired of [false,true])test('read lifecycle skips configuration and never relaunches after retry or expiry '+expired,async()=>{
 const request=buildNodeReadRequest(createUserWorkflowBindings().expandNodeRead(args),source()),operation={id:'read'},calls=[];let time=1;
 const result=(phase,value={})=>async()=>{calls.push(phase);return {verified:true,cleanup_complete:true,effect_possible:false,...value};};
 const forbidden=()=>{throw Error('Wizard or mapping touched');};
 const drivers={verifySource:result('source'),prepareTarget:result('target',{node}),openWizard:forbidden,mapPorts:forbidden,finish:forbidden,
  finishGraph:result('finish',{mode:'execute',execution_id:'exec',settings_applied:false}),
  waitExecution:result('execute',{execution_id:'exec',status:'completed'}),
  readOutput:async(...params)=>{if(expired)time=600002;return result('read',{execution_id:'exec',status:'complete',evidence_ref:'read:output',ports:[{port:0,fresh:true}]})(...params);},verifyContinuation:async()=>false};
 const run=()=>applyNode({request,operation,handlers,drivers,record:async e=>structuredClone(e),now:()=>time});
 const out=await run();
 if(expired){
  assert.equal(out.status,'AMBIGUOUS');assert.match(out.error.message,/deadline/);
  await assert.rejects(run,/Explicit inspected resume is required/);
  assert.equal(operation.nodeApply.deadline,600001);assert.deepEqual(calls,['source','target','finish','execute','read']);return;
 }
 assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));assert.equal(out.configuration.status,'not_requested');
 assert.deepEqual(calls,['source','target','finish','execute','read']);assert.deepEqual(await run(),out);assert.equal(calls.length,5);
});
test('field reordering preserves identity while type, label, missing and repeated fields refuse',()=>{
 const fields=[...schema,{index:1,name:'key',label:'Key',type:'string'}];
 const reordered=[{...fields[1],index:0},{...fields[0],index:1}];assert.deepEqual(alignReadSchema(reordered,fields),reordered);
 for(const actual of [[...reordered,{...reordered[0],index:2}],[reordered[0]],reordered.map(f=>({...f,type:'boolean'})),reordered.map(f=>({...f,label:'Wrong'}))])assert.throws(()=>alignReadSchema(actual,fields));
});
test('a stale read names current fields and after verified cancellation requests a new successful node operation',async()=>{
 const request=buildNodeReadRequest(args,source()),operation={id:'read'},calls=[],events=[];
 const actual=[{index:0,name:'ProductRank',label:'Ранг товара',type:'real'}];
 const ok=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
 const drivers={verifySource:async()=>ok({}),prepareTarget:async()=>ok({node}),
  finishGraph:async()=>{calls.push('execute');return ok({mode:'execute',execution_id:'fresh',settings_applied:false});},
  waitExecution:async()=>ok({execution_id:'fresh',status:'completed'}),
  readOutput:async()=>{alignReadSchema(actual,schema);assert.fail('Stale schema must refuse');},
  releasePending:async()=>{calls.push('release');return {verified:true,cleanup_complete:true,node_context:node,
   cleanup:{wizard_closed:false,read_view_restored:true,views_returned:true}};}};
 const record=async event=>{events.push(structuredClone(event));return structuredClone(event);};
 const stopped=await applyNode({request,operation,handlers,drivers,record});
 assert.equal(stopped.status,'AMBIGUOUS');assert.equal(stopped.pending_phase,'read');assert.equal(stopped.cleanup_complete,false);
 assert.match(stopped.error.message,/Output field identity changed/);
 assert.match(stopped.error.message,/Observed field names: \["ProductRank"\]/);
 assert.match(stopped.error.message,/dock_node_cancel.*cleanup_complete:true/);
 assert.match(stopped.error.message,/NEW dock_node_apply.*SAME existing node.*finish:"execute"/);
 assert.match(stopped.error.message,/new SUCCEEDED operation with confirmed cleanup/);
 assert.ok(stopped.error.message.length<1000);assert.deepEqual(calls,['execute']);
 const released=await releaseNodeApply({operation,handlers,drivers,record});
 assert.equal(released.cleanup_complete,true);assert.equal(released.next_step.tool,'dock_node_apply');
 assert.match(released.next_step.instruction,/NEW operation_id.*"kind":"existing".*"node_id":"node"/);
 assert.match(released.next_step.instruction,/inputs:\[\].*complete intended settings.*finish:"execute"/);
 assert.doesNotMatch(released.next_step.instruction,/source_operation_id:"created"/);
 assert.deepEqual(calls,['execute','release']);assert.equal(operation.nodeApply.pending,null);
 assert.equal(events.at(-1).phase,'node_operation_released');
});
test('read refuses settings mutation and stale execution output without retrying browser effects',async()=>{
 for(const fault of ['settings','execution','output','lost_finish']){
  const request=buildNodeReadRequest(args,source()),operation={id:'read'},calls=[];
  const ok=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
  const drivers={verifySource:async()=>ok({}),prepareTarget:async()=>ok({node}),mapPorts:async()=>{throw Error('Forbidden');},openWizard:async()=>{throw Error('Forbidden');},finish:async()=>{throw Error('Forbidden');},
   finishGraph:async()=>{calls.push('finish');if(fault==='lost_finish')throw Error('Response lost');return ok({mode:'execute',execution_id:'fresh',settings_applied:fault==='settings'});},
   waitExecution:async()=>ok({execution_id:fault==='execution'?'stale':'fresh',status:'completed'}),
   readOutput:async()=>ok({execution_id:fault==='output'?'stale':'fresh',status:'complete',evidence_ref:'output',ports:[{port:0,fresh:true}]}),verifyContinuation:async()=>false};
  const run=()=>applyNode({request,operation,handlers,drivers,record:async e=>structuredClone(e)});
  const out=await run();assert.notEqual(out.status,'SUCCEEDED',fault);
  try{await run();}catch{}assert.equal(calls.length,1,fault);
 }
});
function unreadSource(){
 const s=source(),n=s.outcome.output;n.output.ports=[];
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'];
 n.phases=phases.map(phase=>({phase,receipt_id:'created:'+phase,status:'verified'}));
 n.configuration={status:'applied',readback:{scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
 receipt_ids:n.phases.map(p=>p.receipt_id),output_mapping:{port:0,autosync:false,fields:[
  {index:0,name:'hidden',label:'Hidden',type:'string',data_kind:'Дискретный',source_name:'hidden',excluded:true},
  {...schema[0],index:1,data_kind:'Непрерывный',source_name:'value',excluded:false}]}}};return s;
}
function restSource(){
 const s=source(),n=s.outcome.output;s.parameters.target.type='integration.rest_request';
 n.output.ports[0].port=1;
 n.phases=['configure','node_finish','output_mapping','finish','execute','read'].map(phase=>({phase,
  receipt_id:'created:'+phase,status:'verified',value:phase==='configure'
   ?{configuration:{verified:true,node_context:node,query_parameters:[]}}
   :phase==='node_finish'?{settings_applied:true,mode:'done',node_context:node}:{}}));
 n.configuration={status:'applied',readback:restRequestReadback({node:structuredClone(node),phases:n.phases,operation_id:'created'})};
 return s;
}
test('REST reread uses observed port schemas with the handler configuration and Done receipts',()=>{
 const s=restSource(),before=structuredClone(s),request=buildNodeReadRequest(args,s);
 assert.deepEqual(request.parameters.schemas,[{port:1,schema}]);assert.deepEqual(s,before);
 assert.deepEqual(s.outcome.output.configuration.readback.receipt_ids,['created:configure','created:node_finish']);
 assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[0],sample_rows:0}},s),/choose ports present/);
 const missing=restSource();missing.outcome.output.output.ports=[];
 assert.throws(()=>buildNodeReadRequest(args,missing),/no verified table output/);
});
for(const [name,mutate] of Object.entries({
 owner:s=>s.outcome.output.configuration.readback.node.node_id='foreign',
 foreignReceipt:s=>s.outcome.output.configuration.readback.receipt_ids[0]='foreign:configure',
 missingDone:s=>s.outcome.output.configuration.readback.receipt_ids.pop(),
 duplicateReceipt:s=>s.outcome.output.configuration.readback.receipt_ids.push('created:configure'),
 unverifiedPhase:s=>s.outcome.output.phases[0].status='pending',
 wrongType:s=>s.parameters.target.type='transform.calculator',
}))test('REST reread retains ownership and phase guards: '+name,()=>{
 const s=restSource();mutate(s);assert.throws(()=>buildNodeReadRequest(args,s));
});
test('first read uses verified local output mapping without a prior preview',()=>{
 const s=unreadSource(),before=structuredClone(s),r=buildNodeReadRequest(args,s);validateNodeApplyRequest(r,handlers);
 assert.deepEqual(r.parameters.schemas,[{port:0,schema:[{...schema[0],data_kind:'Непрерывный'}]}]);assert.deepEqual(s,before);
});
for(const [name,mutate] of Object.entries({
 owner:r=>r.node.node_id='other',document:r=>r.node.document_id='other',workflow:r=>r.node.workflow_id='other',
 scope:r=>r.scope='caller_provided',values:r=>r.values_are='requested_values',receipts:r=>r.receipt_ids[0]='foreign:configure',
 noFinish:r=>r.receipt_ids.pop(),noMapping:r=>r.receipt_ids.splice(3,1),duplicateReceipt:r=>r.receipt_ids.push(r.receipt_ids[0]),
 fieldOrder:r=>r.output_mapping.fields[1].index=0,fieldType:r=>delete r.output_mapping.fields[1].type,
 allExcluded:r=>r.output_mapping.fields[1].excluded=true,ambiguousExclusion:r=>r.output_mapping.fields[1].excluded='false',
 missingSource:r=>delete r.output_mapping.fields[1].source_name,
 duplicatePort:r=>r.output_mappings=[r.output_mapping,r.output_mapping],
 }))test('first read rejects untrusted retained mapping: '+name,()=>{
 const s=unreadSource();mutate(s.outcome.output.configuration.readback);assert.throws(()=>buildNodeReadRequest(args,s));
});
test('first read rejects unverified phases and never borrows a missing port',()=>{
 const s=unreadSource();s.outcome.output.phases[0].status='pending';assert.throws(()=>buildNodeReadRequest(args,s));
 assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[1]}},unreadSource()));
});

function javascriptSource({declaredOnly=false}={}){
 const s=source();s.parameters.target.type='programming.javascript';s.outcome.output.output.ports=[];
 const mapping={verified:true,source_identity_verified:true,autosync:true,target_fields:[
  {...schema[0],data_kind:'Непрерывный',excluded:false,source:{name:'Raw'}}]};
 const phases=['source','workflow','target','input_mapping','open','configure','node_finish','materialization_start',
  'materialization_execute','output_mapping','finish','execute','read'].map(phase=>({phase,receipt_id:'created:'+phase,
  status:'verified',effect_possible:true,value:phase==='node_finish'?{source_readback_verified:true,wizard_commit_verified:true,
   source_sha256:'a'.repeat(64),source_utf8_bytes:80,source_lf_lines:3}
   :phase==='output_mapping'||phase==='input_mapping'?{native_mapping:mapping}
   :phase==='materialization_execute'||phase==='execute'?{owner_verified:true,status:'completed',execution_id:phase}:{}}));
 if(declaredOnly){
  Object.assign(phases.find(p=>p.phase==='node_finish').value,{schema_mode:'declared',declared_columns:schema});
  phases.find(p=>p.phase==='input_mapping').value.native_mapping={verified:true,source_identity_verified:true,autosync:true,
   input_state:'unconnected',no_incoming_links_verified:true,source_fields:[],target_fields:[]};
  for(const name of ['materialization_start','materialization_execute'])Object.assign(phases.find(p=>p.phase===name),
   {status:'not_requested',effect_possible:false,value:{materialization_required:false,schema_mode:'declared'}});
 }
 s.outcome.output.phases=phases.map(({value,...phase})=>phase);
 s.outcome.output.configuration={status:'applied',readback:javascriptCodeReadback({node:structuredClone(node),phases})};return s;
}
test('declared JavaScript reads completed output without materialization receipts claiming an execution',()=>{
 const s=javascriptSource({declaredOnly:true});
 const request=buildNodeReadRequest({...args,execution:undefined},s);
 assert.equal(request.finish,'done');assert.equal(request.parameters.execution_policy,'existing');
 assert.equal(request.parameters.javascript_source.source_sha256,'a'.repeat(64));
 for(const mutate of [
  s=>s.outcome.output.configuration.readback.receipt_ids=s.outcome.output.configuration.readback.receipt_ids.filter(id=>id!=='created:materialization_start'),
  s=>s.outcome.output.configuration.readback.schema_mode='code',
  s=>s.outcome.output.phases.find(p=>p.phase==='materialization_start').status='verified',
  s=>s.outcome.output.phases.find(p=>p.phase==='materialization_execute').effect_possible=true,
  s=>s.outcome.output.phases.find(p=>p.phase==='execute').status='not_requested',
  s=>s.outcome.output.phases.find(p=>p.phase==='node_finish').status='not_requested']){
  const invalid=structuredClone(s);mutate(invalid);assert.throws(()=>buildNodeReadRequest(args,invalid));
 }
});
test('JavaScript reread is built from actual executed handler readback and never caller source',()=>{
 const s=javascriptSource(),before=structuredClone(s),request=buildNodeReadRequest(args,s);
 const support=new Map([['programming.javascript',{revision:'js',modes:['script'],configure(){throw Error('No configuration');}}]]);
 validateNodeApplyRequest(request,support);
 assert.deepEqual(request.parameters.javascript_source,{source_sha256:'a'.repeat(64),source_utf8_bytes:80,source_lf_lines:3});
 assert.deepEqual(request.parameters.schemas,[{port:0,schema:[{...schema[0],data_kind:'Непрерывный'}]}]);
 assert.deepEqual(s,before);s.outcome.output.configuration.readback.source.sha256='b'.repeat(64);
 assert.equal(request.parameters.javascript_source.source_sha256,'a'.repeat(64));
 for(const patch of [{source_text:'require("private")'},{javascript_source:request.parameters.javascript_source}])
  assert.throws(()=>validateNodeApplyRequest({...request,parameters:{...request.parameters,...patch,extra:true}},support));
});
test('JavaScript reread uses the retained physical mapping rather than an untrusted preview',()=>{
 const s=javascriptSource();s.outcome.output.output.ports=[{port:0,schema:[{...schema[0],name:'Wrong'}]}];
 const request=buildNodeReadRequest(args,s);assert.equal(request.parameters.schemas[0].schema[0].name,'value');
});
for(const [name,mutate] of Object.entries({
 kind:r=>r.kind='calculator',scope:r=>r.scope='observed_before_verified_finish',values:r=>r.values_are='requested_values',
 owner:r=>r.node.node_id='foreign',commit:r=>r.wizard_commit_verified=false,settings:r=>r.settings_preserved=false,
 execution:r=>r.execution_effects.explicit_execute_requested=false,internal:r=>r.execution_effects.internal_execution_started=false,
 missingDigest:r=>delete r.source.sha256,digest:r=>r.source.sha256='bad',bytes:r=>r.source.utf8_bytes=32769,
 lines:r=>r.source.lf_lines=1025,extraSource:r=>r.source.raw_text='secret',schema:r=>r.schema_mode='unknown',
 missingNodeFinish:r=>r.receipt_ids=r.receipt_ids.filter(id=>id!=='created:node_finish'),
 missingExecute:r=>r.receipt_ids=r.receipt_ids.filter(id=>id!=='created:execute'),
 missingMaterialization:r=>r.receipt_ids=r.receipt_ids.filter(id=>id!=='created:materialization_execute'),
 outputPort:r=>r.output_mapping.port=1,mapping:r=>delete r.output_mapping,
 }))test('JavaScript reread rejects untrusted source boundary: '+name,()=>{
 const s=javascriptSource();mutate(s.outcome.output.configuration.readback);assert.throws(()=>buildNodeReadRequest(args,s));
});
test('JavaScript declared readback and original verified phase identities remain mandatory',()=>{
 const s=javascriptSource();s.outcome.output.configuration.readback.schema_mode='declared';
 assert.equal(buildNodeReadRequest(args,s).target.type,'programming.javascript');
 s.outcome.output.phases.find(phase=>phase.phase==='node_finish').status='pending';
 assert.throws(()=>buildNodeReadRequest(args,s));
});

test('W1 variable-only reread retains its typed selection and still requests a real Execute',()=>{
 const s=source();s.outcome.output.execution.execution_id='old';s.outcome.output.output={ports:[],variable_ports:[{port:0,source:'execution',complete:true,execution_id:'old'}]};
 const r=buildNodeReadRequest({...args,read:{ports:[],variable_ports:[0]}},s);validateNodeApplyRequest(r,handlers);
 assert.equal(r.finish,'execute');assert.deepEqual(r.read.variable_ports,[0]);assert.deepEqual(r.parameters.schemas,[]);
 for(const mutate of [s=>s.outcome.output.output.variable_ports[0].execution_id='stale',s=>s.outcome.output.output.variable_ports[0].source='snapshot',s=>s.outcome.output.output.variable_ports[0].complete=false]){
  const invalid=structuredClone(s);mutate(invalid);assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[],variable_ports:[0]}},invalid));
 }
});

test('W1 builtin snapshot follows only confirmed same-document Save continuations without rewriting its source',()=>{
 const s=source();s.parameters.target.type='variables.user';s.outcome.output.execution={status:'not_requested',execution_id:null};s.outcome.output.output={ports:[]};
 const original=structuredClone(s),old=s.parameters.workflow_ref,next={...old,navigation_path:[{tid:'saved',label:'Saved'}]};
 const save={action:{action_key:'package.save_checkpoint'},outcome:{action_key:'package.save_checkpoint',status:'SUCCEEDED',cleanup_complete:true,
  output:{save_completed:true,workflow_preserved:true,reopened:false,workflow_continuations:[{document_id:'doc',previous_workflow_ref:old,workflow_ref:next}]}}};
 const r=buildNodeReadRequest({operation_id:'snapshot',source_operation_id:'values'},s,{saves:[save]});
 assert.equal(r.finish,'done');assert.deepEqual(r.read.variable_ports,[4]);assert.deepEqual(r.workflow_ref,next);assert.deepEqual(s,original);
 for(const change of [v=>v.outcome.status='FAILED',v=>v.outcome.output.reopened=true,v=>v.outcome.output.workflow_continuations[0].document_id='foreign',v=>v.outcome.output.workflow_continuations[0].workflow_ref.prefix='MF;TF-2']){
  const invalid=structuredClone(save);change(invalid);assert.deepEqual(buildNodeReadRequest({operation_id:'snapshot',source_operation_id:'values'},s,{saves:[invalid]}).workflow_ref,old);
 }
 assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[0]}},s));
});

// The downstream consumer receives the production driver's output, not a
// hand-written javascript_source field as in the older rereadFixture.
for(const sourcePreview of [true,false])test('production existing JS read admits Sorting '+(sourcePreview?'with':'without')+' original preview',async()=>{
 const history=JSON.parse(readFileSync(new URL('./fixtures/javascript-preflight-source.json',import.meta.url),'utf8'));
 const captured=structuredClone(history.outcome.output.output.ports[0]);
 if(!sourcePreview){history.request.read={ports:[],sample_rows:0,require_exact_numbers:false};history.outcome.output.output={status:'not_requested',evidence_ref:null,ports:[]};}
 const request=buildNodeReadRequest({operation_id:'read',source_operation_id:history.request.operation_id},
  {parameters:history.request,outcome:history.outcome});
 const target=request.target.ref,execution=history.outcome.output.execution.execution_id;
 const output={...captured,schema:request.parameters.schemas[0].schema,execution_id:execution};
 const snap=nativeExecution(),[,rootId,groupId]=execution.split(':');
 snap.root_id=rootId;snap.processes[0].process_id=groupId;snap.processes[1].process_id=groupId+'.1';snap.processes[1].parent_id=groupId;
 snap.node_context={...target,verified:true,surface:'graph'};snap.processes[1].owner.node_id=target.node_id;
 let admissions=0;
 const f=portReadFixture(request,output,[snap],{admit:async expected=>{admissions++;assert.deepEqual(expected,request.parameters.javascript_source);
  return {intent:'preserve',effective_source:{...expected,policy:'javascript-module-v1'},settings_sha256:'b'.repeat(64)};}});
 delete f.operation.nodeApply;
 const result=await applyNode({request,operation:f.operation,handlers:new Map([['programming.javascript',{revision:'1',modes:['script']}]]),
  drivers:{...f.driver,activateWorkflow:async()=>({verified:true,cleanup_complete:true}),prepareTarget:async(_,ctx)=>{await f.driver.beforeTarget(ctx);return {verified:true,cleanup_complete:true,node:target};}},
  record:async e=>structuredClone(e),now:()=>1});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 const outcome={...history.outcome,operation_id:'read',output:result};
 const binding={node:target,document_id:target.document_id,workflow_ref:request.workflow_ref};
 const port={index:0,native_index:0,active:true,port_guid:output.port_guid};
 const proof=managedJavascriptPreviewAdmission([history,{sequence:history.sequence+1,request,outcome,cleanup_confirmed:true}],binding,port);
 assert.equal(result.output.javascript_source,undefined);
 assert.equal(proof.source_operation_id,history.request.operation_id);assert.equal(proof.execution_id,execution);
 const state={prepared_node_context:{...target,surface:'graph',tid:'js'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{...port,tid:'js-port'}]},
  ui:{elements:[{tid:'js-port',signature:{native_graph:{status:'script',icon:'bg-vendor-icon-javascript'}}}]}};
 const preflight=vm.runInNewContext('('+preflightSortingSource.toString()+')',{
  preflightTabularSource:vm.runInNewContext('('+preflightTabularSource.toString()+')',{
   need:(ok,message)=>{if(!ok)throw Error(message);},createNodeProcedure:()=>({observe:async()=>state}),
   managedJavascriptPreviewAdmission,alignReadSchema,makeJavascriptManagedSelectionReadCode:()=>'',
   openNodeSchemaPreview:async()=>({node_preview_schema:{fields:output.schema,inventory_complete:true,node_id:target.node_id,port:0}}),
   closeNodeSchemaPreview:async()=>state,
  }),resolveSortingParameters,
 });
 const admitted=await preflight({operation:{id:'sort',deadline:Date.now()+5000,parameters:{document_id:target.document_id,workflow_ref:request.workflow_ref,
  target:{kind:'new'},inputs:[{source:target,input:0,output:0}],mappings:[],parameters:{keys:[{field:{kind:'input_field',name:output.schema[0].name},direction:'ASC'}]}}},
  nodeHistory:()=>[history,{sequence:history.sequence+1,request,outcome,cleanup_confirmed:true}],execute:async()=>({ready:true,node_tid:'js'}),onRecord:async e=>e}, {}, {});
 assert.equal(admitted.verified,true);assert.equal(admitted.parameters_valid,true);
 assert.equal(admitted.managed_javascript_source.source_operation_id,history.request.operation_id);

 assert.equal(admissions,0,'Source wizard must not deactivate the existing output');assert.equal(f.launches,0);
 const failed={sequence:history.sequence+1,request:structuredClone(request),outcome:{status:'FAILED',cleanup_complete:true},cleanup_confirmed:true};
 const retry={sequence:history.sequence+2,request,outcome,cleanup_confirmed:true};
 assert.equal(managedJavascriptPreviewAdmission([history,failed,retry],binding,port).source_operation_id,history.request.operation_id);
 for(const change of [item=>item.cleanup_confirmed=false,item=>item.outcome.output.execution.execution_id='other',item=>item.outcome.output.node.node_id='foreign']){
  const reread={sequence:history.sequence+1,request:structuredClone(request),outcome:structuredClone(outcome),cleanup_confirmed:true};change(reread);
  assert.throws(()=>managedJavascriptPreviewAdmission([history,reread],binding,port));
 }
});
for(const reason of ['console_store','process_root','console_not_ready'])test('existing read polls temporary '+reason+' before native completion',async()=>{
 const request=buildNodeReadRequest({...args,execution:undefined},source());
 const f=portReadFixture(request,{ports:[],execution_id:'doc:root:1',schema,port:0,sample_complete:true},[{verified:false,reason},nativeExecution()]);
 await f.run();assert.equal(f.launches,0);
});
for(const state of ['pending','running','locked','no-record','temporary','temporary-only','pinned-change','pinned-record'])test('existing wait lifecycle settles '+state+' without Execute',async()=>{
 let clock=1;
 const request=buildNodeReadRequest({...args,execution:undefined},source());request.budgets={configure_ms:4000,execute_ms:4000,total_ms:4000};
 const first=nativeExecution({running:true});
 if(state==='running')first.processes.forEach(p=>p.progress_state.state='completed');
 if(state==='locked'){first.native_state.running=false;first.processes.forEach(p=>p.progress_state.state='completed');}
 if(state==='no-record')first.processes=[];
 if(state==='temporary-only'){Object.assign(first,{verified:false,reason:'process_root'});}
 const second=state==='temporary'?{verified:false,reason:'console_store'}:structuredClone(first);
 if(state==='pinned-change'){second.root_id='new-root';}
 if(state==='pinned-record'){second.processes[1].record_id='new-child';}
 const f=portReadFixture(request,{},[first,second],{now:()=>clock,sleep:resolve=>{clock+=1000;resolve();}});delete f.operation.nodeApply;
 const result=await applyNode({request,operation:f.operation,handlers,drivers:{...f.driver,
  prepareTarget:async(_,ctx)=>{await f.driver.beforeTarget(ctx);return {verified:true,cleanup_complete:true,node};}},record:async e=>structuredClone(e),now:()=>clock});
 assert.equal(result.status,'FAILED',JSON.stringify(result));assert.equal(result.cleanup_complete,true);assert.equal(f.launches,0);
 assert.equal(result.error.code,state.startsWith('pinned-')?'NODE_OUTPUT_NOT_FRESH':'NODE_EXECUTION_RUNNING');
 if(!state.startsWith('pinned-')){
  assert.equal(result.execution.waited_ms,4000,JSON.stringify(result));assert.equal(result.next_step.tool,'dock_node_read');
  assert.doesNotMatch(result.next_step.instruction,/execution:"execute"|ask whether/i);
 }
});

test('existing read refusal supports a source receipt without an ID',async()=>{
 const request=buildNodeReadRequest({...args,execution:undefined},source());
 const f=portReadFixture(request,{},[nativeExecution({active:false})]);
 await assert.rejects(()=>f.driver.beforeTarget({...f.ctx,receipt_id:undefined}),error=>error.code==='NODE_OUTPUT_NOT_FRESH'&&error.nodePhaseRefusal.phase==='source');
});
