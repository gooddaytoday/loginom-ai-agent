import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariableBindings} from '../lib/variable-binding-parameters.mjs';
import {resolveFilterBindings,configureSavedFilterBindings,preserveFilterBindings} from '../lib/filter-bindings.mjs';
import {filterBindingInventory} from '../lib/variable-binding-readback.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {prepareFilterInput,preflightFilterSource} from '../lib/filter-node.mjs';

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
  assert.throws(()=>validateVariableBindings([{...binding,variable}],'transform.filter_data'),variable?.name===''?/BINDING_VARIABLE_MISSING/:/BINDING_PORT_MISMATCH/);
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
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...r,variable_inputs:[]}),/BINDING_PORT_MISMATCH/);
 assert.throws(()=>validateNodeApplyRequest({...r,mode:'read_existing_output'},support.nodeApplyHandlers),/BINDING_PARAMETER_UNSUPPORTED/);
 const handlers=new Map(support.nodeApplyHandlers),unregistered={...handlers.get(r.target.type)};delete unregistered.binding_schema;handlers.set(r.target.type,unregistered);
 assert.throws(()=>validateNodeApplyRequest(r,handlers),/BINDING_PARAMETER_UNSUPPORTED/);
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
  assert.throws(()=>filterBindingInventory(f.native,f.mapping,f.graph,f.node,bad),change.id?/source variable identity/:change.type?/BINDING_TYPE_MISMATCH/:/BINDING_NULL_UNSUPPORTED/);
 }
});
test('an existing literal slot binds by saved row identity with a validated pending source',async()=>{
 const f=inventory();Object.assign(f.native,{input_fields:[{name:'Amount',type:'integer'}]});
 Object.assign(f.native.rows[0],{field:{kind:'input_field',name:'Amount'},operator_code:2,value:0,variable_mode:0,cells:{value:'owned-value'}});
 f.native.control_variables[0].is_null=true;
 const s={wizard:{stage:'row_filter',root_tid:'owned'},node_filter:f.native,ui:{elements:[{tid:'owned-value',ref:'value-ref',allowed_actions:['click']}]}};
 const actions=[];const channel={observe:async o=>{assert.ok(o.ready(s));return structuredClone(s);},perform:async o=>{actions.push(o.resolve(s));throw Error('OWNED_VARIABLE_EDITOR');}};
 await assert.rejects(configureSavedFilterBindings(channel,{},[binding],f.native,{controlVariables:[{name:'Limit',index:0,type:'integer',value:5,is_null:false}]}),/OWNED_VARIABLE_EDITOR/);
 assert.deepEqual(actions,[{verb:'click',ref:'value-ref'}]);
 assert.equal(f.native.rows[0].record_id,'native-row');assert.equal(f.native.rows[0].value,0);
});
test('existing binding preparation requests independent read-only W1 mapping',async()=>{
 const f=inventory(),calls=[],request={target:{kind:'existing'},finish:'done',bindings:[binding],mappings:[],inputs:[],variable_inputs:[],parameters:{}};
 const operation={nodeApply:{request}};
 await prepareFilterInput({operation},{},{channel:{readVariablePortMapping:async m=>{calls.push(m);return {verified:true,cleanup_complete:true,independent_readback:true,mapping:f.mapping};}}});
 assert.deepEqual(calls,[{direction:'input',kind:'control',port:0}]);assert.deepEqual(operation.variableBindingMapping,f.mapping);
});
test('a missing existing control edge refuses before any target or settings mutation',async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'existing',ref:{node_id:'filter'}},finish:'done',bindings:[binding],variable_inputs:[],parameters:{}};
 const operation={parameters:request,nodeTargetAdapter:{observe:async()=>({complete:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[],links:[],variable_links:[]})}};
 await assert.rejects(preflightFilterSource({operation},{deadline:1000},{}),/BINDING_PORT_MISMATCH/);
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
 assert.throws(()=>filterBindingInventory(f.native,f.mapping,f.graph,f.node),{NULL:/BINDING_NULL_UNSUPPORTED/,type:/BINDING_TYPE_MISMATCH/,index:/BINDING_TYPE_MISMATCH/,owner:/node owner/,source:/connected source identity/,duplicate:/unique mapped name/,mode:/unsupported active binding/}[fault]);
});

test('preserveFilterBindings keeps untargeted saved bindings and rejects implicit replacement',()=>{
 const row={kind:'condition',record_id:'keep-row',variable_mode:1,field:{kind:'input_field',name:'Amount'},type:'integer',operator_code:2,value:{kind:'variable',name:'Limit'}};
 const literal={...row,record_id:'target-row',variable_mode:0,value:0};
 const native={rows:[row,literal]},p={groups:[[{field:row.field,type:'integer',operator:'>',value:row.value},{field:row.field,type:'integer',operator:'>'}]]};
 const bindings=[{...binding,parameter:'/groups/0/1/value'}],before=structuredClone(native);
 assert.doesNotThrow(()=>preserveFilterBindings(native,p,bindings));
 p.groups[0][0].value=5;assert.throws(()=>preserveFilterBindings(native,p,bindings),/BINDING_CONFLICT/);
 assert.deepEqual(native,before);
 for(const empty of [undefined,[]])assert.doesNotThrow(()=>preserveFilterBindings(native,p,empty));
});
