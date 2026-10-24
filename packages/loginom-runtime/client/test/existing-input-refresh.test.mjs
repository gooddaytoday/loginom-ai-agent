import test from 'node:test';
import assert from 'node:assert/strict';
const {prepareExistingInput}=await import('../lib/node-execution-procedure.mjs');
const node={document_id:'doc',workflow_id:'flow',node_id:'group'};
function fixture({active=false,lost=false,foreign=false,incomplete=false,type='transform.join_data',changedGuid=false,inactiveAfter=false,foreignOutput=false}={}){
 let opened=false,launched=false,menu=false,selected=false;
 const actions=[],el=(tid,allowed_actions=['click'])=>({tid,ref:tid,allowed_actions});
 const state=()=>({prepared_node_context:{...node,...(foreign?{node_id:'other'}:{}),verified:true,surface:'graph',tid:'graph-node',locked:false},wizard:{status:'absent'},navigation_context:{status:'observed'},
  node_outputs:{verified:true,node_selected:true,node_context:{...node,...(foreignOutput?{node_id:'other'}:{}),verified:true},ports:(incomplete?[]:[0]).map(index=>({index,port_guid:changedGuid&&launched?'changed-output-port':'saved-output-port',active:active||launched&&!inactiveAfter}))},
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
 const options={operation:{nodeApply:{request:{target:{kind:'existing',type},parameters:type==='transform.join_data'?{}:{changes:[]},mappings:[],finish:'execute',inputs:[]}}}};
 return {channel,options,actions,run:()=>prepareExistingInput(options,{node},{channel})};
}
for(const type of ['transform.join_data','transform.reform_columns'])test('D46 inactive saved '+type+' materializes once before input settings',async()=>{
 const f=fixture({type});await f.run();
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
 assert.equal(f.actions.filter(a=>a.verb==='show_process_node').length,1);
 assert.equal(f.actions.some(a=>['open_wizard','finish_wizard','wizard_step','deactivate_graph_node'].includes(a.verb)),false);
});
test('D46 refresh never executes a new, unexecuted, changed or rewired request, or an already active node',async()=>{
 for(const patch of [{target:{kind:'new'}},{finish:'done'},{finish:'close'},{inputs:[{input:0}]},{parameters:{keys:[{left:'A',right:'A'}]}},{mappings:[{direction:'input',port:0}]},{target:{kind:'existing',type:'programming.javascript'}}]){
  const f=fixture();Object.assign(f.options.operation.nodeApply.request,patch);
  f.channel.observe=async()=>{throw Error('Unexpected browser read');};await f.run();assert.deepEqual(f.actions,[]);
 }
 const active=fixture({active:true});await active.run();assert.deepEqual(active.actions,[]);
});
for(const options of [{foreign:true},{incomplete:true}])test('D46 refuses foreign or incomplete output activity before execution '+JSON.stringify(options),async()=>{
 const f=fixture(options);await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
});
test('D46 unknown materialization launch stops after one gesture',async()=>{
 const f=fixture({lost:true});await assert.rejects(f.run(),/Unknown launch reply/);
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
 assert.equal(f.actions.some(a=>a.verb==='show_process_node'),false);
});

for(const mode of ['changedGuid','inactiveAfter'])test('D46 materialization refuses '+mode+' before input mapping',async()=>{
 const f=fixture({[mode]:true});await assert.rejects(f.run(),/Saved output identity changed/);
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
 assert.equal(f.actions.some(a=>a.verb==='open_input_port'),false);
});
test('D46 output owner mismatch refuses before execution',async()=>{
 const f=fixture({foreignOutput:true});await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
});
test('D46 changed Reform settings do not execute the saved configuration first',async()=>{
 const f=fixture({type:'transform.reform_columns'});f.options.operation.nodeApply.request.parameters={changes:[{field:{kind:'input_field',name:'A'},name:'B'}]};
 f.channel.observe=async()=>{throw Error('Unexpected browser read');};await f.run();assert.deepEqual(f.actions,[]);
});
