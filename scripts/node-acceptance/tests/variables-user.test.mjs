import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditUserVariableHistory} from '../expected-outputs.mjs';
const initial=JSON.parse(readFileSync(new URL('../../../docs/node-development/variables/acceptance/expected-user-initial.json',import.meta.url)));
const final=JSON.parse(readFileSync(new URL('../../../docs/node-development/variables/acceptance/expected-user.json',import.meta.url)));
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'user'};
 const snapshot=(id,expected)=>({phase:'node_checkpoint',result:{operation_id:id,status:'SUCCEEDED',cleanup_complete:true,node,
  execution:{status:'not_requested',execution_id:null},output:{variable_ports:[{kind:'variables',port:4,complete:true,fresh:true,source:'snapshot',native_source:'VariablesEditValuesWizard',package_modified:false,execution_id:null,read_id:id,
   count:7,completeness:{loaded:true,count:7,store_count:7,unique_ids:7},variables:expected.variable_inventory.outputs[0].variables.map((v,i)=>({id:i,...v,cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.type==='integer'&&v.value!==null?{precision:'exact_integer'}:{})}}))}]}}});
 return [snapshot('initial',initial),{phase:'node_apply_prepared',operation_id:'patch',request:{target:{type:'variables.user',kind:'existing',ref:node},mode:'values',parameters:{variables:[{name:'limit',type:'integer',value:5},{name:'skip',type:'integer',value:10}]}}},
  {phase:'node_checkpoint',result:{operation_id:'patch',status:'SUCCEEDED',configuration:{readback:{values_are:'independent_owned_user_variables'}}}},snapshot('updated',final),snapshot('reread',final)];
}
test('variables-user audit requires observed initial values, name-only patch and independent exact rereads',()=>{
 assert.equal(auditUserVariableHistory(history(),initial,final).status,'PASS');
 for(const corrupt of [e=>e.splice(0,1),e=>e.pop(),e=>e[1].request.parameters.variables.push({name:'sentinel',type:'string',value:'keep'}),
  e=>e[2].result.status='FAILED',e=>e[4].result.output.variable_ports[0].read_id='updated',e=>e[4].result.output.variable_ports[0].execution_id='fake',
  e=>e[4].result.output.variable_ports[0].variables[0].id=99,e=>e[4].result.output.variable_ports[0].variables[5].cell.value=0,
  e=>e[4].result.node={document_id:'other',workflow_id:'wf',node_id:'user'},e=>e.splice(4,0,structuredClone(e[1]))]){
  const events=history();corrupt(events);assert.throws(()=>auditUserVariableHistory(events,initial,final));
 }
});
