import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariablesColumnUnionParameters,resolveVariablesColumnUnionInputs,validateVariablesColumnUnionInventory} from '../lib/variables-coluniondatavar-parameters.mjs';
import {prepareNodeTarget,verifyNodeTargetEffect} from '../lib/node-target.mjs';
import {variablesColumnUnionConfigurationReadback} from '../lib/variables-coluniondatavar-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
const inputs=()=>[0,1,2].map(input=>({kind:'variables',input,output:0,source:ref('s'+input)}));
const request=()=>({document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'variables.column_union',ref:ref('u')},inputs:[],mappings:[],variable_inputs:inputs(),finish:'execute',read:{ports:[],variable_ports:[0]},parameters:{}});
function graph(){return {complete:true,dom_epoch:1,document_id:'doc',workflow_ref:workflow,nodes:[...inputs().map(i=>({ref:i.source,type:'variables.calculator',label:'Source '+i.input,inputs:[],outputs:[],variable_outputs:[{kind:'variables',port:0,port_guid:'out'}]})),{ref:ref('u'),type:'variables.column_union',label:'Union',locked:false,inputs:[],outputs:[],variable_inputs:[0,1].map(port=>({kind:'variables',port,port_guid:'in'+port})),variable_outputs:[{kind:'variables',port:0,port_guid:'out'}]}],links:[],foreign_links:[],variable_links:inputs().slice(0,2).map(i=>({source:i.source.node_id,target:'u',kind:'variables',input:i.input,output:0,source_port_guid:'out',target_port_guid:'in'+i.input}))};}
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
  if(effect.kind==='add_variable_input')g.nodes.at(-1).variable_inputs.push({kind:'variables',port:p.input,port_guid:'in'+p.input});
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
