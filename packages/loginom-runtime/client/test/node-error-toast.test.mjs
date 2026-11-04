import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

// l667lin-diag:661–737: successful native Train, then a toast outside
// the toolbar root for every sample. DOM template: manual train-toast.json.
const defaultMessage='Количество строк (2) в обучающем наборе не должно быть меньше количества коэффициентов (4) модели';
function replay(fault,verb='train',options={}) {
 const message=options.message??defaultMessage;
 let clock=1,launched=false,closed=false;const records=[],actions=[],nativeReads=[];
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const context={...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Прогноз_Y',locked:false};
 const terminal={verified:true,state:'failed',source:'native_progress_record',terminal:true,can_cancel:false};
 const processes={verified:true,inventory_complete:true,root_id:'root',show_completed:true,node_context:context,processes:[
  {process_id:'1',record_id:'old',parent_id:null,state:'completed',error:false},
  {process_id:'2',record_id:'new',parent_id:null,state:'pending_or_failed',error:true,error_details:message,children_loaded:true,progress_state:terminal},
  {process_id:'2.1',record_id:'child',parent_id:'2',state:'pending_or_failed',error:true,error_details:message,caption:'Прогноз Y',progress_state:terminal,
   owner:{verified:true,node_id:fault==='owner'?'other':'node',source:'native_process_model_identity'}}]};
 if(fault==='stale')processes.processes=processes.processes.slice(0,1);
 // l667diag4:731–840: both old roots remain; Train validation creates no process.
 if(options.preProcess)processes.processes=[
  {process_id:'1',record_id:'2858',parent_id:null,state:'completed',error:false},
  {process_id:'1.1',record_id:'2859',parent_id:'1',state:'completed',error:false},
  {process_id:'2',record_id:'3150',parent_id:null,state:'completed',error:false},
  {process_id:'2.1',record_id:'3151',parent_id:'2',state:'completed',error:false}];
 if(fault==='root')processes.root_id='other';
 if(fault==='running')processes.processes[1].progress_state={...terminal,state:'running',terminal:false,can_cancel:true};
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:context,wizard:{status:'absent'},ui:{masks:options.loadingRace&&launched&&clock<(options.loadingUntil??401)?[{ref:'graph-mask',kind:clock<(options.toastAt??0)?'busy':'modal_background',target_tid:'MF;TF-1;ModelForm',dialog_ref:null,graph_loading_owner_ref:'graph'}]:[],dialogs:launched&&clock>=(options.toastAt??0)&&!closed&&!(options.autoExpire&&clock>=(options.toastUntil??(options.loadingRace?601:201)))?[{ref:'ui-toast',identity:{anchor_tid:'toast',path:[]},title:'Ошибка',text:'[outside selected root]'}]:[],
   truncated:{dialogs:false,masks:false},elements:[{ref:'ui-launch',tid:'mn;mniTeachNode',label:'Обучить узел',allowed_actions:[verb==='train'?'click':verb]},
    {ref:'ui-progress',tid:'MF;cntMain;tlbMainToolbar;btnProgress',signature:{tag:'a'},enabled:true,allowed_actions:['click']} ]}});
 const operation={id:'own',deadline:30000,action:{action_key:'node.apply',revision:'1'}};
 if(options.preProcess||options.exclusive!==undefined)operation.exclusiveNodeExecution=()=>options.exclusive!==false;
 const channel=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},targetOrigin:'http://example.test',targetBuild:'7.4.2',
  now:()=>clock,monotonicNow:()=>clock,wait:async ms=>{clock+=ms},record:async r=>{records.push(structuredClone(r));return structuredClone(r)},
  wrapMutation:(code,reference)=>({code,reference}),execute:async code=>{
   if(typeof code==='string') {
    if(code.includes('async function readNodeProcesses(')){
     const masked=state().ui.masks.length>0;
     const result=options.consoleNotReady&&(masked||options.consoleStillUnready)
      ?{verified:false,reason:'console_not_ready',node_context:context}:processes;
     nativeReads.push({clock,masked,result:structuredClone(result)});
     return structuredClone(result);
    }
    const output=state();
    if(launched&&clock>=201)options.changeState?.(output);
    if(code.includes('"node_error_toast_observation":true')&&output.ui.dialogs.length){
     output.ui.dialogs[0].error_toast={kind:fault==='info'?'info':'error',caption:fault==='caption'?'Other:':'Прогноз Y:',message:fault==='text'?'Other error':options.toastMessage??message};
     output.ui.elements.push({ref:'ui-close',tid:'toast;p.h;close',signature:{tag:'div',dialog_ref:'ui-toast'},enabled:true,allowed_actions:['click']});
    }
    return {status:'SUCCEEDED',output};
   }
   const action=records.findLast(r=>r.phase==='node_step_prepared').action;actions.push(action);
   if(action.ref==='ui-launch')launched=true;
   else {assert.equal(action.ref,'ui-close');closed=true;}
   return {status:'SUCCEEDED',action_key:'ui.act',operation_id:code.reference.id,cleanup_complete:true,effect_possible:true,output:state()};
  }});
 return {channel,actions,records,nativeReads,get clock(){return clock},advance:ms=>{clock+=ms},async run(){
  await channel.observe({condition:'native launch available',readTraining:verb==='train',ready:()=>true});
  if(fault!=='no-baseline')await channel.bindExecutionBaseline?.({root_id:'root',node,roots:options.preProcess
   ?[{process_id:'1',record_id:'2858',completed:true},{process_id:'2',record_id:'3150',completed:true}]
   :[{process_id:'1',record_id:'old',completed:true}],launch_verified:false});
  if(fault!=='no-launch')await channel.act({verb:verb==='train'?'click':verb,ref:'ui-launch'});
  if(options.stopAfterLaunch)return;
  return channel.observe({condition:'prepared node available for process console',readProcessControls:true,...(options.loadingRace?{settleProcessConsole:{ref:'ui-progress',signature:{tag:'a'},quiet:true}}:{}),ready:()=>fault!=='no-launch'});
 }};
}

const message=defaultMessage;
for(const verb of ['train','execute_graph_node','execute_wizard'])test('own '+verb+' error toast returns Loginom text before readiness timeout and closes only its toast',async()=>{
 const f=replay(undefined,verb);await assert.rejects(f.run(),e=>e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED'&&e.message===message);
 assert.ok(f.clock<15000);assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch','ui-close']);
 assert.ok(f.records.some(r=>r.phase==='node_execution_error_toast_observed'));
 await assert.rejects(f.channel.act({verb:'click',ref:'ui-launch'}),/fresh internal observation/);
});
for(const verb of ['train','execute_graph_node','execute_wizard'])test('l667diag4 pre-process '+verb+' error reports native text without dismiss or process claim',async()=>{
 const f=replay(undefined,verb,{preProcess:true});
 await assert.rejects(f.run(),e=>e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED'
  &&e.message==='Loginom сообщил после запуска: '+message
  &&e.nodeExecutionFailure.native.source==='loginom_post_launch_error_toast'
  &&e.nodeExecutionFailure.native.execution_id===undefined);
 assert.ok(f.clock<15000);assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
 const saved=f.records.find(r=>r.phase==='node_execution_error_toast_observed');
 assert.equal(saved.failure.native.message,message);assert.equal(saved.failure.native.attribution,'own_action_wait');
 await assert.rejects(f.channel.act({verb:'click',ref:'ui-launch'}),/fresh internal observation/);
});
test('pre-process error cannot be attributed without exclusive session ownership',async()=>{
 const f=replay(undefined,'train',{preProcess:true,exclusive:false});
 await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
 assert.ok(f.records.some(r=>r.report_failed_conditions?.includes('exclusive_operation')));
});
test('ordinary release waits for the reported notification to expire without any toast action',async()=>{
 const f=replay(undefined,'train',{preProcess:true,autoExpire:true});
 await assert.rejects(f.run(),e=>e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED');
 const state=await f.channel.observe({condition:'stopped node release surface',releaseWizard:true,
  settleWizard:{graph_only:true,node:{document_id:'doc',workflow_id:'wf',node_id:'node'},deadline:30000},
  ready:s=>s.wizard.status==='absent'&&s.ui.dialogs.length===0});
 assert.equal(state.ui.dialogs.length,0);assert.equal(f.clock,201);
 assert.ok(f.records.some(r=>r.phase==='node_reported_error_toast_wait'));
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
for(const fault of ['info','root','no-baseline'])test('pre-process fallback preserves refusal for '+fault,async()=>{
 const f=replay(fault,'train',{preProcess:true});
 await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
test('a new group with unproved child cannot use the report-only fallback even with the session gate',async()=>{
 const f=replay('owner','train',{exclusive:true});
 await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
 assert.ok(f.records.some(r=>r.report_failed_conditions?.includes('no_new_execution')));
});
for(const fault of ['info','caption','text','owner','stale','root','running','no-baseline'])test('unproved toast retains the existing timeout and no dismissal: '+fault,async()=>{
 const f=replay(fault);await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);assert.equal(f.actions.length,1);
 const failed={info:'toast_error_kind',caption:'toast_caption_matches',text:'toast_message_matches',owner:'failed_owned_child',
  stale:'new_execution_group',root:'new_execution_group',running:'failed_owned_child','no-baseline':'launch_bound'}[fault];
 const refused=f.records.find(r=>r.phase==='node_observation_context_refused'&&r.failed_conditions?.includes(failed));
 assert.ok(refused,'the failed ownership condition and its observation must be durable');
 assert.equal(refused.outcome.output.ui.dialogs[0].identity.anchor_tid,'toast');
 if(fault!=='no-baseline')assert.ok(refused.native_processes);
 if(['owner','stale','root','running'].includes(fault))assert.ok(refused.native_proof_error?.condition);
});
test('baseline owner refusal is journaled before rejection without any gesture',async()=>{
 const f=replay();
 await assert.rejects(f.channel.bindExecutionBaseline({root_id:'root',roots:[],node:{document_id:'doc',workflow_id:'wf',node_id:'other'}}),/baseline owner differs/);
 const refused=f.records.find(r=>r.stage==='error_toast_baseline');
 assert.deepEqual(refused.failed_conditions,['owner']);assert.equal(refused.baseline.node.node_id,'other');assert.equal(f.actions.length,0);
});

// LAB-692 throw1-1:392: Loginom renders stack newlines as <br>, whose
// textContent omits the newline while retaining the following indentation.
for(const fault of [undefined,'text','caption','owner'])test('multiline JavaScript error preserves strict toast ownership: '+fault,async()=>{
 const message='Error: LAB669 intentional execution failure\n   at Anonymous function (<main>:1:1)\n   at module (<main>:1:1)';
 const f=replay(fault,'execute_graph_node',{message,toastMessage:message.replaceAll('\n','')});
 await assert.rejects(f.run(),e=>fault?!e.nodeExecutionFailure:
  e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED'&&e.message===message.replaceAll('\n',''));
 assert.deepEqual(f.actions.map(a=>a.ref),fault?['ui-launch']:['ui-launch','ui-close']);
});

test('LAB-807 own graph mask plus pre-process toast waits then reports the native error without another gesture',async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,autoExpire:true});
 await assert.rejects(f.run(),e=>e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED'
  &&e.nodeExecutionFailure.native.message===defaultMessage);
 assert.ok(f.clock>=401&&f.clock<601);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
 assert.equal(f.records.filter(r=>r.phase==='node_execution_error_toast_observed').length,1);
});
test('LAB-807 release first seeing the unreported toast waits for expiry instead of failing its first attempt',async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,autoExpire:true,stopAfterLaunch:true});
 await f.run(); // Preserve the stopped finish's unreported launch evidence.
 f.advance(400); // The graph mask has cleared but the same toast remains.
 const state=await f.channel.observe({condition:'stopped node release surface',releaseWizard:true,
  settleWizard:{graph_only:true,node:{document_id:'doc',workflow_id:'wf',node_id:'node'},deadline:30000},
  ready:s=>s.wizard.status==='absent'&&s.ui.dialogs.length===0});
 assert.equal(state.ui.dialogs.length,0);
 assert.ok(f.clock>=601&&f.clock<30000);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});

for(const field of ['document_id','workflow_id','node_id'])test('toast mask wait refuses changed '+field,async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,
  changeState:s=>{s.prepared_node_context[field]='other'}});
 await assert.rejects(f.run(),/Prepared node binding is missing or changed/);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
for(const field of ['ref','graph_loading_owner_ref','target_tid'])test('toast mask wait refuses changed mask '+field,async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,
  changeState:s=>{if(s.ui.masks.length)s.ui.masks[0][field]='other'}});
 await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
test('toast mask wait retains the original deadline and never clicks under a stuck mask',async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,loadingUntil:40000});
 await assert.rejects(f.run(),e=>e.name==='NodeReadinessTimeout');
 assert.equal(f.clock,30000);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
test('toast plus graph mask cannot wait on an unowned pre-process failure',async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,exclusive:false});
 await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);
 assert.equal(f.records.some(r=>r.phase==='node_execution_error_toast_mask_wait'),false);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});

// LAB-811 run 1:705–715: Train receipt, busy graph samples, then the same
// graph mask plus an error toast; native history is console_not_ready until clear.
test('LAB-811 masked console_not_ready waits for the graph before proving the native error',async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,consoleNotReady:true,
  toastAt:601,loadingUntil:1001,toastUntil:1201,autoExpire:true});
 await assert.rejects(f.run(),e=>e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED'
  &&e.nodeExecutionFailure.native.message===defaultMessage);
 assert.ok(f.clock>=1001&&f.clock<1201);
 assert.ok(f.records.some(r=>r.phase==='node_execution_error_toast_mask_wait'));
 assert.ok(f.nativeReads.length>0);
 assert.ok(f.nativeReads.every(r=>!r.masked&&r.result.verified===true));
 assert.equal(f.records.filter(r=>r.phase==='node_execution_error_toast_observed').length,1);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
test('LAB-811 cannot report an error if native history remains unready after the mask clears',async()=>{
 const f=replay(undefined,'train',{preProcess:true,loadingRace:true,consoleNotReady:true,consoleStillUnready:true});
 await assert.rejects(f.run(),e=>!e.nodeExecutionFailure);
 assert.ok(f.records.some(r=>r.phase==='node_execution_error_toast_mask_wait'));
 assert.ok(f.nativeReads.length>0);
 assert.ok(f.nativeReads.every(r=>!r.masked));
 assert.equal(f.records.some(r=>r.phase==='node_execution_error_toast_observed'),false);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch']);
});
