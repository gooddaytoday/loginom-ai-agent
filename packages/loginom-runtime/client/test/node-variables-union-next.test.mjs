import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
function fixture(change=()=>{},losePolicy=false){
 const parameters={target:{kind:'existing',type:'variables.column_union'},inputs:[],mappings:[],variable_inputs:[0,1,2].map(input=>({input,kind:'variables'})),parameters:{column_union:{mapping:'automatic'}},mode:'append_variables',finish:'execute'};change(parameters);
 const operation={id:'change-union',parameters,action:{action_key:'node.apply',revision:'1'},deadline:10000},events=[],codes=[];
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,verified:true,surface:'wizard',tid:'W'},wizard:{status:'observed',stage:'variables_column_union',root_ref:'wizard',root_tid:'W',owner_context:{status:'observed'}},
  ui:{truncated:{elements:false,dialogs:false,masks:false},dialogs:[],masks:[],elements:[{ref:'ui-next',tid:'W;btnNext',allowed_actions:['wizard_step']}]}};
 const channel=createNodeProcedure({operation,now:()=>1,wait:async()=>{},preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},targetOrigin:'https://example.test',targetBuild:'7.4.2',wrapMutation:(code,ref)=>({code,ref}),
  record:async e=>{events.push(structuredClone(e));const copy=structuredClone(e);if(losePolicy)delete copy.variables_union_input_change;return copy;},
  execute:async code=>{if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(state)};codes.push(code);return {status:'SUCCEEDED',action_key:'ui.act',operation_id:code.ref.id,cleanup_complete:true,effect_possible:true,output:structuredClone(state)};}});
 return {events,codes,run:async()=>{const initialObservation=await channel.observe({condition:'union mapping',ready:()=>true});
  return channel.perform({condition:'union input change Next',initialObservation,variablesUnionInputChange:true,ready:()=>true,identity:()=>({node}),resolve:()=>({verb:'wizard_step',ref:'ui-next',expected_stage:'done'})});}};
}
test('union topology Next records a durable private policy and can dispatch it only once per operation',async()=>{
 const f=fixture();await f.run();assert.equal(f.codes.length,1);assert.match(f.codes[0].code,/"variables_union_input_change":true/);
 assert.equal(f.events.find(e=>e.phase==='node_step_prepared').variables_union_input_change,true);
 await assert.rejects(f.run(),/once per operation/);assert.equal(f.codes.length,1);
});
test('third disconnection may use the same owned policy',async()=>{const f=fixture(p=>{p.variable_inputs=[];p.parameters.column_union.disconnect_input=2;});await f.run();assert.equal(f.codes.length,1);});
for(const [name,change] of [['new',p=>p.target.kind='new'],['other node',p=>p.target.type='transform.join_data'],['manual',p=>p.parameters.column_union.mapping='manual'],['read',p=>{p.variable_inputs=[];p.parameters={};}],['close',p=>p.finish='close'],['mode',p=>p.mode='read'],['two inputs',p=>p.variable_inputs.pop()]])
 test('union lost-links policy refuses '+name+' before dispatch',async()=>{const f=fixture(change);await assert.rejects(f.run(),/union input change/);assert.equal(f.codes.length,0);});
test('lost durable union policy refuses before any browser gesture',async()=>{const f=fixture(undefined,true);await assert.rejects(f.run(),/durably preserved/);assert.equal(f.codes.length,0);});
