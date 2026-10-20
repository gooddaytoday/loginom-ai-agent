import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {releaseNodeApply} from '../lib/node-apply.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {actions} from './support/executor-fixture.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'export'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
 navigation_path:[{tid:'path',label:'Scenario'}]};
const phases=['input_mapping','open','configure','output_mapping','finish','execute'];
const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);

function fixture(phase='configure',fault,{wizard=true,executionStatus='pending',confirmation=false,wizardStage='text_export_params'}={}) {
 let open=wizard,question=false,action,graphReads=0,clock=Date.now();const gestures=[],events=[];
 const request={operation_id:'apply-export',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'exports.text',ref:node},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const operation={id:'apply-export',action:{action_key:'node.apply',revision:'1'},parameters:request,deadline:1,
  transportUncertain:fault==='transport',lastReceipt:{id:'apply-export:n1'},
  nodeApply:{request,node,pending:{phase,deadline:1},phases:[],signature:'signature',deadline:1,
   execution:{status:executionStatus,execution_id:'original-exec'},output:{status:'not_refreshed',evidence_ref:null,ports:[]}},
  nodeTargetAdapter:{observe:async()=>{
   graphReads++;
   return {complete:fault!=='incomplete',document_id:fault==='document'?'other':'doc',workflow_ref:workflow,
    nodes:fault==='missing'?[]:[{ref:node,type:'exports.text',label:'Export',position:{x:320+(fault==='graph'&&graphReads>1?8:0),y:280},inputs:[0],outputs:[]}],
    links:fault==='links'&&graphReads>1?[{source:'changed'}]:[],foreign_links:[]};
  }}};
 const snapshot=()=>({origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,node_id:fault==='foreign'?'other':'export',verified:true,surface:open?'wizard':'graph',locked:open||fault==='locked',
   ...(open&&phase==='input_mapping'?{input_port:{direction:'input',port:0,native_index:0,port_guid:'input',opening_operation_id:'apply-export:n1'}}:{})},
  wizard:open?{status:'observed',root_ref:'ui-w',root_tid:'W',stage:phase==='input_mapping'?'input_mapping':wizardStage,owner_context:{status:'observed',node:{tid:'owner'}}}:{status:'absent'},
  ui:{elements:question?['yes','no'].map(name=>({tid:'msgbox;tlb;'+name,ref:'ui-'+name,label:name==='yes'?'Да':'Нет',signature:{dialog_ref:'ui-question'},allowed_actions:name==='yes'?['click','confirm_wizard_close']:['click']}))
    :open?[{tid:'W;btnClose',ref:'ui-close',allowed_actions:['click']}]:[],
   dialogs:question?[{ref:'ui-question',title:'Подтвердить',text:'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'}]:fault==='dialog'?[{ref:'ui-other-dialog'}]:[],
   masks:fault==='mask'?[{ref:'ui-other-mask'}]:[],truncated:{elements:false,dialogs:false,masks:false}}});
 const record=async e=>{events.push(e);if(e.phase==='node_step_prepared')action=e;
  return fault==='journal'&&e.phase==='node_operation_released'?null:structuredClone(e);};
 const support=createCandidateNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
 const drivers=support.nodeApplyDriverFactory({operation,onRecord:record,
  now:()=>clock+=['locked','dialog','mask'].includes(fault)?5000:0,
  receiptOptions:(id,key,signature)=>({id,action_key:key,signature}),
  readReceipt:async()=>fault==='receipt'?{state:'pending'}:{state:'completed',receipt:{cleanup_complete:fault!=='cleanup'}},
  execute:async()=>{
   if(!action)return {status:'SUCCEEDED',output:snapshot()};
   const current=action;action=null;gestures.push(current.action);
   if(fault==='lost')throw Error('Lost Close reply');
   if(question){
    assert.deepEqual(current.action,{verb:'confirm_wizard_close',ref:'ui-yes'});
    if(fault==='lost_confirmation')throw Error('Lost confirmation reply');
    question=false;open=false;
   }else{
    assert.deepEqual(current.action,{verb:'click',ref:'ui-close'});
    if(confirmation)question=true;else open=false;
   }
   return {status:'SUCCEEDED',operation_id:current.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:snapshot()};
  }});
 return {operation,drivers,gestures,events,run:signal=>releaseNodeApply({operation,handlers:support.nodeApplyHandlers,drivers,record,signal})};
}

for(const phase of phases)test('text export releases stopped '+phase+' with own Close and unknown export state',async()=>{
 const f=fixture(phase),r=await f.run();
 assert.equal(r.checkpoint_kind,'local_node_released');assert.equal(r.cleanup_complete,true);assert.equal(r.pending_phase,null);
 assert.deepEqual(r.configuration,{status:'unknown'});assert.deepEqual(r.execution,{status:'unknown',execution_id:'original-exec'});
 assert.equal(r.package_saved,false);assert.equal(r.persisted_package_verified,false);
 assert.deepEqual(r.output,{status:'not_refreshed',evidence_ref:null,ports:[]});
 const checked=validate(r);assert.equal(checked.valid,true,checked.errorMessage);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'ui-close'}]);assert.equal(f.operation.nodeApply.pending,null);
 assert.ok(f.events.some(e=>e.phase==='node_operation_released'&&e.receipt.proof.cleanup.wizard_closed));
 assert.deepEqual(f.drivers.releasePendingPhases,phases);
 assert.equal(f.operation.nodeApply.deadline,1);assert.equal(f.events.find(e=>e.phase==='node_operation_released').receipt.deadline,1);
 assert.equal(r.next_step.tool,'dock_action_run');assert.match(r.next_step.instruction,/package.save_checkpoint/);
 assert.match(r.next_step.instruction,/Do not[\s\S]*repeat[\s\S]*export/);
});

test('release of an export already back on its graph never opens or commits a wizard',async()=>{
 const f=fixture('execute',undefined,{wizard:false}),r=await f.run();
 assert.deepEqual(f.gestures,[]);assert.equal(r.configuration.status,'unknown');assert.equal(r.execution.status,'unknown');
});
test('export page cancellation confirms only the exact owned Close question',async()=>{
 for(const wizardStage of ['text_export_params','text_export_format','done']){
  const f=fixture('configure',undefined,{confirmation:true,wizardStage}),r=await f.run();
  assert.equal(r.configuration.status,'unknown');assert.deepEqual(f.gestures,[{verb:'click',ref:'ui-close'},{verb:'confirm_wizard_close',ref:'ui-yes'}]);
 }
});
test('a lost export Close confirmation retains uncertainty without replay',async()=>{
 const f=fixture('configure','lost_confirmation',{confirmation:true});await assert.rejects(f.run());
 assert.equal(f.operation.transportUncertain,true);assert.equal(f.operation.nodeApply.pending.phase,'configure');
 assert.equal(f.gestures.length,2);
});
test('verified finish or previous execution cannot promote an unverified export release',async()=>{
 for(const status of ['pending','completed','failed','cancelled']){
  const f=fixture('execute',undefined,{wizard:false,executionStatus:status});
  f.operation.nodeApply.phases.push({phase:'finish',status:'verified',receipt_id:'apply-export:finish',value:{}});
  const r=await f.run();assert.deepEqual(r.configuration,{status:'unknown'});assert.equal(r.execution.status,'unknown');
 }
});
for(const fault of ['foreign','graph','links','document','incomplete','missing','transport','receipt','cleanup','lost','journal'])
 test('text export release refuses '+fault+' and retains the pending operation',async()=>{
  const f=fixture('configure',fault);await assert.rejects(f.run());
  assert.equal(f.operation.nodeApply.pending.phase,'configure');assert.equal(f.operation.nodeApply.result,undefined);
  assert.ok(f.gestures.every(g=>g.verb==='click'&&g.ref==='ui-close'));
  if(['foreign','transport','receipt','cleanup'].includes(fault))assert.deepEqual(f.gestures,[]);
  if(fault==='lost'){assert.equal(f.gestures.length,1);assert.equal(f.operation.transportUncertain,true);}
 });
for(const fault of ['locked','dialog','mask'])test('text export release cannot clean a running or blocked graph: '+fault,async()=>{
 const f=fixture('execute',fault,{wizard:false});await assert.rejects(f.run());
 assert.deepEqual(f.gestures,[]);assert.equal(f.operation.nodeApply.pending.phase,'execute');
});
test('download, target and unrelated phases are not admitted to export release',async()=>{
 for(const phase of ['source','workflow','target','read','node_finish','materialization_execute']){
  const f=fixture(phase);await assert.rejects(f.run(),/stopped text export phase/);
  assert.deepEqual(f.gestures,[]);assert.equal(f.operation.deadline,1);
 }
});
test('text export release checks cancellation before observing or closing',async()=>{
 const f=fixture(),c=new AbortController();c.abort(Error('release cancelled'));
 await assert.rejects(f.run(c.signal),/release cancelled/);assert.deepEqual(f.gestures,[]);assert.equal(f.operation.deadline,1);
});

async function stoppedRuntime(phase,{browserRecovery=false,blocked=false}={}) {
 const calls=[],events=[];
 const state={blocked};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{
  ref:node,type:'exports.text',label:'Export',position:{x:320,y:280},inputs:[0],outputs:[]}],links:[],foreign_links:[]};
 const support=createCandidateNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
 const snapshot={origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,verified:true,surface:'graph',locked:false},wizard:{status:'absent'},
  ui:{elements:[],dialogs:[],masks:[],truncated:{elements:false,dialogs:false,masks:false}}};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});
 const stop=name=>{calls.push(name);if(name===phase)throw Error('Stopped export '+phase);};
 const runtime=createActionRuntime({pinned:{actions,selectors:new Map(),pins:{}},allowCandidate:true,browserRecovery,
  targetOrigin:'http://test',targetBuild:'7.4.2',onRecord:async e=>{events.push(e);return e;},
  execute:async()=>{
   if(state.blocked)throw Error('Blocking dialog');
   return {status:'SUCCEEDED',output:{value:{status:'SUCCEEDED',output:structuredClone(snapshot)}}};
  },
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,positionMatches:()=>true}),
  nodeApplyHandlers:support.nodeApplyHandlers,nodeApplyDriverFactory:options=>({
   ...support.nodeApplyDriverFactory(options),verifySource:ok,mapPorts:ok,openWizard:ok,
   configureExport:async()=>{stop('configure');return ok();},
   finish:async mode=>({verified:true,cleanup_complete:true,mode,execution_id:'exec',execution_started:true}),
   waitExecution:async()=>{stop('execute');return {verified:true,cleanup_complete:true,status:'completed',execution_id:'exec'};},
   readOutput:async()=>{stop('read');throw Error('No downloaded file');},
  })});
 runtime.startNodeApply({operation_id:'apply-export',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'exports.text',ref:node},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
 const job=await runtime.waitNodeApply('apply-export',{timeoutMs:1000});
 assert.equal(job.outcome.output.pending_phase,phase,JSON.stringify(job));
 return {runtime,calls,events,state};
}
for(const phase of ['configure','execute'])test('public export '+phase+' refusal offers abandon and settles without repeating the phase',async()=>{
 const f=await stoppedRuntime(phase),advice=(await f.runtime.inspect({operationId:'apply-export'})).output;
 assert.deepEqual(advice.recovery_options,['abandon_operation']);
 const released=await f.runtime.recover('apply-export',{strategy:'abandon_operation',recoveryOperationId:'release-export'});
 assert.equal(released.status,'SUCCEEDED',JSON.stringify(released));const result=released.output.original_outcome;
 assert.equal(result.status,'FAILED');assert.equal(result.phase,'node_released');
 assert.deepEqual(result.output.configuration,{status:'unknown'});assert.equal(result.output.execution.status,'unknown');
 assert.equal(result.output.next_step.tool,'dock_action_run');assert.equal(f.runtime.hasUnsettledWork(),false);
 f.runtime.assertPreparationAllowed();assert.equal(f.calls.filter(c=>c===phase).length,1);
 assert.deepEqual(await f.runtime.recover('apply-export',{strategy:'abandon_operation',recoveryOperationId:'release-export'}),released);
 assert.throws(()=>f.runtime.startNodeApply({operation_id:'apply-export'},{resume:true}),/released/);
});
test('an unsettled export read never gains generic browser recovery or draft release',async()=>{
 const f=await stoppedRuntime('read',{browserRecovery:true});
 const advice=(await f.runtime.inspect({operationId:'apply-export'})).output;
 assert.deepEqual(advice.recovery_options,[]);assert.equal(advice.next_steps.some(s=>s.tool==='dock_browser_recovery'),false);
 assert.throws(()=>f.runtime.browserRecoveryBasis('apply-export'),/No browser recovery trigger/);
 assert.equal(f.runtime.hasUnsettledWork(),true);assert.equal(f.calls.filter(c=>c==='read').length,1);
});
test('browser recovery verifies an export release without inferring settings, execution or a file',async()=>{
 const f=await stoppedRuntime('configure',{browserRecovery:true,blocked:true});
 const refused=await f.runtime.recover('apply-export',{strategy:'abandon_operation',recoveryOperationId:'release-export'});
 assert.equal(refused.error.code,'NODE_RELEASE_REFUSED');assert.equal(refused.output.next_step.reason,'NODE_RELEASE_REFUSED');
 const basis=f.runtime.browserRecoveryBasis('apply-export');assert.equal(basis.step.kind,'node');
 assert.equal((await f.runtime.browserRecoveryHandoff('apply-export')).stopped,true);
 f.state.blocked=false;
 const result=await f.runtime.verifyBrowserRecovery({operationId:'apply-export',step:basis.step,attested:{actions_performed:['closed blocking dialog']}});
 assert.equal(result.status,'continuable');assert.equal(result.next_step.tool,'dock_action_run');
 assert.deepEqual(result.original_operation.configuration,{status:'unknown'});assert.equal(result.original_operation.execution.status,'unknown');
 assert.equal(f.runtime.hasUnsettledWork(),false);assert.equal(f.calls.filter(c=>c==='configure').length,1);
 const receipt=f.events.find(e=>e.phase==='browser_recovery_receipt').receipt;
 assert.equal(receipt.file_artifacts,undefined);assert.equal(receipt.configuration.status,'unknown');
});
