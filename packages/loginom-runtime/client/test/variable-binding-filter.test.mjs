import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariableBindings} from '../lib/variable-binding-parameters.mjs';
import {resolveFilterBindings} from '../lib/filter-bindings.mjs';
import {filterBindingInventory} from '../lib/variable-binding-readback.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';

const binding={parameter:'/groups/0/0/value',variable:{kind:'control',input:0,name:'Limit'}};
const parameters={groups:[[{field:{kind:'input_field',name:'Amount'},operator:'>',type:'integer'}]]};
test('binding supplies one missing scalar operand without changing the caller patch',()=>{
 const before=structuredClone(parameters);
 const resolved=resolveFilterBindings(parameters,[binding]);
 assert.deepEqual(resolved.groups[0][0].value,{kind:'variable',name:'Limit'});
 assert.deepEqual(parameters,before);
});
test('literal and legacy operand conflicts refuse even when equal',()=>{
 for(const value of [5,{kind:'variable',name:'Limit'}]){
  const p=structuredClone(parameters);p.groups[0][0].value=value;
  assert.throws(()=>resolveFilterBindings(p,[binding]),/BINDING_CONFLICT/);
 }
});
test('strict envelope rejects duplicate, unsupported type, port, extra properties and unbind',()=>{
 assert.throws(()=>validateVariableBindings([binding,binding],'transform.filter_data'),/BINDING_CONFLICT/);
 assert.throws(()=>validateVariableBindings([binding],'transform.sorting'),/BINDING_PARAMETER_UNSUPPORTED/);
 for(const variable of [null,{...binding.variable,input:1},{...binding.variable,kind:'variables'},{...binding.variable,name:''},{...binding.variable,extra:true}])
  assert.throws(()=>validateVariableBindings([{...binding,variable}],'transform.filter_data'));
});
test('only canonical scalar pointers and integer/string comparisons are registered',()=>{
 for(const parameter of ['/groups/00/0/value','/groups/0/0/lower','/groups/64/0/value','/groups/0/128/value','/groups/0/0/value/x'])
  assert.throws(()=>resolveFilterBindings(parameters,[{...binding,parameter}]),/BINDING_PARAMETER_UNSUPPORTED/);
 for(const patch of [{type:'real'},{operator:'between'},{field:{kind:'row_number'}}]){
  const p=structuredClone(parameters);Object.assign(p.groups[0][0],patch);
  assert.throws(()=>resolveFilterBindings(p,[binding]),/BINDING_PARAMETER_UNSUPPORTED/);
 }
});
test('omitted groups resolve against saved row identity while omitted bindings preserve the patch',()=>{
 const saved=structuredClone(parameters);saved.groups[0][0].value=5;
 assert.deepEqual(resolveFilterBindings({},[binding],saved).groups[0][0].value,{kind:'variable',name:'Limit'});
 assert.deepEqual(resolveFilterBindings({},[]),{});
 assert.throws(()=>resolveFilterBindings({},[binding]),/BINDING_PARAMETER_UNSUPPORTED/);
});
test('public schema and installed production handler accept the bound slot together',async()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const r={operation_id:'binding',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'new',type:'transform.filter_data',position:{x:320,y:280}},
  inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'source'},input:0,output:0}],
  variable_inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'vars'},input:0,output:4,kind:'control'}],
  mode:'conditions',parameters,bindings:[binding],mappings:[],finish:'execute',read:{ports:[0,1],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const runtime={tools:nodeApiTools,startNodeApply:args=>validateNodeApplyRequest(args,support.nodeApplyHandlers)};
 await dispatchNodeApi(runtime,'dock_node_apply',r);
 assert.equal(support.nodeApplyHandlers.get(r.target.type).binding_schema.items.properties.variable.properties.kind.const,'control');
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...r,bindings:[binding,binding]}),/BINDING_CONFLICT/);
 const conflict=structuredClone(r);conflict.parameters.groups[0][0].value=5;
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',conflict),/BINDING_CONFLICT/);
});
function inventory(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'filter'};
 return {node,native:{verified:true,inventory_complete:true,node_context:node,
  rows:[{kind:'condition',record_id:'native-row',variable_mode:1,type:'integer',value:{kind:'variable',name:'Limit'}}],
  control_variables:[{name:'Limit',index:0,type:'integer',is_null:false}]},
  mapping:{kind:'control',port:0,port_guid:'port',fields:[{id:42,index:0,name:'Limit',type:4,is_null:false,source:{id:9,type:4,name:'Limit'}}]},
  graph:{links:[],variable_links:[{source:'vars',target:'filter',input:0,output:4,kind:'control',source_port_guid:'source-port',target_port_guid:'port'}],nodes:[{ref:{...node,node_id:'vars'},type:'variables.user'}]}};
}
test('independent native variable mode resolves the connected ID, row and port rather than echoing a request',()=>{
 const f=inventory(),b=filterBindingInventory(f.native,f.mapping,f.graph,f.node)[0];
 assert.equal(b.parameter,binding.parameter);assert.equal(b.row_id,'native-row');assert.equal(b.variable.id,42);
 assert.equal(b.source.variable_id,9);assert.equal(b.source.output,4);assert.equal(b.input_port_guid,'port');
});
test('pending native values use a fresh independently read builtin source with exact connected IDs',()=>{
 const f=inventory();f.native.control_variables[0].is_null=true;f.mapping.fields[0].is_null=true;
 const proof={verified:true,independent_readback:true,source:f.graph.nodes[0].ref,variables:[{id:9,name:'Limit',type:'integer',cell:{type:'integer',is_null:false,value:'5',precision:'exact_integer'}}]};
 assert.equal(filterBindingInventory(f.native,f.mapping,f.graph,f.node,proof)[0].variable.is_null,false);
 for(const change of [{id:10},{type:'string'},{cell:{type:'integer',is_null:true,value:null}}]){
  const bad=structuredClone(proof);Object.assign(bad.variables[0],change);
  assert.throws(()=>filterBindingInventory(f.native,f.mapping,f.graph,f.node,bad));
 }
});
for(const fault of ['NULL','type','index','owner','source','duplicate','mode'])test('binding inventory refuses '+fault,()=>{
 const f=inventory();
 if(fault==='NULL')f.native.control_variables[0].is_null=true;
 if(fault==='type')f.mapping.fields[0].type=3;
 if(fault==='index')f.mapping.fields[0].index=1;
 if(fault==='owner')f.native.node_context={...f.node,node_id:'foreign'};
 if(fault==='source')f.mapping.fields[0].source=null;
 if(fault==='duplicate')f.mapping.fields.push(f.mapping.fields[0]);
 if(fault==='mode')f.native.rows[0].variable_mode=128;
 assert.throws(()=>filterBindingInventory(f.native,f.mapping,f.graph,f.node));
});
