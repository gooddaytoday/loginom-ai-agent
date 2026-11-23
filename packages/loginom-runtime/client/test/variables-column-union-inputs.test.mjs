import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariablesColumnUnionParameters,resolveVariablesColumnUnionInputs,validateVariablesColumnUnionInventory} from '../lib/variables-coluniondatavar-parameters.mjs';
import {prepareNodeTarget,verifyNodeTargetEffect} from '../lib/node-target.mjs';
import {variablesColumnUnionConfigurationReadback} from '../lib/variables-coluniondatavar-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {verifyVariablesColumnUnionTopology} from '../lib/variables-coluniondatavar-preflight.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import vm from 'node:vm';
import {createVariablesColumnUnionNodeSupport} from '../lib/variables-coluniondatavar-node.mjs';
import {createTabularTransformNodeSupport} from '../lib/calculator-node.mjs';
import {preflightVariablesColumnUnion} from '../lib/variables-coluniondatavar-preflight.mjs';
import {applyNode} from '../lib/node-apply.mjs';
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
const inputs=()=>[0,1,2].map(input=>({kind:'variables',input,output:0,source:ref('s'+input)}));
const request=()=>({document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'variables.column_union',ref:ref('u')},inputs:[],mappings:[],variable_inputs:inputs(),finish:'execute',read:{ports:[],variable_ports:[0]},parameters:{}});
function graph(){return {complete:true,dom_epoch:1,document_id:'doc',workflow_ref:workflow,nodes:[...inputs().map(i=>({ref:i.source,type:'variables.calculator',label:'Source '+i.input,inputs:[],outputs:[],variable_outputs:[{kind:'variables',port:0,port_guid:'out'}]})),{ref:ref('u'),type:'variables.column_union',label:'Union',locked:false,inputs:[],outputs:[],other_ports:['Input_Add','Input_Var-0','Input_Var-1','Output_Var-0'],variable_inputs:[0,1].map(port=>({kind:'variables',port,port_guid:'in'+port})),variable_outputs:[{kind:'variables',port:0,port_guid:'out'}]}],links:[],foreign_links:[],variable_links:inputs().slice(0,2).map(i=>({source:i.source.node_id,target:'u',kind:'variables',input:i.input,output:0,source_port_guid:'out',target_port_guid:'in'+i.input}))};}
// Keep both production factories and preflight; replace only browser/channel I/O.
// This exercises the hooks, rather than calling the topology verifier directly.
function nodeSupportFixture(){
 const before=graph(),connected=structuredClone(before),r=request(),node=ref('u'),records=[],steps=[];
 connected.nodes.at(-1).variable_inputs.push({kind:'variables',port:2,port_guid:'in2'});
 connected.variable_links.push({source:'s2',target:'u',kind:'variables',input:2,output:0,source_port_guid:'out',target_port_guid:'in2'});
 let current=before,surface='graph',stage='variables_column_union';
 const state=()=>({prepared_node_context:{...node,verified:true,surface},
  wizard:{status:surface==='graph'?'absent':'observed',stage,root_tid:'wizard'},
  node_variables_column_union:{verified:true,mapping:'automatic',node_context:{...node,verified:true}},
  ui:{elements:[{ref:'execute',graph_execution:{node_id:'u',mode:'execute'},allowed_actions:['execute_graph_node']},
   {ref:'next',tid:'wizard;btnNext',allowed_actions:['wizard_step']},{ref:'done',tid:'wizard;btnDone',allowed_actions:['finish_wizard']}]}});
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true);return s;},
  async perform(options){const s=state();assert.equal(options.ready(s),true);const action=options.resolve(s);steps.push({action,policy:options.variablesUnionInputChange});
   if(action.verb==='wizard_step')stage='done';else if(action.verb==='finish_wizard')surface='graph';else assert.fail(action.verb);},
  async readVariablePort(){return {output:{complete:true,count:1,variables:[{name:'amount',label:'amount',type:'integer',cell:{type:'integer',is_null:false,value:'0',precision:'exact_integer'}}]}};}};
 const io={structuredClone,createNodeProcedure:()=>channel,
  createNodeExecutionProcedure:()=>({prepare:async()=>{},waitCompleted:async()=>({status:'completed'})}),finishConfiguredGraph:async()=>{},
  selectPreparedGraphNode:async()=>{},openPreparedWizard:async()=>{surface='wizard';},closePreparedWizard:async()=>{surface='graph';},
  verified:v=>({verified:true,cleanup_complete:true,effect_possible:false,...v}),requireValue:(ok,m)=>assert.ok(ok,m),
  control:(s,key,verb)=>{const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb));assert.equal(controls.length,1);return controls[0];},
  calculatorParametersSchema:{},calculatorConfigurationReadback:()=>{},
  resolveVariablesColumnUnionInputs,validateVariablesColumnUnionInventory,
  createNodeTargetBrowserAdapter:()=>({observe:async()=>structuredClone(current)})};
 const preflight=vm.runInNewContext('('+preflightVariablesColumnUnion.toString()+')',io);
 const shared=vm.runInNewContext('('+createTabularTransformNodeSupport.toString()+')',io);
 const create=vm.runInNewContext('('+createVariablesColumnUnionNodeSupport.toString()+')',{
  ...io,createTabularTransformNodeSupport:shared,preflightVariablesColumnUnion:preflight,verifyVariablesColumnUnionTopology,
  variablesColumnUnionParametersSchema:{},validateVariablesColumnUnionParameters,variablesColumnUnionConfigurationReadback});
 const operation={id:'union-input2',parameters:r,nodeApply:{request:r,node,phases:[]},nodeTargetAdapter:{observe:async()=>structuredClone(current)}};
 const support=create({}),drivers=support.nodeApplyDriverFactory({operation,onRecord:async e=>{records.push(e);return e;}});
 const ctx={node,document_id:r.document_id,workflow_ref:workflow,deadline:Date.now()+30000};
 return {operation,records,steps,drivers,handlers:support.nodeApplyHandlers,ctx,before,connected,async configure(){
  await drivers.beforeTarget(ctx);current=connected;
  const value=await drivers.mapPorts([],{...ctx,receipt_id:operation.id+':input_mapping'});
  operation.nodeApply.phases.push({phase:'input_mapping',value});
  surface='wizard';await drivers.configureCalculator(ctx,r.parameters);return value;
 },replaceGraph:g=>{current=g;}};
}
test('union node support wires preflight, input_mapping policy and the post-Done topology guard',async()=>{
 const f=nodeSupportFixture(),mapping=await f.configure();
 assert.deepEqual(f.operation.variablesColumnUnionPreflight.graph_before,f.before);
 assert.equal(mapping.verify_topology,true);
 assert.equal(f.operation.nodeApply.phases.find(p=>p.phase==='input_mapping').value.verify_topology,true);
 assert.equal(f.steps.find(s=>s.action.verb==='wizard_step').policy,true);
 const done=await f.drivers.finish('done',f.ctx);
 assert.equal(done.bindings.verified,true);
 assert.equal(f.records.filter(r=>r.phase==='node_variables_union_topology_verified').length,1);
 assert.equal(f.records.some(r=>r.phase==='node_variables_union_topology_failed'),false);
});
test('union production input_mapping journal receipt carries verify_topology true for existing input 2',async()=>{
 const f=nodeSupportFixture(),r=f.operation.parameters;
 Object.assign(r,{operation_id:f.operation.id,contract_revision:'1.0.0',mode:'append_variables',
  read:{ports:[],variable_ports:[0],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:30000,execute_ms:30000,total_ms:60000}});
 delete f.operation.nodeApply;
 await applyNode({request:r,operation:f.operation,handlers:f.handlers,
  drivers:{...f.drivers,verifySource:async()=>({verified:true,cleanup_complete:true,effect_possible:false}),
   prepareTarget:async()=>{await f.drivers.beforeTarget(f.ctx);f.replaceGraph(f.connected);return {verified:true,cleanup_complete:true,node:f.ctx.node};},
   openWizard:async()=>{throw Error('fixture stops after committed input_mapping');}},
  record:async e=>{f.records.push(e);return e;}});
 const receipts=f.records.filter(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='input_mapping');
 assert.equal(receipts.length,1);assert.equal(receipts[0].receipt.value.verify_topology,true);
});
test('union node support throws and records a substituted graph after Done on existing input 2',async()=>{
 const f=nodeSupportFixture();await f.configure();
 const changed=structuredClone(f.connected);changed.variable_links[0].source_port_guid='substituted';f.replaceGraph(changed);
 await assert.rejects(f.drivers.finish('done',f.ctx),/Variables union topology: first two exact links changed/);
 const failures=f.records.filter(r=>r.phase==='node_variables_union_topology_failed');
 assert.equal(failures.length,1);assert.equal(failures[0].operation_id,f.operation.id);
 assert.deepEqual(failures[0].before,f.before);assert.deepEqual(failures[0].after,changed);
 assert.equal(f.records.some(r=>r.phase==='node_variables_union_topology_verified'),false);
});
test('third input accepts three ordered distinct variable sources and keeps bounded early refusals',()=>{
 validateVariablesColumnUnionParameters({},'append_variables',request());
 for(const change of [r=>r.variable_inputs[2].kind='control',r=>r.variable_inputs[2].input=3,r=>r.variable_inputs[2].source=ref('s0'),r=>r.variable_inputs.push({...r.variable_inputs[2],input:3})]){
  const r=request();change(r);assert.throws(()=>validateVariablesColumnUnionParameters({},'append_variables',r));
 }
 const r=request();r.variable_inputs=[];r.parameters={column_union:{mapping:'automatic',disconnect_input:2}};
 validateVariablesColumnUnionParameters(r.parameters,'append_variables',r);
 r.target.kind='new';assert.throws(()=>validateVariablesColumnUnionParameters(r.parameters,'append_variables',r));
});
test('resolution retains the first two reciprocal GUID pairs and ignores only an unconnected third port',()=>{
 const g=graph(),r=request();assert.equal(resolveVariablesColumnUnionInputs(r,g).length,3);
 g.nodes.at(-1).variable_inputs.push({kind:'variables',port:2,port_guid:'in2'});
 g.variable_links.push({source:'s2',target:'u',kind:'variables',input:2,output:0,source_port_guid:'out',target_port_guid:'in2'});
 r.variable_inputs=[];assert.equal(resolveVariablesColumnUnionInputs(r,g).length,3);
 r.parameters={column_union:{mapping:'automatic',disconnect_input:2}};assert.equal(resolveVariablesColumnUnionInputs(r,g).length,2);
 g.variable_links.pop();assert.equal(resolveVariablesColumnUnionInputs(r,g).length,2);
 g.variable_links[0].target_port_guid='wrong';assert.throws(()=>resolveVariablesColumnUnionInputs(r,g));
});
test('three complete inventories retain typed zero and false',()=>{
 const outputs=inputs().map(()=>({complete:true,count:1,variables:[{type:'integer',cell:{type:'integer',is_null:false,value:'0',precision:'exact_integer'}}]}));
 validateVariablesColumnUnionInventory(outputs);outputs[2].complete=false;assert.throws(()=>validateVariablesColumnUnionInventory(outputs));
});
test('post-Done topology verifies retained ports and every reciprocal link before execution',()=>{
 const before=graph(),after=structuredClone(before),r=request();
 after.nodes.at(-1).variable_inputs.push({kind:'variables',port:2,port_guid:'in2'});
 after.variable_links.push({source:'s2',target:'u',kind:'variables',input:2,output:0,source_port_guid:'out',target_port_guid:'in2'});
 const verify=g=>verifyVariablesColumnUnionTopology(before,g,r,inputs());
 assert.equal(verify(after).verified,true);
 for(const change of [g=>g.nodes.at(-1).ref.node_id='other',g=>g.nodes.at(-1).variable_inputs[0].port_guid='new',g=>g.nodes.at(-1).variable_outputs[0].port_guid='new',g=>g.variable_links[0].source_port_guid='new',g=>g.variable_links[1].input=0,g=>g.variable_links.shift(),g=>g.variable_links.push({...g.variable_links[0]}),g=>g.nodes[0].variable_outputs[0].port_guid='new']){
  const bad=structuredClone(after);change(bad);assert.throws(()=>verify(bad),/topology/);
 }
 r.variable_inputs=[];r.parameters={column_union:{mapping:'automatic',disconnect_input:2}};
 const disconnected=structuredClone(after);disconnected.variable_links.pop();
 assert.equal(verifyVariablesColumnUnionTopology(after,disconnected,r,inputs().slice(0,2)).verified,true);
});
test('topology readback refuses any changed ordered value including typed zero, false and empty',()=>{
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,...value}}),node=ref('u');
 const sources=[{input:0,name:'a',label:'a',type:'integer',cell:{type:'integer',is_null:false,value:'0'}},{input:1,name:'b',label:'b',type:'boolean',cell:{type:'boolean',is_null:false,value:false}},{input:2,name:'c',label:'c',type:'string',cell:{type:'string',is_null:false,value:''}}];
 const phases=[phase('input_mapping',{inputs:inputs(),source_fields:sources,verify_topology:true}),phase('configure',{configuration:{mapping:'automatic',node_context:{...node,verified:true}}}),phase('finish',{settings_applied:true}),phase('read',{variable_ports:[{variables:structuredClone(sources)}]})];
 const read=()=>variablesColumnUnionConfigurationReadback({node,phases,operation_id:'op'});assert.equal(read().input_count,3);
 phases[3].value.variable_ports[0].variables[0].cell.value='1';assert.throws(read,/value/);
 phases[3].value.variable_ports[0].variables=structuredClone(sources);phases[3].value.variable_ports[0].variables[1].cell.value=true;assert.throws(read,/value/);
 phases[3].value.variable_ports[0].variables=structuredClone(sources);phases[3].value.variable_ports[0].variables[2].cell.value=null;assert.throws(read,/value/);
});
test('three-input native readback fits the public result and binds the complete ordered source schema',()=>{
 const node=ref('u'),source_fields=inputs().map(i=>({input:i.input,name:'x'+i.input,label:'x'+i.input,type:'integer'}));
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,...value}});
 const phases=[phase('input_mapping',{inputs:inputs().map(i=>({...i,source_port_guid:'out',target_port_guid:'in'+i.input})),source_fields}),
  phase('configure',{configuration:{mapping:'automatic',node_context:{...node,verified:true}}}),phase('finish',{settings_applied:true}),phase('read',{variable_ports:[{variables:source_fields.map(({name,label,type})=>({name,label,type}))}]})];
 const read=()=>variablesColumnUnionConfigurationReadback({node,phases,operation_id:'op'}),result=read();
 assert.equal(result.input_count,3);
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validate(result).valid,true);
 phases[3].value.variable_ports[0].variables.reverse();assert.throws(read,/order\/type\/label/);
});
test('production target adds only the third port, connects it and later removes only its exact link',async()=>{
 const g=graph(),calls=[],r=request();
 const adapter={observe:async()=>structuredClone(g),preflight:async()=>{},positionMatches:()=>true,async mutate(effect){
  calls.push(effect);const p=effect.parameters;
  if(effect.kind==='add_variable_input'){g.nodes.at(-1).variable_inputs.push({kind:'variables',port:p.input,port_guid:'in'+p.input,native_index:2});g.nodes.at(-1).other_ports.push('Input_Var-2');g.nodes.at(-1).other_ports.sort();}
  else if(effect.kind==='connect')g.variable_links.push({...p.edge,source_port_guid:'out',target_port_guid:'in2'});
  else if(effect.kind==='remove_link')g.variable_links=g.variable_links.filter(e=>e.input!==p.edge.input);
  else assert.fail(effect.kind);
  return {status:'SUCCEEDED',cleanup_complete:true};
 }};
 const run=(r,id)=>prepareNodeTarget({request:{document_id:r.document_id,workflow_ref:r.workflow_ref,target:r.target,inputs:[],variable_inputs:r.variable_inputs},operation:{id,deadline:Date.now()+30000,parameters:r},adapter,record:async e=>e});
 const before=structuredClone(g.variable_links);assert.equal((await run(r,'connect')).status,'SUCCEEDED');
 assert.deepEqual(calls.map(c=>c.kind),['add_variable_input','connect']);
 const effect=calls[0],bad=structuredClone(effect.before);bad.nodes.at(-1).variable_inputs.push({kind:'variables',port:2,port_guid:'in2'});bad.nodes[0].label='foreign';
 assert.equal(verifyNodeTargetEffect(effect,bad,()=>true),null);
 r.variable_inputs=[];r.parameters={column_union:{mapping:'automatic',disconnect_input:2}};
 assert.equal((await run(r,'disconnect')).status,'SUCCEEDED');assert.equal(calls.at(-1).kind,'remove_link');
 assert.deepEqual(g.variable_links,before);assert.equal(g.nodes.at(-1).variable_inputs.length,3);
});
