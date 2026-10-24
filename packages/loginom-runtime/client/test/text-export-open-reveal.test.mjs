import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextExportNodeSupport} from '../lib/text-export-node.mjs';

// D30, LAB-82 head189 q3: bbox=(1256,172,42,78), viewport=1280x800.
// The observed point (1268,211) is valid, but the full body centre (1277,211)
// is obscured. Model the browser boundary; run the real export/channel drivers.
function fixture({fault,finish='execute'}={}) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'export'};
 const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const deadline=Date.now()+10000,records=[],gestures=[];
 let pending,consoleOpen=false,menu=false,revealed=false,wizard=false;
 const element=(tid,allowed_actions=['click'],extra={})=>({tid,ref:'ui-'+tid.replace(/[^a-zA-Z0-9-]/g,'-'),signature:{tid},allowed_actions,...extra});
 const snapshot=()=>({origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,
  dom_epoch:{document:'browser',revision:revealed?2:1},scan:{complete:true},geometry:{viewport:{width:1280,height:800}},
  prepared_node_context:{...node,node_id:revealed&&fault==='owner'?'foreign':node.node_id,tid:'body',verified:true,surface:wizard?'wizard':'graph',locked:false},
  node_processes:{verified:consoleOpen,inventory_complete:true,root_id:'root',show_completed:true,processes:[],node_context:{...node,verified:true,surface:'graph'}},
  wizard:wizard?{status:'observed',stage:'text_export_params',owner_context:{status:'observed',node:{tid:'path>Export',label:'Export'},path:[...workflow.navigation_path,{tid:'path>Export',label:'Export'},{tid:'settings',label:'Settings'}]}}:{status:'absent'},
  ui:{dialogs:[],masks:[],truncated:{elements:false,dialogs:false,masks:false},elements:[
   element('MF;cntMain;tlbMainToolbar;btnProgress'),
   ...(consoleOpen?[element('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click']),element('ConsoleForm;btnClose')]:[]),
   ...(menu?[element('mnContextMenu;mniShowCompletedProcesses',['click','press'])]:[]),
   element('body',['click'],{ref:revealed?'ui-fresh-body':'ui-clipped-body',graph_node:{part:'body'},interaction:{state:'point_observed',point:{x:revealed?700:1268,y:211}},bounding_box:{x:revealed?679:1256,y:172,width:42,height:78}}),
   element('body;Setting',['begin_wizard'],{wizard_open:{node:{node_label:'Export'},workflow_path:workflow.navigation_path}})]}});
 const operation={id:'export',action:{action_key:'node.apply',revision:'1'},nodeApply:{request:{target:{kind:'existing',ref:node},finish}}};
 const support=createTextExportNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({operation,now:Date.now,
  receiptOptions:(id,key,signature)=>({id,action_key:key,signature}),
  onRecord:async e=>{records.push(e);if(e.phase==='node_step_prepared')pending=e;return structuredClone(e);},
  execute:async code=>{
   if(code.includes('function readNodeProcesses'))return {...snapshot().node_processes,node_context:snapshot().prepared_node_context};
   if(!pending)return {status:'SUCCEEDED',output:snapshot()};
   const step=pending;pending=null;const action=step.action;
   const receipt={status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'ui.act',effect_possible:true,cleanup_complete:true};
   if(action.verb==='reveal_prepared_node') {
    assert.equal(consoleOpen,false,'reveal must follow execution preparation');
    if(fault==='unknown')throw Error('Lost viewport reply');
    revealed=true;gestures.push('reveal');
    return {...receipt,action_key:'node.viewport.reveal.internal',output:{verified:true,graph_unchanged:true,fully_visible:true,settings_applied:false,node}};
   }
   if(action.ref==='ui-clipped-body')return {...receipt,status:'NOT_APPLIED',effect_possible:false,error:{code:'UI_REFERENCE_OBSCURED',message:'Body centre obscured'},trace:[]};
   gestures.push(action.verb+':'+action.ref);
   if(action.ref==='ui-MF-cntMain-tlbMainToolbar-btnProgress')consoleOpen=true;
   if(action.verb==='right_click')menu=true;
   if(action.verb==='press')menu=false;
   if(action.ref==='ui-ConsoleForm-btnClose')consoleOpen=false;
   if(action.verb==='begin_wizard'){assert.equal(revealed,true);wizard=true;}
   return receipt;
  }});
 return {run:()=>driver.openWizard({document_id:'doc',workflow_ref:workflow,node,deadline}),operation,records,gestures,deadline};
}

for(const finish of ['execute','done'])test('existing Export reveals a partially clipped body before fresh selection/open: '+finish,async()=>{
 const f=fixture({finish});assert.equal((await f.run()).verified,true);
 assert.deepEqual(f.gestures.slice(-3),['reveal','click:ui-fresh-body','begin_wizard:ui-body-Setting']);
 assert.equal(f.operation.deadline,f.deadline);
 const reveal=f.records.findIndex(e=>e.phase==='node_step_completed'&&e.outcome?.action_key==='node.viewport.reveal.internal');
 const fresh=f.records.findIndex((e,i)=>i>reveal&&e.phase==='node_observation_completed'&&e.readiness?.condition==='export graph ready');
 const select=f.records.findIndex(e=>e.phase==='node_step_prepared'&&e.action.ref==='ui-fresh-body');
 assert.ok(reveal>=0&&fresh>reveal&&select>fresh);
});
for(const fault of ['owner','unknown'])test('existing Export stops on viewport '+fault+' without selection/open',async()=>{
 const f=fixture({fault});await assert.rejects(f.run(),fault==='owner'?/Prepared node binding is missing or changed/:/Lost viewport reply/);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='reveal_prepared_node').length,1);
 assert.equal(f.gestures.some(g=>g==='click:ui-fresh-body'||g.startsWith('begin_wizard:')),false);
 assert.equal(f.operation.deadline,f.deadline);
});
