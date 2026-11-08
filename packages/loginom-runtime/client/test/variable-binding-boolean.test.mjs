import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariableBindings} from '../lib/variable-binding-parameters.mjs';
import {validateBuiltinBindingSource} from '../lib/variable-binding-source.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateBooleanBinding} from '../lib/variable-binding-parameters.mjs';
import {booleanBindingInventory,readBooleanBindingBrowser} from '../lib/variable-binding-readback.mjs';
import vm from 'node:vm';
for(const [type,parameter,mode] of [['transform.group_data','/sort_result','aggregate'],['transform.sorting','/compare_with_locale','keys']]){
 const binding={parameter,variable:{kind:'control',input:0,name:'Flag'}};
 test(type+' registers one boolean parameter and describes its binding',()=>{
  assert.doesNotThrow(()=>validateVariableBindings([binding],type));
  const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
  assert.equal(support.nodeApplyHandlers.get(type).binding_schema.items.properties.parameter.const,parameter);
  assert.throws(()=>validateVariableBindings([{...binding,parameter:parameter+'/x'}],type),/BINDING_PARAMETER_UNSUPPORTED/);
 });
 test(type+' source refuses a nonboolean and NULL before target mutation',()=>{
  const r={target:{type},bindings:[binding],parameters:{},mappings:[]};
  const proof={variables:[{name:'Flag',id:7,type:'boolean',cell:{type:'boolean',value:false,is_null:false}}]};
  assert.doesNotThrow(()=>validateBuiltinBindingSource(proof,r));
  proof.variables[0].type='integer';assert.throws(()=>validateBuiltinBindingSource(proof,r),/BINDING_TYPE_MISMATCH/);
  proof.variables[0].type='boolean';proof.variables[0].cell.is_null=true;
  assert.throws(()=>validateBuiltinBindingSource(proof,r),/BINDING_NULL_UNSUPPORTED/);
 });
 test(type+' source-only rerun executes saved settings without applying a wizard',()=>{
  const r={target:{type,kind:'existing'},mode,finish:'execute',inputs:[],mappings:[],parameters:{}};
  const handler=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyHandlers.get(type);
  assert.equal(isUnchangedTransformExecution(r,handler),true);
  assert.equal(isUnchangedTransformExecution(r),false);
  assert.equal(isUnchangedTransformExecution({...r,bindings:[binding]}),false);
 });
 test(type+' rejects literal conflict, duplicate and wrong port',()=>{
  const r={target:{type,kind:'new'},bindings:[binding],variable_inputs:[{kind:'control',input:0}],finish:'done'};
  assert.doesNotThrow(()=>validateBooleanBinding({},r));
  assert.throws(()=>validateBooleanBinding({[parameter.slice(1)]:false},r),/BINDING_CONFLICT/);
  assert.throws(()=>validateBooleanBinding({},{...r,variable_inputs:[]}),/BINDING_PORT_MISMATCH/);
  assert.throws(()=>validateVariableBindings([binding,binding],type),/BINDING_CONFLICT/);
 });
}
test('boolean inventory verifies persisted selection against mapped IDs, owner, source and NULL',()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'group'},source={...node,node_id:'source'};
 const native={verified:true,inventory_complete:true,node_context:node,options:{pedSortResult:{switch_pressed:true,binding:{name:'Flag',index:0,type:'boolean',is_null:true,record_id:'selected'}}}};
 const mapping={kind:'control',port:0,port_guid:'port',fields:[{id:5,index:0,name:'Flag',type:1,is_null:true,source:{id:9,name:'Flag',type:1}}]};
 const graph={nodes:[{type:'variables.user',ref:source}],variable_links:[{source:'source',target:'group',kind:'control',input:0,output:4,target_port_guid:'port'}]};
 const proof={verified:true,cleanup_complete:true,independent_readback:true,source,variables:[{id:9,name:'Flag',type:'boolean',cell:{type:'boolean',is_null:false,value:false}}]};
 const read=()=>booleanBindingInventory(native,mapping,graph,node,proof,'transform.group_data');
 assert.equal(read()[0].variable.id,5);assert.equal(read()[0].source.variable_id,9);
 proof.variables[0].cell.is_null=true;assert.throws(read,/BINDING_NULL_UNSUPPORTED/);proof.variables[0].cell.is_null=false;
 mapping.fields[0].source.id=10;assert.throws(read,/source variable identity/);mapping.fields[0].source.id=9;
 mapping.fields[0].type=4;assert.throws(read,/BINDING_TYPE_MISMATCH/);mapping.fields[0].type=1;
 graph.variable_links[0].target_port_guid='foreign';assert.throws(read,/source endpoint/);
});
test('browser boolean reader requires one visible owned selected native record and ignores hidden literal',()=>{
 const root={contains:e=>e.owned},element={owned:true,checkVisibility:()=>true,id:'combo'};
 const variable={Index:0,DisplayName:'Flag',DataType:1,IsNull:false,Value:false};
 const record={internalId:'chosen',data:{field1:5},get:()=>variable,getFields:()=>[{}, {},{getName:()=> 'native'}]};
 const rows=[record],store={isLoading:()=>false,getData:()=>({items:rows})},c={el:{dom:element},getValue:()=>5,getStore:()=>store};
 const context={document:{querySelectorAll:()=>[element]},Ext:{getCmp:()=>c},root};
 const read=()=>vm.runInNewContext('('+readBooleanBindingBrowser.toString()+')("base",root)',context);
 assert.equal(read().value,false);assert.equal(read().name,'Flag');
 rows.push(record);assert.equal(read(),null);rows.pop();element.owned=false;assert.equal(read(),null);
});
