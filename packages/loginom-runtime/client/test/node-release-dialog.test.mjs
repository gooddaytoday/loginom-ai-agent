import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {releasePendingNode} from '../lib/node-pending-release.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
function fixture(kind,fault,nodeWizard=false){
 let mode=kind,lastAction;const gestures=[],events=[];
 const operation={id:'apply',action:{action_key:'node.apply',revision:'1'},deadline:10000,lastReceipt:{id:'apply:opening'},
  nodeApply:{node,pending:{phase:'input_mapping'},request:{document_id:'doc',workflow_ref:workflow}},
  nodeTargetAdapter:{observe:async()=>({complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node}],links:[],foreign_links:[]})}};
 const state=portal=>{
  const graph=mode==='graph',conflict=mode==='conflict',dialog=conflict||mode==='confirmation';
  const text=conflict?'Loginom 7.4.2 Обнаружены связи с несуществующими объектами. Вы хотите удалить все потерянные связи и продолжить? Удалить и продолжить Не удалять и продолжить Отмена'
   :'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет';
  return {origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
   prepared_node_context:{...node,node_id:fault==='foreign-node'?'other':'node',verified:true,surface:graph?'graph':'wizard',locked:false,
    ...(!graph&&!nodeWizard?{input_port:{direction:'input',port:2,native_index:2,port_guid:'input2',opening_operation_id:fault==='foreign-opening'?'other:n45':'apply:n45'}}:{})},
   wizard:graph?{status:'absent'}:{status:'observed',root_ref:'ui-wizard',root_tid:'W',stage:'input_mapping',owner_context:nodeWizard?{status:'observed',node:{tid:fault==='foreign-owner'&&dialog?'other':'saved-node'},path:['package','workflow','node','settings']}:{status:'unobserved'}},
   ui:{truncated:{elements:false,dialogs:false,masks:false},
    dialogs:dialog?[{ref:'ui-dialog',title:portal?(conflict?'Loginom 7.4.2':'Подтвердить'):'',text:portal?(fault==='other-question'?'Удалить пакет?':text):'[outside selected root]'}]:[],
    masks:dialog?[{kind:fault==='busy'?'busy':'modal_background',ref:'ui-wizard'}]:[],
    elements:[...(!graph?[{ref:'ui-close',tid:'W;btnClose',allowed_actions:dialog?[]:['click']}]:[]),
     ...(dialog&&portal?Object.entries(conflict?{yes:'Удалить и продолжить',no:'Не удалять и продолжить',cancel:'Отмена'}:{yes:'Да',no:'Нет'}).map(([name,label])=>
      ({ref:'ui-'+name,tid:'msgbox;tlb;'+name,label,signature:{dialog_ref:fault==='foreign-control'?'other':'ui-dialog'},allowed_actions:['click',...(name==='yes'&&!conflict?['confirm_wizard_close']:[])]})):[])]}};
 };
 const channel=createNodeProcedure({operation,now:()=>1,wait:async()=>{},preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},
  targetOrigin:'http://example.test',targetBuild:'7.4.2',
  record:async e=>{events.push(e);if(e.phase==='node_step_prepared')lastAction=e.action;return structuredClone(e);},
  wrapMutation:(code,ref)=>({code,ref}),
  execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:state(code.includes('"root_ref":"ui-dialog"'))};
   gestures.push(lastAction);
   if(fault==='lost-reply')throw Error('Transport response lost');
   if(lastAction.ref==='ui-cancel'){assert.equal(mode,'conflict');mode='wizard';}
   else if(lastAction.ref==='ui-close'){assert.equal(mode,'wizard');mode='confirmation';}
   else{assert.equal(lastAction.verb,'confirm_wizard_close');assert.equal(lastAction.ref,'ui-yes');assert.equal(mode,'confirmation');mode='graph';}
   return {status:'SUCCEEDED',action_key:'ui.act',operation_id:code.ref.id,cleanup_complete:true,effect_possible:true,output:state(false)};
  }});
 return {operation,channel,gestures,events,run:()=>releasePendingNode({operation,channel,readReceipt:async()=>({state:'completed',receipt:{cleanup_complete:true}})})};
}
test('release cancels the exact owned lost-links question before closing its input wizard',async()=>{
 const f=fixture('conflict'),proof=await f.run();
 assert.equal(proof.verified,true);assert.equal(proof.cleanup_complete,true);assert.equal(proof.cleanup.wizard_closed,true);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'ui-cancel'},{verb:'click',ref:'ui-close'},{verb:'confirm_wizard_close',ref:'ui-yes'}]);
 assert.equal(proof.node_context.surface,'graph');assert.ok(!f.gestures.some(g=>g.verb==='execute_graph_node'));
});
test('release finishes an already-open owned Close confirmation without repeating Close',async()=>{
 const f=fixture('confirmation'),proof=await f.run();assert.equal(proof.verified,true);
 assert.deepEqual(f.gestures,[{verb:'confirm_wizard_close',ref:'ui-yes'}]);
});
for(const fault of ['foreign-node','foreign-opening','other-question','foreign-control','busy'])test('release leaves an unowned or uncertain mapping dialog untouched: '+fault,async()=>{
 const f=fixture('conflict',fault);await assert.rejects(f.run());assert.deepEqual(f.gestures,[]);
});
test('a lost Cancel reply never replays Cancel, Close or confirmation',async()=>{
 const f=fixture('conflict','lost-reply');await assert.rejects(f.run(),/Transport response lost/);
 assert.equal(f.operation.transportUncertain,true);assert.equal(f.operation.cleanupConfirmed,false);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'ui-cancel'}]);
});
test('release cancels the same exact question of its owned node input page without continuing',async()=>{
 const f=fixture('conflict',null,true),proof=await f.run();
 assert.equal(proof.verified,true);assert.deepEqual(f.gestures,[{verb:'click',ref:'ui-cancel'},{verb:'click',ref:'ui-close'},{verb:'confirm_wizard_close',ref:'ui-yes'}]);
});
for(const fault of ['foreign-node','other-question','foreign-control','busy'])test('node input release keeps foreign or uncertain dialog refusal: '+fault,async()=>{
 const f=fixture('conflict',fault,true);await assert.rejects(f.run());assert.deepEqual(f.gestures,[]);
});
