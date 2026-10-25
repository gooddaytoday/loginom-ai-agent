import test from 'node:test';
import assert from 'node:assert/strict';
import {restorePreflightSourceActivity} from '../lib/sorting-preflight.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'source'};
const progress='MF;cntMain;tlbMainToolbar;btnProgress',grid='ConsoleForm;ProgressForm;trpProgress;grd;tbl';
function fixture({before=true,after=false,fault}={}){
 let opened=false,menu=false,launched=false,selected=false,shown=false,reads=0;
 const actions=[],element=(tid,allowed_actions=['click'],extra={})=>({tid,ref:tid,signature:{tid},allowed_actions,...extra});
 const state=()=>({prepared_node_context:{...node,verified:true,surface:'graph',locked:false,tid:'source-body'},
  wizard:{status:'absent'},navigation_context:{status:'observed'},node_outputs:{verified:true,node_selected:true},
  node_processes:{verified:opened,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},processes:launched?[
   {process_id:'1',record_id:'group',parent_id:null,state:'completed',error:false,children_loaded:true,expanded:true,rendered:true},
   {process_id:'1.1',record_id:fault==='child'&&shown?'replaced':'child',parent_id:'1',state:'completed',error:false,rendered:true,selected,process_tid:'child-row'}]:[]},
  ui:{elements:[element(progress),element('source-body',['click'],{graph_node:{part:'body'}}),
   element('launch',['execute_graph_node'],{graph_execution:{node_id:'source'}}),
   ...(opened?[element(grid,['right_click']),element('ConsoleForm;btnClose'),element('child-row',['right_click'])]:[]),
   ...(menu?[element('mnContextMenu;mniShowCompletedProcesses',['click','press']),element('mnContextMenu;mniShowNodeToProcess',['show_process_node'])]:[])]}});
 const channel={observe:async options=>{const s=state();assert.ok(options.ready(s),options.condition);return structuredClone(s);},
  perform:async options=>{const s=state();assert.ok(options.ready(s),options.condition);options.identity?.(s);
   const action=options.resolve(s);actions.push(action);
   if(action.ref===progress)opened=true;
   if(action.verb==='right_click'){menu=true;if(action.ref==='child-row')selected=true;}
   if(action.verb==='press')menu=false;
   if(action.ref==='ConsoleForm;btnClose')opened=false;
   if(action.verb==='execute_graph_node'){if(fault==='launch')throw Error('Lost launch reply');launched=true;}
   if(action.verb==='show_process_node'){shown=true;menu=false;}
   return {status:'SUCCEEDED',cleanup_complete:true,operation_id:'restore:1',action_key:'ui.act',action_revision:'1',output:{gesture_applied:true}};
  }};
 const original={index:0,port_guid:'port',active:before};
 const observeSource=async()=>{reads++;return {...original,port_guid:fault==='port'?'foreign':'port',active:launched&&fault!=='inactive'?true:after};};
 const ctx={signal:new AbortController().signal,stopSignal:new AbortController().signal};
 return {actions,run:()=>restorePreflightSourceActivity(channel,node,original,observeSource,ctx),get reads(){return reads;}};
}

test('cancelled active source is reexecuted once and its identical port is reread active',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.port.active,true);assert.equal(result.port.port_guid,'port');
 assert.equal(result.execution.status,'completed');assert.equal(result.execution.owner_verified,true);
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);assert.equal(f.reads,2);
});
for(const active of [false,true])test('unchanged source activity does not execute: '+active,async()=>{
 const f=fixture({before:active,after:active}),result=await f.run();
 assert.equal(result.port.active,active);assert.equal(result.execution,null);assert.deepEqual(f.actions,[]);
});
for(const fault of ['port','launch','child','inactive'])test('restoration refuses '+fault+' without replay or a successful proof',async()=>{
 const f=fixture({fault});await assert.rejects(f.run());
 assert.ok(f.actions.filter(a=>a.verb==='execute_graph_node').length<=1);
 if(fault==='port')assert.deepEqual(f.actions,[]);
});
test('unexpected activation of an originally inactive source is refused without deactivating it',async()=>{
 const f=fixture({before:false,after:true});await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
});
