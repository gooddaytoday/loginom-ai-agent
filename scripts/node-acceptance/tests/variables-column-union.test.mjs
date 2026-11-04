import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVariablesColumnUnionHistory} from '../variables-column-union.mjs';
const load=name=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-coluniondatavar/acceptance/expected-'+name+'-run.json',import.meta.url)));
const initial=load('initial'),updated=load('updated');
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'u'},inputs=[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input}}));
 const checkpoint=(id,expected)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'variables_column_union',mapping:'automatic',input_count:2,inputs,mapping_fields:[{input:0,source_name:'a0',output_name:'a0'}]}},
  output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:12,
   completeness:{loaded:true,count:12,store_count:12,unique_ids:12},variables:expected.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,name:v.name,label:v.label,type:v.type,
    cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.type==='integer'&&v.value!==null?{precision:'exact_integer'}:v.type==='real'?{precision:'17_significant_digits'}:{})}}))}]}}});
 return [checkpoint('first',initial),{phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:inputs[1].source,execution:{status:'completed'},configuration:{readback:{kind:'variables_calculator',expressions:[{name:'a0',formula:'41'}]}}}},checkpoint('second',updated)];
}
test('union audit requires both complete ordered outputs, source patch, unchanged identities and input links',()=>{
 assert.equal(auditVariablesColumnUnionHistory(history(),initial,updated).status,'PASS');
 for(const corrupt of [e=>e.shift(),e=>e.splice(1,1),e=>e[2].result.node={node_id:'foreign'},e=>e[2].result.output.variable_ports[0].variables.reverse(),
  e=>e[2].result.output.variable_ports[0].variables[6].cell.value='29',e=>e[2].result.output.variable_ports[0].variables[0].id=99,
  e=>e[2].result.configuration.readback={...e[2].result.configuration.readback,inputs:[]},e=>e[2].result.execution.execution_id='first']){
  const events=history();corrupt(events);assert.throws(()=>auditVariablesColumnUnionHistory(events,initial,updated));
 }
 const events=history();events[2].result.output.variable_ports[0].variables[10].cell.value+=5e-13;
 assert.equal(auditVariablesColumnUnionHistory(events,initial,updated).status,'PASS');
 events[2].result.output.variable_ports[0].variables[10].cell.value+=1e-7;
 assert.throws(()=>auditVariablesColumnUnionHistory(events,initial,updated));
});
