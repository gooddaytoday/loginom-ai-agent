import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVariablesReplaceHistory,auditVariablesReplaceMatch} from '../variables-replace.mjs';
import {matchVariableInventoryOutput,parseExpectedOutputs} from '../expected-outputs.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-replace/acceptance/'+name,import.meta.url)));
const wants=['expected-initial-run.json','expected-updated-run.json','expected-run.json'].map(read);
const rules=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-replace/fixtures/rules.json',import.meta.url))).initial.map(r=>({variable:{kind:'input_variable',name:r.name},type:r.type,pairs:r.pairs,other:'keep',...(r.type==='string'?{case_sensitive:true}:['integer','real'].includes(r.type)?{precision:0}:{})}));
test('match fixture is accepted by the stock cold-check expected parser',()=>{
 const expected=read('modes/expected-run.json');expected.package_path='/own/match.lgp';
 assert.doesNotThrow(()=>parseExpectedOutputs(expected));
 assert.deepEqual(expected.nodes.map(n=>n.type),['variables.user','variables.replace']);
});
function history(){
 const checkpoint=(phase)=>{const id='run'+phase,vs=wants[phase].variable_inventory.outputs[0].variables,rs=structuredClone(rules);if(phase)rs[0].pairs=[{from:2,to:8}];
  return {phase:'node_checkpoint',result:{operation_id:id,status:'SUCCEEDED',cleanup_complete:true,node:{document_id:'d',workflow_id:'w',node_id:'replacement'},execution:{status:'completed',execution_id:id},
   configuration:{readback:{kind:'variables_replace',rules:rs}},output:{variable_ports:[{kind:'variables',port:0,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,read_id:id,execution_id:id,count:10,completeness:{loaded:true,count:10,store_count:10,unique_ids:10},
    variables:vs.map((v,index)=>({id:index,index,...v,cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.type==='integer'&&v.value!==null?{precision:'exact_integer'}:v.type==='real'?{precision:'17_significant_digits'}:{})}}))}]}}};};
 return [checkpoint(0),{phase:'node_apply_prepared',request:{target:{type:'variables.replace',kind:'existing'},mode:'exact',parameters:{rules:[{variable:{kind:'input_variable',name:'Count'}}]}}},checkpoint(1),
  {phase:'node_apply_prepared',request:{target:{type:'variables.calculator',kind:'existing'},parameters:{expressions:[{target:{kind:'existing',name:'Color'},formula:'"blue"'}]}}},
  {phase:'node_apply_prepared',request:{target:{type:'variables.replace',kind:'existing'},mode:'exact',parameters:{}}},checkpoint(2)];
}
test('replacement audit requires three fresh executions, exact order, retained rules, partial patch and source-only refresh',()=>{
 assert.equal(auditVariablesReplaceHistory(history(),...wants).status,'PASS');
 for(const corrupt of [es=>es.shift(),es=>es[2].result.output.variable_ports[0].variables.reverse(),es=>es[2].result.configuration.readback.rules[1].pairs=[],
  es=>es[4].request.parameters={rules:[rules[0]]},es=>es[3].request.parameters.expressions[0].formula='"red"',es=>es[5].result.output.variable_ports[0].variables[7].cell.value='']){
  const es=history();corrupt(es);assert.throws(()=>auditVariablesReplaceHistory(es,...wants));
 }
});
test('replacement real output tolerance is bounded at abs/rel 1e-12',()=>{
 const output=history()[0].result.output.variable_ports[0],want=wants[0].variable_inventory.outputs[0];
 output.variables[1].cell.value+=1e-13;assert.equal(matchVariableInventoryOutput(output,want),true);
 output.variables[1].cell.value+=1e-8;assert.throws(()=>matchVariableInventoryOutput(output,want));
});
test('match audit requires full typed execution and observed native mode settings',()=>{
 const expected=read('modes/expected-run.json'),want=expected.variable_inventory.outputs[0];
 const nativeRules=[{variable:{name:'Color'},case_sensitive:false},
  {variable:{name:'Code'},regex_pairs:[{pattern:'^Ab-[0-9]+$',replacement:'matched'}]},
  {variable:{name:'Amount'},precision:0.1},{variable:{name:'Other'},other:'null'}];
 const event=history()[0];
 event.result.configuration.readback={kind:'variables_replace',mode:'rules',rules:nativeRules};
 const port=event.result.output.variable_ports[0];
 port.variables=want.variables.map((v,index)=>({id:index,index,...v,cell:{type:v.type,is_null:v.value===null,
  value:v.type==='integer'?String(v.value):v.value,precision:v.type==='integer'?'exact_integer':v.type==='real'?'17_significant_digits':v.type==='datetime'?'millisecond':'exact_string',...(v.type==='datetime'?{representation:'local_datetime',timezone:'unspecified'}:{})}}));
 port.count=8;port.completeness={loaded:true,count:8,store_count:8,unique_ids:8};
 assert.equal(auditVariablesReplaceMatch([event],expected).status,'PASS');
 for(const corrupt of [e=>e.result.configuration.readback.rules[0].case_sensitive=true,
  e=>e.result.output.variable_ports[0].variables.reverse(),
  e=>e.result.output.variable_ports[0].variables[7].cell.value='',
  e=>e.result.output.variable_ports[0].variables[0].label='report_date Замена',
  e=>e.result.output.variable_ports[0].execution_id='old']){
  const changed=structuredClone(event);corrupt(changed);assert.throws(()=>auditVariablesReplaceMatch([changed],expected));
 }
});
