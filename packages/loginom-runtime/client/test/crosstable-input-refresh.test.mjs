import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCrossTableInput} from '../lib/crosstable-node.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'pivot'};
function fixture({active=false,lost=false,foreign=false,incomplete=false}={}){
 let opened=false,launched=false,menu=false,selected=false;
 const actions=[],el=(tid,allowed_actions=['click'])=>({tid,ref:tid,allowed_actions});
 const state=()=>({prepared_node_context:{...node,...(foreign?{node_id:'other'}:{}),verified:true,surface:'graph',tid:'graph-node',locked:false},wizard:{status:'absent'},navigation_context:{status:'observed'},
  node_outputs:{verified:true,node_selected:true,ports:(incomplete?[]:[0]).map(index=>({index,active:active||launched}))},
  node_processes:{verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},processes:launched?[
   {process_id:'1',record_id:'group',parent_id:null,state:'completed',error:false,children_loaded:true,expanded:true,rendered:true},
   {process_id:'1.1',record_id:'child',parent_id:'1',state:'completed',error:false,rendered:true,selected,process_tid:'child-row'}]:[]},
  ui:{elements:[el('MF;cntMain;tlbMainToolbar;btnProgress'),{...el('graph-node'),graph_node:{part:'body'}},
   {...el('execute',['execute_graph_node']),graph_execution:{node_id:node.node_id,mode:'execute'}},
   ...(opened?[el('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click']),el('ConsoleForm;btnClose'),el('child-row',['right_click'])]:[]),
   ...(menu?[el('mnContextMenu;mniShowCompletedProcesses',['click','press']),el('mnContextMenu;mniShowNodeToProcess',['show_process_node'])]:[])]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return structuredClone(s);},async perform(o){
  const s=state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);
  if(a.ref==='MF;cntMain;tlbMainToolbar;btnProgress')opened=true;
  if(a.ref==='ConsoleForm;btnClose')opened=false;
  if(a.verb==='right_click'){menu=true;if(a.ref==='child-row')selected=true;}
  if(a.verb==='press'||a.verb==='show_process_node')menu=false;
  if(a.verb==='execute_graph_node'){launched=true;if(lost)throw Error('Unknown launch reply');}
  return {status:'SUCCEEDED',cleanup_complete:true,operation_id:'refresh:launch',action_key:'ui.act',action_revision:'1',output:{gesture_applied:true}};
 }};
 const options={operation:{nodeApply:{request:{target:{kind:'existing'},finish:'execute',inputs:[]}}}};
 return {channel,options,actions,run:()=>prepareCrossTableInput(options,{node},{channel})};
}
test('reopened inactive CrossTable materializes its saved output once before opening input settings',async()=>{
 const f=fixture();await f.run();
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
 assert.equal(f.actions.filter(a=>a.verb==='show_process_node').length,1);
 assert.equal(f.actions.some(a=>['open_wizard','finish_wizard','wizard_step','deactivate_graph_node'].includes(a.verb)),false);
});
test('CrossTable refresh never executes a new, unexecuted or rewired request, or an already active CrossTable',async()=>{
 for(const patch of [{target:{kind:'new'}},{finish:'done'},{finish:'close'},{inputs:[{input:0}]}]){
  const f=fixture();Object.assign(f.options.operation.nodeApply.request,patch);
  f.channel.observe=async()=>{throw Error('Unexpected browser read');};await f.run();assert.deepEqual(f.actions,[]);
 }
 const active=fixture({active:true});await active.run();assert.deepEqual(active.actions,[]);
});
for(const options of [{foreign:true},{incomplete:true}])test('CrossTable refuses foreign or incomplete output activity before execution '+JSON.stringify(options),async()=>{
 const f=fixture(options);await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
});
test('unknown CrossTable materialization launch stops after one gesture',async()=>{
 const f=fixture({lost:true});await assert.rejects(f.run(),/Unknown launch reply/);
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
 assert.equal(f.actions.some(a=>a.verb==='show_process_node'),false);
});
