import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVariablesCalculatorHistory} from '../variables-calculator.mjs';
const initial=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-calculator/acceptance/expected-initial-run.json',import.meta.url)));
const final=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-calculator/acceptance/expected-run.json',import.meta.url)));
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'calc'};
 const checkpoint=(id,want)=>({phase:'node_checkpoint',result:{operation_id:id,status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'variables_calculator',syntax_validation:'accepted_by_loginom_next',expressions:want.variable_inventory.outputs[0].variables.map((v,index)=>({index,name:v.name,type:v.type,label:v.label,formula:v.name==='limit'?String(v.value):v.name,description:'',intermediate:false}))}},
  output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:8,completeness:{loaded:true,count:8,store_count:8,unique_ids:8},variables:want.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,...v,cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.type==='integer'&&v.value!==null?{precision:'exact_integer'}:v.type==='real'?{precision:'17_significant_digits'}:{})}}))}]}}});
 return [checkpoint('initial',initial),checkpoint('updated',final)];
}
test('calculator audit checks two fresh executions, exact typed native values, order and retained expressions',()=>{
 assert.equal(auditVariablesCalculatorHistory(history(),initial,final).status,'PASS');
 for(const corrupt of [e=>e.shift(),e=>e[1].result.node={node_id:'other'},e=>e[1].result.execution.execution_id='initial',
  e=>e[1].result.output.variable_ports[0].variables.reverse(),e=>e[1].result.output.variable_ports[0].variables[1].cell.value=null,
  e=>e[1].result.output.variable_ports[0].variables[0].id=99,e=>e[1].result.configuration.readback.expressions[1].formula='changed',
  e=>e[1].result.output.variable_ports[0].variables[5].cell.value=0.13]){
  const e=history();corrupt(e);assert.throws(()=>auditVariablesCalculatorHistory(e,initial,final));
 }
});
