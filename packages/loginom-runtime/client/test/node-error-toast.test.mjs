import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

// l667lin-diag:661–737: successful native Train, then a toast outside
// the toolbar root for every sample. DOM template: manual train-toast.json.
const message='Количество строк (2) в обучающем наборе не должно быть меньше количества коэффициентов (4) модели';
function replay(fault,verb='train') {
 let clock=1,launched=false,closed=false;const records=[],actions=[];
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
 if(fault==='root')processes.root_id='other';
 if(fault==='running')processes.processes[1].progress_state={...terminal,state:'running',terminal:false,can_cancel:true};
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:context,wizard:{status:'absent'},ui:{masks:[],dialogs:launched&&!closed?[{ref:'ui-toast',identity:{anchor_tid:'toast',path:[]},title:'Ошибка',text:'[outside selected root]'}]:[],
   truncated:{dialogs:false,masks:false},elements:[{ref:'ui-launch',tid:'mn;mniTeachNode',label:'Обучить узел',allowed_actions:[verb==='train'?'click':verb]},
    {ref:'ui-progress',tid:'MF;cntMain;tlbMainToolbar;btnProgress',signature:{tag:'a'},enabled:true,allowed_actions:['click']} ]}});
 const operation={id:'own',deadline:30000,action:{action_key:'node.apply',revision:'1'}};
 const channel=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},targetOrigin:'http://example.test',targetBuild:'7.4.2',
  now:()=>clock,monotonicNow:()=>clock,wait:async ms=>{clock+=ms},record:async r=>{records.push(structuredClone(r));return structuredClone(r)},
  wrapMutation:(code,reference)=>({code,reference}),execute:async code=>{
   if(typeof code==='string') {
    if(code.includes('async function readNodeProcesses('))return structuredClone(processes);
    const output=state();
    if(code.includes('"node_error_toast_observation":true')&&launched&&!closed){
     output.ui.dialogs[0].error_toast={kind:fault==='info'?'info':'error',caption:fault==='caption'?'Other:':'Прогноз Y:',message:fault==='text'?'Other error':message};
     output.ui.elements.push({ref:'ui-close',tid:'toast;p.h;close',signature:{tag:'div',dialog_ref:'ui-toast'},enabled:true,allowed_actions:['click']});
    }
    return {status:'SUCCEEDED',output};
   }
   const action=records.findLast(r=>r.phase==='node_step_prepared').action;actions.push(action);
   if(action.ref==='ui-launch')launched=true;
   else {assert.equal(action.ref,'ui-close');closed=true;}
   return {status:'SUCCEEDED',action_key:'ui.act',operation_id:code.reference.id,cleanup_complete:true,effect_possible:true,output:state()};
  }});
 return {channel,actions,records,get clock(){return clock},async run(){
  await channel.observe({condition:'native launch available',readTraining:verb==='train',ready:()=>true});
  if(fault!=='no-baseline')await channel.bindExecutionBaseline?.({root_id:'root',node,roots:[{process_id:'1',record_id:'old',completed:true}],launch_verified:false});
  if(fault!=='no-launch')await channel.act({verb:verb==='train'?'click':verb,ref:'ui-launch'});
  return channel.observe({condition:'prepared node available for process console',readProcessControls:true,ready:()=>fault!=='no-launch'});
 }};
}
for(const verb of ['train','execute_graph_node','execute_wizard'])test('own '+verb+' error toast returns Loginom text before readiness timeout and closes only its toast',async()=>{
 const f=replay(undefined,verb);await assert.rejects(f.run(),e=>e.nodeExecutionFailure?.code==='NODE_EXECUTION_FAILED'&&e.message===message);
 assert.ok(f.clock<15000);assert.deepEqual(f.actions.map(a=>a.ref),['ui-launch','ui-close']);
 assert.ok(f.records.some(r=>r.phase==='node_execution_error_toast_observed'));
 await assert.rejects(f.channel.act({verb:'click',ref:'ui-launch'}),/fresh internal observation/);
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
