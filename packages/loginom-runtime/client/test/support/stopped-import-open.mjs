import {createNodeProcedure} from '../../lib/node-procedure.mjs';
import {releasePendingNode} from '../../lib/node-pending-release.mjs';

// LAB-666: main-execution-events.jsonl:562-570, including the node-only
// breadcrumb and absent wizard_pending_owner of the deactivation question.
export function stoppedImportOpen(operation,fault) {
 const node=operation.nodeApply.node,workflow=operation.nodeApply.request.workflow_ref;
 const path=workflow.navigation_path,tid=workflow.prefix+';Graph;Source';
 let open=true,lastAction;const gestures=[],events=[];
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',authenticated:true,
  workflow_ref:workflow,package_identity:{name:'Package1',path:null},active_tab_ref:'ui-tab',
  dom_epoch:{document:'browser',revision:open?1:2},scan:{complete:true},
  prepared_node_context:{...node,verified:true,surface:'graph',tid,locked:false,
   ...(open?{pending_wizard_node:{tid:path.at(-1).tid+'>Source',label:'Source'}}:{})},
  workflow_navigation:{status:'observed',path,current_path:[...path,...(open?[{tid:path.at(-1).tid+'>Source',label:'Source'}]:[])]},
  wizard:{status:'absent'},wizard_pending_owner:{status:'unobserved'},
  ui:{truncated:{elements:false,dialogs:false,masks:false},
   dialogs:open?[{ref:'ui-question',title:'Loginom 7.4.2',text:'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет'}]:[],
   masks:open?[{ref:'ui-mask',kind:'modal_background',target_tid:workflow.prefix,dialog_ref:null}]:[],
   elements:open?Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).map(([name,label])=>
    ({ref:'ui-'+name,tid:'msgbox;tlb;'+name,label,signature:{dialog_ref:'ui-question'},allowed_actions:['click']})):[]}});
 const receipt={operation_id:operation.id+':n6',action_key:'ui.act',status:'AMBIGUOUS',effect_possible:true,cleanup_complete:true,
  error:{code:'WIZARD_CONTEXT_CHANGED'},trace:[{event:'ui_preconditions_verified',verb:'begin_wizard'},
   {event:'ui_gesture_applied',verb:'begin_wizard'}],output:structuredClone(state())};
 operation.lastReceipt={id:receipt.operation_id,operation_id:receipt.operation_id,action_key:'ui.act'};
 operation.nodeTargetAdapter={observe:async()=>{
  if(open)throw Error('Graph is blocked');
  return {complete:true,document_id:node.document_id,workflow_ref:workflow,
   nodes:[{ref:node,type:'imports.text',label:'Source',position:{x:320,y:280},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 }};
 const current=()=>{
  const s=state();
  if(open&&fault==='foreign-node')s.prepared_node_context.node_id='other';
  if(open&&fault==='foreign-dialog')s.ui.dialogs[0].ref='other';
  if(open&&fault==='other-question')s.ui.dialogs[0].text='Удалить пакет?';
  if(open&&fault==='busy')s.ui.masks[0].kind='busy';
  if(open&&fault==='changed-path')s.workflow_navigation.current_path.at(-1).label='Other';
  if(open&&fault==='foreign-control')s.ui.elements[2].signature.dialog_ref='other';
  return s;
 };
 if(fault==='unknown-receipt')receipt.cleanup_complete=false;
 if(fault==='foreign-receipt')receipt.operation_id='other:n6';
 if(fault==='unsettled')operation.transportUncertain=true;
 if(fault==='other-gesture')receipt.trace[1].verb='execute_graph_node';
 const channel=createNodeProcedure({operation,now:()=>1,wait:async()=>{},
  targetOrigin:'http://example.test',targetBuild:'7.4.2',
  preparedNodeContext:{document_id:node.document_id,workflow_ref:workflow,node},
  record:async e=>{events.push(e);if(e.phase==='node_step_prepared')lastAction=e.action;return structuredClone(e);},
  wrapMutation:(code,ref)=>({code,ref}),execute:async code=>{
   if(typeof code==='string'){
    const s=structuredClone(current());
    if(open&&!code.includes('"root_ref":"ui-question"')){
     s.ui.dialogs[0].title='';s.ui.dialogs[0].text='[outside selected root]';s.ui.elements=[];
    }
    return {status:'SUCCEEDED',output:s};
   }
   gestures.push(lastAction);
   if(fault==='lost-reply')throw Error('Transport response lost');
   if(fault==='expired')throw Error('Original deadline elapsed');
   if(!open||lastAction.verb!=='click'||lastAction.ref!=='ui-cancel')throw Error('Unexpected gesture');
   open=false;
   return {status:'SUCCEEDED',operation_id:code.ref.id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:state()};
  }});
 return {gestures,events,receipt,run:()=>releasePendingNode({operation,channel,readReceipt:async()=>({state:'completed',receipt})})};
}
