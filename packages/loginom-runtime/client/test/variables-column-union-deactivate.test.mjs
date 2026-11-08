import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {preflightVariablesColumnUnion} from '../lib/variables-coluniondatavar-preflight.mjs';
import {resolveVariablesColumnUnionInputs} from '../lib/variables-coluniondatavar-parameters.mjs';
const node={document_id:'d',workflow_id:'w',node_id:'u'};
test('input topology deactivates the same active union before its wizard can change controller',async()=>{
 const calls=[],control=mode=>({ref:'control',graph_execution:{node_id:'u',mode},allowed_actions:[mode==='deactivate'?'deactivate_graph_node':'execute_graph_node']});
 let active=true,opened=false,selected=false;
 const channel={observe:async o=>{const state=opened?{node_variables_column_union:{verified:true,mapping:'automatic'}}:{prepared_node_context:{surface:'graph'},ui:{elements:selected?[control(active?'deactivate':'execute')]:[]}};assert.equal(o.ready(state),true);calls.push(opened?'mapping':'graph');return state;},
  perform:async o=>{const state={ui:{elements:[control('deactivate')]}};assert.equal(o.identity(state).node_id,'u');assert.equal(o.resolve(state).verb,'deactivate_graph_node');calls.push('deactivate');active=false;}};
 const variable_inputs=[0,1,2].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input}}));
 const graph={nodes:[...variable_inputs.map(i=>({ref:i.source,variable_outputs:[{kind:'variables',port:0,port_guid:'out'}]})),{ref:node,type:'variables.column_union',locked:false,variable_inputs:[0,1].map(port=>({kind:'variables',port,port_guid:'in'+port}))}],variable_links:[]};
 const request={target:{kind:'existing',ref:node},parameters:{column_union:{mapping:'automatic'}},variable_inputs,finish:'close'};
 const run=()=>vm.runInNewContext('('+preflightVariablesColumnUnion.toString()+')(options,ctx,{})',{
  options:{operation:{parameters:request}},ctx:{deadline:Date.now()+30000},resolveVariablesColumnUnionInputs,
  createNodeTargetBrowserAdapter:()=>({observe:async()=>graph}),createNodeProcedure:()=>channel,
  selectPreparedGraphNode:async()=>{selected=true;calls.push('select');},
  openPreparedWizard:async()=>{if(active)throw Error('WIZARD_CONTEXT_CHANGED');opened=true;calls.push('open');},
  closePreparedWizard:async()=>{opened=false;calls.push('close');},
 });
 assert.equal((await run()).verified,true);assert.deepEqual(calls,['graph','select','graph','deactivate','graph','open','mapping','close']);
 calls.length=0;assert.equal((await run()).verified,true);assert.deepEqual(calls,['graph','select','graph','open','mapping','close']);
});
