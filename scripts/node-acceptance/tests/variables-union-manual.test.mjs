import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVariablesUnionManual} from '../variables-union-manual.mjs';
const load=phase=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-coluniondatavar/acceptance/expected-manual-'+phase+'-run.json',import.meta.url)));
const initial=load('initial'),updated=load('updated');
function history(){
 const node={document_id:'d',workflow_id:'w',node_id:'u'},inputs=[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input}}));
 const fields=initial.variable_inventory.outputs[0].variables.map((v,i)=>({input:1-i,source:'amount',name:v.name,label:v.label,type:v.type}));
 const checkpoint=(id,expected)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'variables_column_union',mapping:'manual',input_count:2,inputs,fields,mapping_fields:fields.map(f=>({input:f.input,source_name:f.source,output_name:f.name}))}},
  output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:2,completeness:{loaded:true,count:2,store_count:2,unique_ids:2},
   variables:expected.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,name:v.name,label:v.label,type:v.type,cell:{type:v.type,is_null:false,value:v.type==='integer'?String(v.value):v.value,...(v.type==='integer'?{precision:'exact_integer'}:{})}}))}]}}});
 return [checkpoint('first',initial),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.calculator',ref:inputs[1].source},parameters:{expressions:[{target:{kind:'existing',name:'amount'},formula:'23'}]}}},
  {phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.column_union',ref:node},parameters:{},mappings:[],variable_inputs:[]}},checkpoint('second',updated)];
}
test('manual oracle requires full typed ordered results, retained IDs, source-only patch and fresh execution',()=>{
 assert.equal(auditVariablesUnionManual(history(),initial,updated).status,'PASS');
 for(const change of [e=>e.shift(),e=>e.splice(1,1),e=>e[1].request.target.ref={node_id:'left'},
  e=>e[1].request.parameters.expressions.push({target:{name:'empty'},formula:'"x"'}),e=>e[2].request.parameters={column_union:{mapping:'manual'}},
  e=>e[3].result.node={node_id:'other'},e=>e[3].result.execution.execution_id='first',
  e=>e[3].result.output.variable_ports[0].variables.reverse(),e=>e[3].result.output.variable_ports[0].variables[1].cell.value='7,0',
  e=>e[3].result.output.variable_ports[0].variables[0].id=99,e=>e[3].result.configuration.readback={...e[3].result.configuration.readback,inputs:[]}]){
  const events=history();change(events);assert.throws(()=>auditVariablesUnionManual(events,initial,updated));
 }
});
