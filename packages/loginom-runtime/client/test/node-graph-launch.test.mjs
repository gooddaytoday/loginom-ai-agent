import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeExecutionProcedure,finishConfiguredGraph} from '../lib/node-execution-procedure.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
function fixture({selected=false,fail=false}={}){
 const actions=[];let consoleOpen=false;
 const element=(tid,actions,extra={})=>({tid,ref:tid,allowed_actions:actions,...extra});
 const state=()=>({prepared_node_context:{verified:true,...node,surface:'graph',locked:false,tid:'graph-node'},wizard:{status:'absent'},
 node_outputs:{verified:true,node_selected:selected},node_processes:{verified:true,show_completed:true,inventory_complete:true,root_id:'root',node_context:{verified:true,...node},processes:[]},
 ui:{elements:[element('MF;cntMain;tlbMainToolbar;btnProgress',['click']),element('mnContextMenu;mniShowCompletedProcesses',['click','press']),element('ConsoleForm;btnClose',['click']),
 ...(consoleOpen?[element('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click'])]:[]),element('graph-node',['click'],{graph_node:{part:'body'}}),
 ...(selected?[element('launch',['execute_graph_node'],{graph_execution:{node_id:'node',source:'native_selected_graph_node'}})]:[])]}});
 const channel={observe:async({ready})=>{const s=state();assert.equal(ready(s),true);return s;},perform:async p=>{const s=state();assert.equal(p.ready(s),true);const a=p.resolve(s);actions.push(a);
 if(a.ref==='MF;cntMain;tlbMainToolbar;btnProgress')consoleOpen=true;
 if(a.ref==='ConsoleForm;btnClose')consoleOpen=false;
 if(a.ref==='graph-node')selected=true;
 if(a.verb==='execute_graph_node'&&fail)throw Error('lost launch reply');
 return {status:'SUCCEEDED'};}};
 return {driver:createNodeExecutionProcedure(channel,node),actions};
}
for(const selected of [false,true])test('graph launch selects only when needed and issues one typed launch: '+selected,async()=>{
 const f=fixture({selected});await f.driver.prepare();const r=await f.driver.launchGraph();
 assert.equal(r.launch_gesture_verified,true);assert.equal(r.execution_completed,false);
 assert.equal(f.actions.filter(a=>a.ref==='graph-node').length,selected?0:1);
 assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
 await assert.rejects(f.driver.launchGraph());assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
});
test('a lost graph launch reply cannot cause a second launch',async()=>{
 const f=fixture({fail:true});await f.driver.prepare();await assert.rejects(f.driver.launchGraph(),/lost launch/);
 await assert.rejects(f.driver.launchGraph());assert.equal(f.actions.filter(a=>a.verb==='execute_graph_node').length,1);
});
test('graph launch cannot run without a captured baseline',async()=>{
 const f=fixture();await assert.rejects(f.driver.launchGraph());assert.equal(f.actions.length,0);
});

for(const mode of ['done','execute'])test('configured graph finish '+mode+' never reopens a wizard',async()=>{
 const calls=[],channel={observe:async({ready})=>{const s={prepared_node_context:{verified:true,...node,surface:'graph',locked:false},wizard:{status:'absent'},node_outputs:{verified:true}};assert.ok(ready(s));return s;}};
 const driver={launchGraph:async()=>{calls.push('launch');return {verified:true,launch_gesture_verified:true,receipt:{operation_id:'launch1',action_key:'ui.act',action_revision:'1',status:'SUCCEEDED',cleanup_complete:true,output:{gesture_applied:true,origin:'http://loginom.test'}}};},identify:async()=>{calls.push('identify');return {execution_id:'fresh',node};}};
 const r=await finishConfiguredGraph(channel,driver,mode,node);assert.equal(r.mode,mode);assert.equal(r.reopen_performed,false);
 if(mode==='execute')assert.deepEqual(r.launch_receipt,{operation_id:'launch1',action_key:'ui.act',action_revision:'1',gesture_applied:true});
 assert.equal(r.execution_started,mode==='execute');assert.equal(r.execution_id,mode==='execute'?'fresh':null);assert.deepEqual(calls,mode==='execute'?['launch','identify']:[]);
});
test('configured graph finish does not accept an execution identity from another node',async()=>{
 const channel={observe:async()=>({prepared_node_context:{...node}})},driver={launchGraph:async()=>({verified:true,launch_gesture_verified:true,receipt:{operation_id:'launch1',action_key:'ui.act',action_revision:'1',status:'SUCCEEDED',cleanup_complete:true,output:{gesture_applied:true}}}),identify:async()=>({execution_id:'foreign',node:{...node,node_id:'other'}})};
 await assert.rejects(finishConfiguredGraph(channel,driver,'execute',node),/Fresh graph/);
});

test('graph finish receipt survives the real durable journal without embedding URL-normalized UI',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {createExecutionJournal}=await import('../lib/execution-journal.mjs');const directory=await mkdtemp(join(tmpdir(),'graph-finish-'));
 try{
 const channel={observe:async()=>({prepared_node_context:{...node}})},driver={launchGraph:async()=>({verified:true,launch_gesture_verified:true,receipt:{operation_id:'launch1',action_key:'ui.act',action_revision:'1',status:'SUCCEEDED',cleanup_complete:true,output:{gesture_applied:true,origin:'http://loginom.test'}}}),identify:async()=>({execution_id:'fresh',node})};
 const result=await finishConfiguredGraph(channel,driver,'execute',node);
 const record=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'}});
 const saved=await record({phase:'node_phase_completed',receipt:{phase:'finish',value:result}});
 assert.deepEqual(JSON.parse(JSON.stringify(saved.receipt.value)),result);
 }finally{await rm(directory,{recursive:true,force:true});}
});
