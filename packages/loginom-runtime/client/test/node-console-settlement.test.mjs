import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
const tid='MF;cntMain;tlbMainToolbar;btnProgress';
function fixture(fault,{settle=true,until=20000}={}) {
 let clock=0;const records=[];
 const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]};
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
 const button={tid,ref:'console-button',signature:{tid,tag:'a'},enabled:true,allowed_actions:['click']};
 const operation={id:'launched',deadline:30000,action:{action_key:'node.apply',revision:'1'}};
 const channel=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref,node},
  targetOrigin:'http://example.test',targetBuild:'7.4.2',now:()=>clock,monotonicNow:()=>clock,wait:async ms=>{clock+=ms},
  record:async e=>{records.push(e);return structuredClone(e)},execute:async code=>{
   assert.equal(typeof code,'string','settlement must only read');
   const current=structuredClone(button);
   if(clock>=5000&&fault==='button')current.ref='replacement';
   const output={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,
    dom_epoch:{document:fault==='document'&&clock>=5000?'other':'browser',revision:clock},
    prepared_node_context:{...node,verified:true,surface:'graph',locked:false},wizard:{status:'absent'},scan:{complete:true},
    ui:{elements:fault==='open'?[{tid:'ConsoleForm;ProgressForm;trpProgress;grd;tbl'}]:clock>=5000&&fault==='missing'?[]:[current],dialogs:[],truncated:{masks:false,dialogs:false,elements:false},
     masks:clock<until?[{kind:'busy',target_tid:fault==='foreign'?'MF;TF-2;ModelForm':fault==='unknown'?undefined:'MF;TF-1;ModelForm',dialog_ref:null}]:[]}};
   return {status:'SUCCEEDED',output};
  }});
 return {operation,records,channel,get clock(){return clock},read:()=>channel.observe({condition:'prepared node available for process console',
  readProcessControls:true,...(settle?{settleProcessConsole:{ref:button.ref,signature:button.signature}}:{}),ready:s=>s.ui.elements.some(e=>e.tid===tid||e.tid==='ConsoleForm;ProgressForm;trpProgress;grd;tbl')})};
}
test('confirmed own graph loading may settle after 20 seconds without any gesture or deadline change',async()=>{
 const f=fixture();await f.read();assert.equal(f.clock,20000);assert.equal(f.operation.deadline,30000);
 assert.ok(f.records.some(e=>e.phase==='node_observation_sample'&&e.readiness.elapsed_ms>15000));
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared').length,0);
});
test('ordinary console readiness retains its local 15 second budget',async()=>{
 const f=fixture(undefined,{settle:false});await assert.rejects(f.read(),/readiness timeout/);assert.equal(f.clock,15000);
});
for(const fault of ['foreign','unknown','document','button','missing'])test('console settlement refuses '+fault+' ownership',async()=>{
 const f=fixture(fault);await assert.rejects(f.read());assert.ok(f.clock<=5000);assert.equal(f.operation.deadline,30000);
 await assert.rejects(f.channel.act({verb:'click',ref:'console-button'}));
});
test('own loading still stops at the original deadline without a usable observation',async()=>{
 const f=fixture(undefined,{until:40000});await assert.rejects(f.read(),/readiness timeout/);assert.equal(f.clock,30000);
 await assert.rejects(f.channel.act({verb:'click',ref:'console-button'}));
});

test('an already visible unmasked console retains its existing read path without a toolbar button',async()=>{
 const f=fixture('open',{until:0});await f.read();assert.equal(f.clock,0);
});
