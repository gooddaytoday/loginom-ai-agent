import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSlidingWindow} from '../lib/sliding-window-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
function fixture(){
 const base='W;SlidingWindowWizard;',fields=[{index:0,record_id:'a',name:'A',label:'A',type:'integer',history:2,horizon:1},{index:1,record_id:'b',name:'B',label:'B',type:'string',history:0,horizon:0}];
 const state={wizard:{stage:'sliding_window',root_tid:'W'},node_sliding_window:{verified:true,inventory_complete:true,fields,incomplete_records:'drop_all_incomplete',node_context:{verified:true,node_id:'n'}},ui:{elements:[]}};
 let editing=null,draft={},picker=false;const actions=[];
 const element=(tid,verbs,ref)=>({tid,identity:{anchor_tid:tid},allowed_actions:verbs,ref:'ui-'+ref});
 function refresh(){state.ui.elements=editing?[
  ...['colHistory_num','colForecast_num'].map((column,i)=>element(base+'grdColumns;roweditor;'+column,['fill'],i?'horizon':'history')),
  element('roweditorbuttons;update',['click'],'update'),
 ]:[...fields.map(f=>element(base+'colDisplayName_'+f.name,['double_click'],f.name)),element(base+'pedIncompleteRecordsProcessing;ValueControl;trg_picker',['click'],'picker'),
  ...(picker?[element(base+'pedIncompleteRecordsProcessing;ValueControl;boundlist;Оставлять_неполные_записи',['click'],'policy')]:[])];}
 refresh();
 const channel={async observe(options){refresh();assert.ok(options.ready(state),options.condition);return structuredClone(state);},async perform(options){
  assert.ok(options.ready(state),options.condition);const action=options.resolve(state);validateUiAction(action,state);actions.push(action);
  if(action.verb==='double_click'){editing=fields.find(f=>'ui-'+f.name===action.ref);draft={};}
  if(action.verb==='fill')draft[action.ref==='ui-history'?'history':'horizon']=Number(action.text);
  if(action.ref==='ui-update'){Object.assign(editing,draft);editing=null;}
  if(action.ref==='ui-picker')picker=true;
  if(action.ref==='ui-policy'){state.node_sliding_window.incomplete_records='keep_incomplete';picker=false;}
  refresh();
 }};
 return {channel,actions,inputMapping:{verified:true,inventory_complete:true,target_fields:structuredClone(fields)}};
}
test('real window procedure applies complete replacement and one exact policy edit',async()=>{
 const f=fixture(),result=await configureSlidingWindow(f.channel,{windows:[{field:'B',history:1,horizon:0}],incomplete_records:'keep_incomplete'},f);
 assert.deepEqual(result.configuration.fields.map(f=>[f.name,f.history,f.horizon]),[['A',0,0],['B',1,0]]);
 assert.equal(result.configuration.incomplete_records,'keep_incomplete');
 assert.equal(f.actions.filter(a=>a.ref==='ui-update').length,2);
 assert.equal(f.actions.filter(a=>a.ref==='ui-policy').length,1);
});
test('real window procedure preserves omitted settings and clears an explicit empty window list',async()=>{
 const f=fixture(),result=await configureSlidingWindow(f.channel,{},f);assert.equal(f.actions.length,0);assert.equal(result.configuration.fields[0].history,2);
 const cleared=await configureSlidingWindow(f.channel,{windows:[]},f);assert.equal(cleared.configuration.fields[0].history,0);assert.equal(cleared.configuration.incomplete_records,'drop_all_incomplete');
});
