import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeReadDrivers} from '../lib/node-read-driver.mjs';
import {resolveCrossTableSchema} from '../lib/crosstable-schema.mjs';
import {buildNodeReadRequest,alignReadSchema} from '../lib/node-read-contract.mjs';
import {applyNode,releaseNodeApply,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {dispatchNodeApi,nodeApiTools} from '../lib/node-api.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';
import {javascriptCodeReadback} from '../lib/javascript-code-node.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const schema=[{index:0,name:'value',label:'Value',type:'real'}];
const source=()=>({parameters:{contract_revision:'1.0.0',target:{type:'transform.calculator',label:'Calculation'},workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]}},outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,execution:{status:'completed'},output:{ports:[{port:0,schema}]}}}});
const args={operation_id:'read',source_operation_id:'created',read:{sample_rows:100,require_exact_numbers:true}};
const handlers=new Map([['transform.calculator',{revision:'1',modes:['expression'],validate(){throw Error('Configuration validation must not run');},configure(){throw Error('Configuration must not run');},configurationReadback(){throw Error('No configuration readback');}}]]);
function portReadFixture(request,output){
 const calls=[];let tableActions=0;
 const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh',process_id:'1.1',process_record_id:'child'};
 const table=()=>{tableActions++;throw Error('Reread must not open Table or wizards');};
 const channel={async readOutputPort(options){calls.push(options);return {output};},observe:table,perform:table};
 const create=vm.runInNewContext('('+createNodeReadDrivers.toString()+')',{
  createNodeProcedure:()=>channel,createNodeExecutionProcedure:()=>({async prepare(){},async waitCompleted(){return execution;}}),
  finishConfiguredGraph:async()=>({verified:true,cleanup_complete:true,execution_id:'fresh'}),
  need:(ok,message)=>{if(!ok)throw Error(message);},verified:value=>({verified:true,cleanup_complete:true,...value}),
  alignReadSchema,resolveCrossTableSchema,openNewOutputTable:table,
 });
 const driver=create({operation:{id:'read',parameters:request},now:()=>1},{});
 const ctx={node,execution:{execution_id:'fresh'},portExecution:{execution_id:'foreign-shell'},receipt_id:'read',deadline:1000};
 return {async run(){await driver.finishGraph('execute',ctx);await driver.waitExecution(ctx);return driver.readOutput(request.read,ctx);},calls,execution,get tableActions(){return tableActions;}};
}
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
 assert.deepEqual(request.budgets,{configure_ms:300000,execute_ms:300000,total_ms:300000});
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
  readOutput:async(...params)=>{if(expired)time=300002;return result('read',{execution_id:'exec',status:'complete',evidence_ref:'read:output',ports:[{port:0,fresh:true}]})(...params);},verifyContinuation:async()=>false};
 const run=()=>applyNode({request,operation,handlers,drivers,record:async e=>structuredClone(e),now:()=>time});
 const out=await run();
 if(expired){
  assert.equal(out.status,'AMBIGUOUS');assert.match(out.error.message,/deadline/);
  await assert.rejects(run,/Explicit inspected resume is required/);
  assert.equal(operation.nodeApply.deadline,300001);assert.deepEqual(calls,['source','target','finish','execute','read']);return;
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

function javascriptSource(){
 const s=source();s.parameters.target.type='programming.javascript';s.outcome.output.output.ports=[];
 const mapping={verified:true,source_identity_verified:true,autosync:true,target_fields:[
  {...schema[0],data_kind:'Непрерывный',excluded:false,source:{name:'Raw'}}]};
 const phases=['source','workflow','target','input_mapping','open','configure','node_finish','materialization_start',
  'materialization_execute','output_mapping','finish','execute','read'].map(phase=>({phase,receipt_id:'created:'+phase,
  status:'verified',effect_possible:true,value:phase==='node_finish'?{source_readback_verified:true,wizard_commit_verified:true,
   source_sha256:'a'.repeat(64),source_utf8_bytes:80,source_lf_lines:3}
   :phase==='output_mapping'||phase==='input_mapping'?{native_mapping:mapping}
   :phase==='materialization_execute'||phase==='execute'?{owner_verified:true,status:'completed',execution_id:phase}:{}}));
 s.outcome.output.phases=phases.map(({value,...phase})=>phase);
 s.outcome.output.configuration={status:'applied',readback:javascriptCodeReadback({node:structuredClone(node),phases})};return s;
}
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
