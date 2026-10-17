import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createActionRuntime} from '../lib/executor.mjs';
import {releasePendingNode,proveFinishLaunchRefused,NodeReleaseBlocked} from '../lib/node-pending-release.mjs';
import {buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {releaseNodeApply} from '../lib/node-apply.mjs';
import {nodeJobResultSchema} from '../lib/node-result-schema.mjs';
import {actions} from './support/executor-fixture.mjs';

const validateJob=new AjvJsonSchemaValidator().getValidator(nodeJobResultSchema);
const assertJob=job=>{const result=validateJob(job);assert.equal(result.valid,true,result.errorMessage);};
const node={document_id:'doc',workflow_id:'wf',node_id:'new'};
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const graphOf=()=>({complete:true,document_id:'doc',workflow_ref:workflow,
 nodes:[{ref:node,type:'imports.text',label:'Source',position:{x:320,y:280},inputs:[],outputs:[0]}],links:[],foreign_links:[]});

function surface({wizard=false,foreign=false,locked=false,dialog=false,views=false}={}) {
 let open=wizard,visualizers=views;const gestures=[];const path=[{tid:'MF;TF-1;path',label:'Сценарий'}];
 const state=()=>visualizers?{wizard:{status:'absent'},prepared_node_context:{...node,verified:true,surface:'views'},
  workflow_navigation:{status:'observed',control_ref:'ui-nav',control_tid:'MF;TF-1;path',path},
  ui:{elements:[{tid:'MF;TF-1;path',ref:'ui-nav',allowed_actions:['click']}],dialogs:[],masks:[]}}
  :open?{wizard:{status:'observed',root_ref:'ui-w',root_tid:'W',stage:'text_import_format',owner_context:{status:'observed',node:{tid:'owner'}}},
  prepared_node_context:{...node,...(foreign?{node_id:'other'}:{}),verified:true,surface:'wizard'},
  ui:{elements:[{tid:'W;btnClose',ref:'ui-close',allowed_actions:['click']}],dialogs:[],masks:[]}}
  :{wizard:{status:'absent'},prepared_node_context:{...node,verified:true,surface:'graph',locked},navigation_context:{status:'observed',path},
   ui:{elements:[],dialogs:dialog?[{ref:'ui-d'}]:[],masks:[]}};
 return {gestures,channel:{
  observe:async({ready})=>{const s=state();if(!ready(s))throw Error('Node procedure readiness timeout');return structuredClone(s);},
  perform:async({resolve,initialObservation})=>{gestures.push(resolve(initialObservation));open=false;visualizers=false;}}};
}
const stopped=({graph=graphOf,receipt={state:'completed',receipt:{cleanup_complete:true}},transportUncertain=false}={})=>({
 transportUncertain,lastReceipt:{id:'apply:n7'},deadline:Date.now()+10000,
 nodeApply:{pending:{phase:'configure'},node,request:{document_id:'doc',workflow_ref:workflow}},
 nodeTargetAdapter:{observe:async()=>graph()},receipt});
const release=(operation,channel,restoreRead)=>releasePendingNode({operation,channel,restoreRead,readReceipt:async()=>operation.receipt});

test('release proves a quiet unchanged graph without a gesture',async()=>{
 const s=surface(),proof=await release(stopped(),s.channel);
 assert.equal(proof.verified,true);assert.equal(proof.cleanup_complete,true);assert.equal(proof.effect_possible,false);
 assert.deepEqual(proof.cleanup,{wizard_closed:false,read_view_restored:false,views_returned:false});assert.deepEqual(s.gestures,[]);
 assert.equal(proof.node_context.node_id,'new');assert.equal(proof.graph.nodes.length,1);
});
test('release cancels only the stopped node\'s own wizard draft',async()=>{
 const s=surface({wizard:true}),proof=await release(stopped(),s.channel);
 assert.deepEqual(s.gestures,[{verb:'click',ref:'ui-close'}]);assert.equal(proof.cleanup.wizard_closed,true);assert.equal(proof.effect_possible,true);
});
test('release leaves the stopped node\'s visualizers through the observed scenario control',async()=>{
 const s=surface({views:true}),proof=await release(stopped(),s.channel);
 assert.deepEqual(s.gestures,[{verb:'click',ref:'ui-nav'}]);assert.equal(proof.cleanup.views_returned,true);assert.equal(proof.effect_possible,true);
});
test('release restores a stopped read view before checking the graph',async()=>{
 const s=surface(),order=[];
 const channel={...s.channel,observe:async o=>{order.push('observe');return s.channel.observe(o);}};
 const proof=await release(stopped(),channel,async()=>{order.push('restore');return true;});
 assert.equal(order[0],'restore');assert.equal(proof.cleanup.read_view_restored,true);
});
for(const [name,operation,options,blocked] of [
 ['foreign wizard',stopped(),{wizard:true,foreign:true},true],
 ['locked node',stopped(),{locked:true},true],
 ['open dialog',stopped(),{dialog:true},true],
 ['unconfirmed last gesture',stopped({receipt:{state:'pending'}}),{},false],
 ['last gesture without cleanup',stopped({receipt:{state:'completed',receipt:{cleanup_complete:false}}}),{},false],
 ['transport uncertainty',stopped({transportUncertain:true}),{},false],
])test('release refuses: '+name,async()=>{
 const s=surface(options);
 const error=await release(operation,s.channel).then(()=>null,e=>e);
 assert.ok(error,'release must refuse');assert.equal(error instanceof NodeReleaseBlocked,blocked);
 if(blocked)assert.match(error.userAction,/Cancel/);
 assert.deepEqual(s.gestures,[]);
});
test('an unobservable release surface asks the user to cancel the open wizard first',async()=>{
 const s=surface();s.channel.observe=async()=>{throw Error('Workspace scan budget exceeded');};
 const error=await release(stopped(),s.channel).then(()=>null,e=>e);
 assert.ok(error instanceof NodeReleaseBlocked);assert.match(error.message,/scan budget/);
 assert.match(error.userAction,/unsaved settings[\s\S]*Cancel[\s\S]*NEW recovery_operation_id/);
});
test('release refuses a graph that changes between quiet reads',async()=>{
 let reads=0;const graph=()=>{const g=graphOf();if(reads++)g.links.push({source:'other',target:'new',input:0});return g;};
 await assert.rejects(release(stopped({graph}),surface().channel),/graph changed/);
});

const request=()=>({operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
function fixture({release:releaseDriver}={}) {
 const calls=[],events=[],graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
  reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async e=>{calls.push(e.kind);if(e.kind==='create')graph.nodes.push({ref:node,
   type:e.parameters.type,label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
 const ok=(name,extra={})=>async()=>{calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false,...extra};};
 const drivers={verifySource:ok('source'),mapPorts:ok('mapping'),openWizard:ok('open'),
  finish:async mode=>{calls.push('finish');return {verified:true,cleanup_complete:true,mode,effect_possible:true,
   execution_id:mode==='execute'?'exec':null,execution_started:mode==='execute'};},
  waitExecution:async()=>{calls.push('execute');return {verified:true,cleanup_complete:true,status:'completed',execution_id:'exec'};},
  readOutput:ok('read',{status:'complete',execution_id:'exec',evidence_ref:'evidence',ports:[]}),verifyContinuation:async()=>true,
  ...(releaseDriver?{releasePending:async state=>{calls.push('release:'+state.pending.phase);return releaseDriver(state);}}:{})};
 const handler={revision:'1',modes:['delimited'],validate:()=>{},configure:ok('configure')};
 const runtime=createActionRuntime({pinned:{actions,selectors:new Map(),pins:{}},allowCandidate:true,execute:async()=>{throw Error('Unexpected public transport');},
  nodeTargetAdapterFactory:()=>adapter,nodeApplyHandlers:new Map([['imports.text',handler]]),nodeApplyDriverFactory:()=>drivers,
  onRecord:async e=>{events.push(e);return e;}});
 return {runtime,calls,events,drivers,handler};
}
const proved=({wizard_closed=false,read_view_restored=false}={})=>()=>({verified:true,cleanup_complete:true,effect_possible:wizard_closed||read_view_restored,
 node_context:{...node,verified:true,surface:'graph',locked:false},graph:graphOf(),cleanup:{wizard_closed,read_view_restored,views_returned:false}});
const stop=async(f,phase)=>{
 const key=phase==='read'?'readOutput':'finish',original=f.drivers[key];let first=true;
 f.drivers[key]=async(...args)=>{if(!first)return original(...args);first=false;f.calls.push(phase);throw Error('Local node cancellation requested');};
 f.runtime.startNodeApply(request());
 const job=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(job.outcome.status,'AMBIGUOUS');assert.equal(job.outcome.output.pending_phase,phase);
 return job;
};

test('a stopped finish is released once and unblocks preparation, saving and new node work',async()=>{
 const f=fixture({release:proved()});await stop(f,'finish');
 const advice=(await f.runtime.inspect({operationId:'apply'})).output;
 assert.deepEqual(advice.recovery_options,['abandon_operation']);
 assert.deepEqual(advice.next_steps[0].arguments,{operation_id:'apply',strategy:'abandon_operation'});
 assert.deepEqual(advice.next_steps[0].required_fields,['recovery_operation_id']);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);
 const blocked=await f.runtime.run('package.save_checkpoint',{path:'/user/abc.lgp',conflict_policy:'replace'},{operationId:'save-0'});
 assert.equal(blocked.operation_id,'apply');assert.equal(blocked.status,'AMBIGUOUS');
 const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
 assert.equal(released.status,'SUCCEEDED');assert.equal(released.output.resolution,'released_after_proof');assert.equal(released.output.goal_verified,false);
 const outcome=released.output.original_outcome.output;
 assert.equal(outcome.status,'FAILED');assert.equal(outcome.checkpoint_kind,'local_node_released');assert.equal(outcome.released_phase,'finish');
 assert.equal(outcome.cleanup_complete,true);assert.equal(outcome.pending_phase,null);assert.deepEqual(outcome.node,node);
 assert.deepEqual(outcome.execution,{status:'unknown',execution_id:null});assert.deepEqual(outcome.configuration,{status:'unknown'});
 assert.equal(outcome.next_step.tool,'dock_node_apply');assert.match(outcome.next_step.instruction,/NEW operation_id[\s\S]*"kind":"existing"/);
 assert.equal(f.calls.filter(c=>c==='finish').length,1);assert.deepEqual(f.calls.filter(c=>c.startsWith('release:')),['release:finish']);
 assert.ok(f.events.some(e=>e.phase==='node_operation_released'&&e.receipt.phase==='finish'&&e.result.checkpoint_kind==='local_node_released'));
 const job=f.runtime.nodeApplyStatus('apply');assertJob(job);assert.equal(job.outcome.status,'FAILED');assert.equal(job.outcome.phase,'node_released');
 assert.equal(f.runtime.hasUnsettledWork(),false);f.runtime.assertPreparationAllowed();
 assert.equal((await f.runtime.inspect({operationId:'apply'})).output.state,'resolved');
 assert.deepEqual(await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'}),released);
 assert.throws(()=>f.runtime.startNodeApply({operation_id:'apply'},{resume:true}),/released/);
 // Before release a save only redelivers the stopped node outcome; afterwards it is admitted as its own operation.
 const saved=await f.runtime.run('package.save_checkpoint',{path:'/user/abc.lgp',conflict_policy:'replace'},{operationId:'save-1'}).catch(error=>error);
 assert.equal(saved.operation_id,'save-1',String(saved.message??''));
 f.runtime.startNodeApply({...request(),operation_id:'next',target:{kind:'existing',type:'imports.text',ref:node},finish:'done'});
 assert.equal((await f.runtime.waitNodeApply('next',{timeoutMs:1000})).outcome.status,'SUCCEEDED');
});
test('a refused release names the user action and keeps the original operation pending',async()=>{
 const f=fixture({release:()=>{throw new NodeReleaseBlocked('A Loginom wizard of another node is open','Ask the user to close it with Cancel.');}});
 await stop(f,'finish');
 const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
 assert.equal(refused.status,'AMBIGUOUS');assert.equal(refused.phase,'release_refused');assert.equal(refused.error.code,'NODE_RELEASE_REFUSED');
 assert.equal(refused.output.user_action,'Ask the user to close it with Cancel.');assert.equal(refused.output.original_operation_pending,true);
 assert.deepEqual(await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'}),refused);
 assert.equal((await f.runtime.inspect({operationId:'apply'})).output.state,'pending');
 assert.equal(f.runtime.hasUnsettledWork(),true);assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);
 assert.ok(!f.events.some(e=>e.phase==='node_operation_released'));
});
test('only abandon_operation may release a stopped node operation',async()=>{
 const f=fixture({release:proved()});await stop(f,'finish');
 await assert.rejects(f.runtime.recover('apply',{strategy:'restore_control',recoveryOperationId:'repair'}),/enclosing node procedure/);
 assert.ok(!f.calls.some(c=>c.startsWith('release:')));
});
test('a released stopped read keeps its completed execution and applied configuration',async()=>{
 const f=fixture({release:proved({read_view_restored:true})});await stop(f,'read');
 const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-read'});
 const outcome=released.output.original_outcome.output;
 assert.equal(outcome.released_phase,'read');assert.deepEqual(outcome.execution,{status:'completed',execution_id:'exec'});
 assert.equal(outcome.configuration.status,'applied');assert.match(outcome.warnings.join(' '),/Table view/);
 assert.equal(f.calls.filter(c=>c==='execute').length,1);assertJob(f.runtime.nodeApplyStatus('apply'));
});
test('a released configure that cancelled its own draft reports discarded settings',async()=>{
 const f=fixture({release:proved({wizard_closed:true})});
 f.handler.configure=async()=>{f.calls.push('configure');throw Error('UI_EPOCH_CHANGED');};
 f.runtime.startNodeApply(request());await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 const outcome=(await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-c'})).output.original_outcome.output;
 assert.equal(outcome.released_phase,'configure');assert.deepEqual(outcome.configuration,{status:'discarded'});
 assert.deepEqual(outcome.execution,{status:'not_requested',execution_id:null});assert.match(outcome.warnings[0],/draft/);
});

test('dock_node_read accepts only a release stopped at read as its source',async()=>{
 const phases=['finish','output_mapping'].map(phase=>({phase,receipt_id:'apply:'+phase,status:'verified',effect_possible:true}));
 const readback={scope:'observed_before_verified_finish',values_are:'observed_ui_values',node,receipt_ids:['apply:finish','apply:output_mapping'],
  output_mapping:{port:0,fields:[{index:0,name:'Id',label:'Id',type:'integer',data_kind:'Непрерывный',source_name:'Id'}]}};
 const source=released_phase=>({parameters:request(),outcome:{status:'FAILED',cleanup_complete:true,output:{status:'FAILED',cleanup_complete:true,
  checkpoint_kind:'local_node_released',released_phase,node,phases,execution:{status:'completed',execution_id:'exec'},
  output:{status:'not_refreshed',evidence_ref:null,ports:[]},configuration:{status:'applied',readback}}}});
 const read=buildNodeReadRequest({operation_id:'reread',source_operation_id:'apply'},source('read'));
 assert.deepEqual(read.target,{kind:'existing',type:'imports.text',label:'Source',ref:node});assert.deepEqual(read.read.ports,[0]);
 assert.throws(()=>buildNodeReadRequest({operation_id:'reread',source_operation_id:'apply'},source('finish')),/completed local table node/);
 // Releasing that reread itself points back to the original source, not to the reread.
 const handlers=new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:async()=>({})}]]);
 const operation={id:'reread',nodeApply:{signature:'sig',request:read,node,phases:[],pending:{phase:'finish',receipt_id:'reread:finish'},
  execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]}}};
 const events=[];
 const result=await releaseNodeApply({operation,handlers,record:async e=>{events.push(e);return e;},
  drivers:{releasePending:proved()}});
 assert.deepEqual(result.configuration,{status:'not_requested'});assert.deepEqual(result.execution,{status:'unknown',execution_id:null});
 assert.equal(result.next_step.tool,'dock_node_read');assert.match(result.next_step.instruction,/source_operation_id:"apply"/);
 assert.equal(operation.nodeApply.pending,null);assert.equal(events[0].phase,'node_operation_released');
});

const refusedBeforeGesture={status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,trace:[{event:'ui_observation_started'}],error:{code:'UI_EPOCH_CHANGED'}};
const succeeded={status:'SUCCEEDED',effect_possible:true,cleanup_complete:true,trace:[{event:'ui_preconditions_verified'},{event:'ui_gesture_applied'}]};
const steps=verbs=>verbs.map((verb,i)=>({step:i+1,internal_operation_id:'apply:n'+(i+1),signature:'sig'+(i+1),verb}));
const receiptsBy=map=>async ref=>map[ref.id]==='pending'?{state:'pending'}:{state:'completed',receipt:{operation_id:ref.id,action_key:'ui.act',...map[ref.id]}};

test('finish resume proof accepts selection plus launch refusals before any gesture',async()=>{
 const proof=await proveFinishLaunchRefused({steps:steps(['click','execute_graph_node','execute_graph_node']),
  readReceipt:receiptsBy({'apply:n1':succeeded,'apply:n2':refusedBeforeGesture,'apply:n3':refusedBeforeGesture})});
 assert.equal(proof.launch_effect,false);assert.deepEqual(proof.receipts.map(r=>r.refused_before_gesture),[false,true,true]);
 assert.equal((await proveFinishLaunchRefused({steps:[],readReceipt:async()=>assert.fail('no receipt to read')})).verified,true);
});
for(const [name,verbs,map] of [
 ['an applied launch',['execute_graph_node'],{'apply:n1':succeeded}],
 ['an applied deactivation',['deactivate_graph_node','execute_graph_node'],{'apply:n1':succeeded,'apply:n2':refusedBeforeGesture}],
 ['a launch refused after its preconditions',['execute_graph_node'],{'apply:n1':{...refusedBeforeGesture,trace:[{event:'ui_preconditions_verified'}]}}],
 ['an unsettled selection',['click','execute_graph_node'],{'apply:n1':'pending','apply:n2':refusedBeforeGesture}],
 ['a selection without cleanup',['click'],{'apply:n1':{...succeeded,cleanup_complete:false}}],
])test('finish resume proof refuses '+name,async()=>{
 await assert.rejects(proveFinishLaunchRefused({steps:steps(verbs),readReceipt:receiptsBy(map)}),/settled receipt|may have taken effect/);
});

test('a stopped finish resumes under its original boundary after a no-effect launch proof',async()=>{
 const f=fixture({release:proved()});let verified=0;
 f.drivers.verifyPendingFinish=async state=>{verified++;assert.equal(state.pending.phase,'finish');return {verified:true,launch_effect:false,receipts:[]};};
 await stop(f,'finish');
 const pendingBoundary=structuredClone((await f.runtime.inspect({operationId:'apply'})).output.outcome.output.pending_phase);
 const advice=(await f.runtime.inspect({operationId:'apply'})).output;
 assert.equal(pendingBoundary,'finish');assert.deepEqual(advice.recovery_options,['resume','abandon_operation']);
 assert.deepEqual(advice.next_steps.map(s=>s.tool),['dock_node_resume','dock_operation_recover']);
 f.runtime.startNodeApply({operation_id:'apply'},{resume:true});
 const resumed=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(resumed.outcome.status,'SUCCEEDED',JSON.stringify(resumed.outcome?.error??resumed.error));assert.equal(verified,1);
 assert.deepEqual(f.calls.filter(c=>['configure','finish','execute'].includes(c)),['configure','finish','finish','execute']);
 assert.ok(f.events.some(e=>e.phase==='node_finish_recovery_checked'&&e.recovery.launch_effect===false));
 assert.equal(f.events.filter(e=>e.phase==='node_phase_prepared'&&e.receipt.phase==='finish').length,1);
 assert.ok(!f.calls.some(c=>c.startsWith('release:')));f.runtime.assertPreparationAllowed();
});
test('a refused finish proof keeps the operation and leaves only release',async()=>{
 const f=fixture({release:proved()});
 f.drivers.verifyPendingFinish=async()=>{throw Error('A finish launch or deactivation may have taken effect; release the operation instead');};
 await stop(f,'finish');
 f.runtime.startNodeApply({operation_id:'apply'},{resume:true});
 const rejected=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(rejected.outcome.status,'AMBIGUOUS');assert.equal(rejected.outcome.output.pending_phase,'finish');
 assert.match(rejected.outcome.error.message,/may have taken effect/);
 assert.deepEqual((await f.runtime.inspect({operationId:'apply'})).output.recovery_options,['abandon_operation']);
 assert.throws(()=>f.runtime.startNodeApply({operation_id:'apply'},{resume:true}),/Resume requires/);
 assert.equal(f.calls.filter(c=>c==='finish').length,1);
 const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
 assert.equal(released.status,'SUCCEEDED');
});
