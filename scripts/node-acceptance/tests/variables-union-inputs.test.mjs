import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVariablesUnionInputs,auditVariablesUnionInputsCold} from '../variables-union-inputs.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-coluniondatavar/acceptance/expected-inputs-'+n+'-run.json',import.meta.url)));
const connected=load('connected'),disconnected=load('disconnected');
function history(){
 const node={document_id:'d',workflow_id:'w',node_id:'u'},inputs=[0,1,2].map(input=>({input,kind:'variables',output:0,source:{...node,node_id:'s'+input},source_port_guid:'out',target_port_guid:'in'+input}));
 const request=(kind,variable_inputs,parameters={})=>({phase:'node_apply_prepared',request:{target:{kind,type:'variables.column_union',ref:node},variable_inputs,parameters}});
 const checkpoint=(id,expected,count)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},configuration:{readback:{kind:'variables_column_union',mapping:'automatic',input_count:count,inputs:inputs.slice(0,count)}},output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:expected.variable_inventory.outputs[0].variables.length,completeness:{loaded:true,count:count===3?5:4,store_count:count===3?5:4,unique_ids:count===3?5:4},variables:expected.variable_inventory.outputs[0].variables.map((v,index)=>({...v,id:index,index,cell:{type:v.type,is_null:false,value:v.type==='integer'?String(v.value):v.value,...(v.type==='integer'?{precision:'exact_integer'}:{})}}))}]}}});
 return [request('new',inputs.slice(0,2)),checkpoint('initial',disconnected,2),request('existing',inputs),checkpoint('third',connected,3),request('existing',[],{column_union:{mapping:'automatic',disconnect_input:2}}),checkpoint('final',disconnected,2),{phase:'node_target_checkpoint',target_state:{completed:true,final_graph:{nodes:[...inputs.map(i=>({ref:i.source,type:'variables.calculator',label:'Source '+i.input})),{ref:node,type:'variables.column_union',label:'Union',variable_inputs:inputs}],variable_links:inputs.slice(0,2).map(i=>({target:'u',kind:'variables',input:i.input}))}}}];
}
test('input-cycle oracle requires three full typed reads, stable node and first two GUID pairs, explicit removal',()=>{
 assert.equal(auditVariablesUnionInputs(history(),connected,disconnected).status,'PASS');
 for(const change of [e=>e.splice(1,1),e=>e[3].result.output.variable_ports[0].variables.reverse(),e=>e[5].result.node={node_id:'new'},e=>e[5].result.configuration.readback.inputs[0]={input:0},e=>e[4].request.parameters={},e=>e[2].request.target.kind='new',e=>e[6].target_state.final_graph.variable_links.push({input:2,target:'u',kind:'variables'}),e=>e[3].result.output.variable_ports[0].variables.at(-1).cell.value='1']){
  const events=structuredClone(history());change(events);assert.throws(()=>auditVariablesUnionInputs(events,connected,disconnected));
 }
});

test('cold reuses stock link matching and must retain saved node and both native GUID pairs',()=>{
 const proof=auditVariablesUnionInputs(history(),connected,disconnected);
 const cold={status:'PASS',settingsReapplied:false,cleanup:{package_closed:true,logged_out:true},variable_inventory:{outputs:[{node:proof.node}],links:proof.inputs.map(i=>({source:i.source.node_id,target:proof.node.node_id,kind:i.kind,input:i.input,output:i.output,source_port_guid:i.source_port_guid,target_port_guid:i.target_port_guid}))}};
 assert.equal(auditVariablesUnionInputsCold(proof,cold).status,'PASS');
 for(const change of [c=>c.settingsReapplied=true,c=>c.cleanup.logged_out=false,c=>c.variable_inventory.outputs[0].node={node_id:'other'},c=>c.variable_inventory.links[0].source_port_guid='other']){const c=structuredClone(cold);change(c);assert.throws(()=>auditVariablesUnionInputsCold(proof,c));}
});
