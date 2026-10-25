import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
function fixture(change=()=>{},losePolicy=false){
 const parameters={target:{kind:'existing',type:'transform.join_data'},inputs:[],mappings:[],parameters:{},mode:'left',finish:'execute'};change(parameters);
 const operation={id:'read-join',parameters,action:{action_key:'node.apply',revision:'1'},deadline:10000},events=[],codes=[];
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,verified:true,surface:'wizard',tid:'W'},wizard:{status:'observed',stage:'input_mapping',root_ref:'wizard',root_tid:'W',owner_context:{status:'observed'}},
  ui:{truncated:{elements:false,dialogs:false,masks:false},dialogs:[],masks:[],elements:[{ref:'ui-next',tid:'W;btnNext',allowed_actions:['wizard_step']}]}};
 const channel=createNodeProcedure({operation,now:()=>1,wait:async()=>{},preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},
  targetOrigin:'https://example.test',targetBuild:'7.4.2',wrapMutation:(code,ref)=>({code,ref}),
  record:async e=>{events.push(structuredClone(e));const copy=structuredClone(e);if(losePolicy)delete copy.preserve_join_mapping;return copy;},
  execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(state)};
   codes.push(code);return {status:'SUCCEEDED',action_key:'ui.act',operation_id:code.ref.id,cleanup_complete:true,effect_possible:true,output:structuredClone(state)};
  }});
 return {events,codes,run:async()=>{const initialObservation=await channel.observe({condition:'saved input',ready:()=>true});
  return channel.perform({condition:'saved Join Next',initialObservation,preserveJoinMapping:true,ready:()=>true,
   identity:()=>({node}),resolve:()=>({verb:'wizard_step',ref:'ui-next',expected_stage:'join'})});}};
}
test('private saved Join navigation is bound to a durable policy and one browser receipt',async()=>{
 const f=fixture();await f.run();assert.equal(f.codes.length,1);assert.match(f.codes[0].code,/"preserve_join_mapping":true/);
 const prepared=f.events.find(e=>e.phase==='node_step_prepared');assert.equal(prepared.preserve_join_mapping,true);assert.ok(prepared.signature);
});
for(const [name,change] of [['new',p=>p.target.kind='new'],['edited',p=>p.parameters={keys:[]}],['Reform',p=>p.target.type='transform.reform_columns'],['mode',p=>p.mode='other'],['mapping',p=>p.mappings=[{}]]])
 test('private Join mapping answer cannot be requested by '+name,async()=>{const f=fixture(change);await assert.rejects(f.run(),/unchanged node read/);assert.equal(f.codes.length,0);});
test('a missing durable Join policy refuses before the browser gesture',async()=>{const f=fixture(undefined,true);await assert.rejects(f.run(),/durably preserved/);assert.equal(f.codes.length,0);});
