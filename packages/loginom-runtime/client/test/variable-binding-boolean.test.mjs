import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariableBindings} from '../lib/variable-binding-parameters.mjs';
import {validateBuiltinBindingSource} from '../lib/variable-binding-source.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateBooleanBinding} from '../lib/variable-binding-parameters.mjs';
import {booleanBindingInventory,readBooleanBindingBrowser} from '../lib/variable-binding-readback.mjs';
import vm from 'node:vm';
import {configureBooleanBinding} from '../lib/variable-binding-procedure.mjs';
import {preflightBooleanBindings,prepareBooleanBindingInput} from '../lib/variable-binding-source.mjs';
import {readBooleanBindings} from '../lib/variable-binding-readback.mjs';
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
function booleanFixture(type='transform.group_data'){
 const grouping=type==='transform.group_data',node={document_id:'doc',workflow_id:'wf',node_id:'node'},source={...node,node_id:'source'};
 const binding={parameter:grouping?'/sort_result':'/compare_with_locale',variable:{kind:'control',input:0,name:'Flag'}};
 const option={switch_pressed:true,binding:{record_id:'chosen',name:'Flag',index:0,type:'boolean',is_null:false},value:false};
 const mapping={kind:'control',port:0,port_guid:'port',fields:[{id:5,index:0,name:'Flag',type:1,is_null:false,source:{id:7,name:'Flag',type:1}}]};
 const proof={verified:true,cleanup_complete:true,independent_readback:true,source,variables:[{id:7,name:'Flag',type:'boolean',cell:{type:'boolean',is_null:false,value:false}}]};
 const graph={complete:true,document_id:'doc',workflow_ref:{workflow_id:'wf'},nodes:[{ref:source,type:'variables.calculator'}],variable_links:[{source:'source',target:'node',kind:'control',input:0,output:4,target_port_guid:'port'}]};
 return {type,node,source,binding,option,mapping,proof,graph,grouping};
}
for(const type of ['transform.group_data','transform.sorting']){
 for(const [label,change,error] of [
  ['missing mapping',f=>f.mapping.fields=[],/BINDING_VARIABLE_MISSING/],['duplicate mapping',f=>f.mapping.fields.push(f.mapping.fields[0]),/BINDING_VARIABLE_MISSING/],
  ['mapped type',f=>f.mapping.fields[0].type=4,/BINDING_TYPE_MISMATCH/],['connected type',f=>f.mapping.fields[0].source.type=4,/BINDING_TYPE_MISMATCH/],
  ['source identity',f=>f.proof.variables[0].id=8,/BINDING_VARIABLE_MISSING/],['source type',f=>f.proof.variables[0].type='integer',/BINDING_TYPE_MISMATCH/],
  ['source cell type',f=>f.proof.variables[0].cell.type='integer',/BINDING_TYPE_MISMATCH/],['source NULL',f=>f.proof.variables[0].cell.is_null=true,/BINDING_NULL_UNSUPPORTED/],
  ['mapped NULL without proof',f=>{f.proof=undefined;f.mapping.fields[0].is_null=true;},/BINDING_NULL_UNSUPPORTED/],
  ['valid reaches owned picker',()=>{},/OWNED_PICKER/]
 ])test(type+' boolean configure guard: '+label,async()=>{
  const f=booleanFixture(type);change(f);const actions=[],stage=f.grouping?'grouping':'sorting',key=f.grouping?'node_grouping':'node_sorting';
  const base='owned;'+(f.grouping?'GroupDataWizard;pedSortResult':'SortingWizard;SortingColumnCollection;chkLocaleAware');
  const state={wizard:{stage,root_tid:'owned',root_ref:'wizard'},[key]:{verified:true},ui:{elements:[{tid:base+';SwitchButton',ref:'switch',allowed_actions:['click']}]}};
  const channel={observe:async s=>{assert.ok(s.ready(state));return state;},perform:async s=>{actions.push(s.resolve(state));throw Error('OWNED_PICKER');}};
  await assert.rejects(configureBooleanBinding(channel,{type,bindings:[f.binding],bindingMapping:f.mapping,bindingSource:f.proof}),error);
  assert.equal(actions.length,label==='valid reaches owned picker'?1:0);
 });
 test(type+' close cannot bind a discarded draft',()=>{const f=booleanFixture(type);assert.throws(()=>validateBooleanBinding({},{target:{type,kind:'existing'},bindings:[f.binding],finish:'close'}),/BINDING_PARAMETER_UNSUPPORTED/);});
}
for(const [label,change,error] of [
 ['incomplete graph',f=>f.graph.complete=false,/BINDING_SOURCE_UNVERIFIED/],['document owner',f=>f.graph.document_id='other',/BINDING_SOURCE_UNVERIFIED/],
 ['workflow owner',f=>f.graph.workflow_ref.workflow_id='other',/BINDING_SOURCE_UNVERIFIED/],['no link',f=>f.graph.variable_links=[],/BINDING_PORT_MISMATCH/],
 ['duplicate link',f=>f.graph.variable_links.push(f.graph.variable_links[0]),/BINDING_PORT_MISMATCH/],['missing source',f=>f.graph.nodes=[],/BINDING_SOURCE_UNVERIFIED/],
 ['duplicate source',f=>f.graph.nodes.push(f.graph.nodes[0]),/BINDING_SOURCE_UNVERIFIED/]
])test('boolean source preflight guard: '+label,async()=>{
 const f=booleanFixture();change(f);const parameters={document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'existing',ref:f.node},bindings:[f.binding]};
 await assert.rejects(preflightBooleanBindings({operation:{parameters,nodeTargetAdapter:{observe:async()=>f.graph}}},{deadline:1000},{}),error);
});
for(const kind of ['new','existing'])for(const fault of [null,'verified','cleanup_complete','independent_readback'])test('boolean '+kind+' preparation requires independent mapping: '+fault,async()=>{
 const f=booleanFixture(),calls=[],result={verified:true,cleanup_complete:true,independent_readback:true,mapping:f.mapping};if(fault)result[fault]=false;
 const operation={nodeApply:{request:{target:{kind},bindings:[f.binding],mappings:[]}}},method=kind==='new'?'mapVariablePort':'readVariablePortMapping';
 const run=()=>prepareBooleanBindingInput({operation},{},{channel:{[method]:async spec=>{calls.push(spec);return result;}}});
 if(fault){await assert.rejects(run(),/BINDING_SOURCE_UNVERIFIED/);assert.equal(operation.variableBindingMapping,undefined);}else{await run();assert.deepEqual(operation.variableBindingMapping,f.mapping);}
 assert.deepEqual(calls,[{direction:'input',kind:'control',port:0}]);
});
function savedBooleanChannel(f,mapped){
 let opened=false;const actions=[],path=[{tid:'wf',label:'Workflow'}],owner={status:'observed',node:{tid:'wf>Node',label:'Node'},path:[...path,{tid:'wf>Node'},{}]};
 const snapshot=()=>({prepared_node_context:{...f.node,verified:true,surface:opened?'wizard':'graph',tid:'graph',locked:false},
  wizard:opened?{status:'observed',stage:f.grouping?'grouping':'sorting',root_ref:'wizard',root_tid:'owned',owner_context:owner}:{status:'absent'},
  [f.grouping?'node_grouping':'node_sorting']:{verified:true,inventory_complete:true,node_context:f.node,options:{[f.grouping?'pedSortResult':'chkLocaleAware']:f.option}},
  ui:{dialogs:[],masks:[],elements:opened?[{tid:'owned;btnClose',ref:'close',allowed_actions:['click']}]:[{tid:'graph;Setting',ref:'open',allowed_actions:['begin_wizard'],wizard_open:{workflow_path:path,node:{node_label:'Node'}}}]}});
 return {actions,observe:async s=>{const state=snapshot();assert.ok(s.ready(state),s.condition);return state;},
  perform:async s=>{const state=snapshot();assert.ok(s.ready(state));const a=s.resolve(state);actions.push(a);opened=a.verb==='begin_wizard';},
  readVariablePortMapping:async spec=>{assert.equal(opened,false);assert.deepEqual(spec,{direction:'input',kind:'control',port:0});return mapped;}};
}
for(const type of ['transform.group_data','transform.sorting'])for(const fault of [null,'verified','cleanup_complete','independent_readback'])test(type+' saved readback requires independent mapping: '+fault,async()=>{
 const f=booleanFixture(type),mapped={verified:true,cleanup_complete:true,independent_readback:true,mapping:f.mapping};if(fault)mapped[fault]=false;
 const channel=savedBooleanChannel(f,mapped),run=()=>readBooleanBindings(channel,{type,node:f.node,readGraph:async()=>f.graph});
 if(fault)await assert.rejects(run(),/independent mapping/);else{const b=(await run())[0];assert.equal(b.verified,true);assert.equal(b.variable.id,5);assert.equal(b.source.variable_id,7);}
 assert.deepEqual(channel.actions.map(a=>a.ref),['open','close']);
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
