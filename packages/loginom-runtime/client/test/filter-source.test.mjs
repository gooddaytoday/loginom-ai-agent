import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightFilterSource,createFilterNodeSupport} from '../lib/filter-node.mjs';
import {readFilterBindings} from '../lib/variable-binding-readback.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

const ref={document_id:'doc',workflow_id:'flow',node_id:'source'};
function fixture({existing=false,type='variables.user',complete=true,finish='execute'}={}){
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow'},target:existing?{kind:'existing',ref:{...ref,node_id:'filter'}}:{kind:'new'},
  variable_inputs:existing?[]:[{source:ref,output:type==='variables.user'?4:0,input:0,kind:'control'}],parameters:{},finish};
 const graph={complete,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[{ref,type}],links:existing?[{source:'source',target:'filter',kind:'control',input:0,output:4}]:[]};
 let reads=0;
 return {run:()=>preflightFilterSource({operation:{parameters:request,nodeTargetAdapter:{observe:async()=>{reads++;return graph;}}}}, {deadline:1000},{}),reads:()=>reads};
}
for(const existing of [false])test('new builtin filter source refuses without explicit bindings '+existing,async()=>{
 const f=fixture({existing});await assert.rejects(f.run(),e=>{
  assert.match(e.message,/Builtin Scenario variables output 4 is inactive/);
  assert.doesNotMatch(e.message,/Filter variable type or NULL differs/);
  assert.deepEqual(e.nodePhaseRefusal,{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});return true;
 });assert.equal(f.reads(),1);
});
for(const bindings of [undefined,[]])for(const patch of [{finish:'done'},{mappings:[{direction:'output',port:0,autosync:false}]},{variable_inputs:[{source:ref,output:4,input:0,kind:'control'}]}])test('existing builtin binding survives an omitted patch '+JSON.stringify({bindings,patch}),async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow'},target:{kind:'existing',type:'transform.filter_data',ref:{...ref,node_id:'filter'}},mode:'conditions',finish:'execute',parameters:{},inputs:[],mappings:[],variable_inputs:[],bindings,...patch};
 const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[{ref,type:'variables.user'}],variable_links:[{source:'source',target:'filter',kind:'control',input:0,output:4}]};
 const result=await preflightFilterSource({operation:{parameters:request,nodeTargetAdapter:{observe:async()=>graph}}},{},{});
 assert.equal(result.verified,true);
});
for(const type of ['variables.from_table','variables.calculator'])test('executed variable source is admitted '+type,async()=>{
 const f=fixture({type});assert.equal((await f.run()).verified,true);assert.equal(f.reads(),1);
});
test('incomplete graph refuses before interpreting source identity',async()=>{
 await assert.rejects(fixture({complete:false}).run(),/Complete filter control source graph required/);
});
test('Close retains disposal path without inspecting or executing builtin',async()=>{
 const f=fixture({finish:'close'});assert.equal((await f.run()).verified,true);assert.equal(f.reads(),0);
});
for(const existing of [false])test('empty bindings cannot admit new builtin legacy operands '+existing,async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow'},target:existing?{kind:'existing',ref:{...ref,node_id:'filter'}}:{kind:'new'},finish:'done',bindings:[],mappings:[],inputs:[],
  parameters:{groups:[[{field:{kind:'input_field',name:'Amount'},type:'integer',operator:'>',value:{kind:'variable',name:'Limit'}}]]},variable_inputs:existing?[]:[{kind:'control',input:0,output:4,source:ref}]};
 const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[{ref,type:'variables.user'}],links:[],variable_links:[{source:'source',target:'filter',kind:'control',input:0,output:4}]};
 const options={operation:{parameters:request,nodeTargetAdapter:{observe:async()=>graph}}};
 await assert.rejects(preflightFilterSource(options,{},{}),e=>e.nodePhaseRefusal?.status==='NOT_APPLIED'&&e.nodePhaseRefusal.effect_possible===false);
 request.bindings=[{parameter:'/groups/0/1/value',variable:{kind:'control',input:0,name:'Other'}}];
 request.parameters.groups[0].push({field:{kind:'input_field',name:'Amount'},type:'integer',operator:'>'});
 await assert.rejects(preflightFilterSource(options,{},{}),e=>e.nodePhaseRefusal?.status==='NOT_APPLIED'&&e.nodePhaseRefusal.effect_possible===false);
});

function savedBuiltin({active=true,bindings,variable=true}={}){
 const node={document_id:'doc',workflow_id:'wf',node_id:'filter'},source={...node,node_id:'vars'};
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const field={kind:'input_field',name:'Amount'},condition={field,type:'integer',operator:'>',value:{kind:'variable',name:'Limit'}};
 const r={document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'transform.filter_data',ref:node},mode:'conditions',finish:'done',inputs:[],variable_inputs:[],mappings:[],bindings,
  parameters:{groups:[[condition,{field,type:'integer',operator:'<',value:20}]]}};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:source,type:'variables.user',variable_outputs:[{kind:'variables',port:4,port_guid:'source-port'}]}],
  variable_links:[{source:'vars',target:'filter',kind:'control',input:0,output:4,source_port_guid:'source-port',target_port_guid:'input'}]};
 const mapping={kind:'control',port:0,port_guid:'input',fields:[{index:0,name:'Limit',id:7,type:4,is_null:false,source:{name:'Limit',id:9,type:4}}]};
 const variables=[{id:9,name:'Limit',type:'integer',cell:{type:'integer',is_null:false,value:'5',precision:'exact_integer'}}];
 const owner={status:'observed',node:{tid:'flow>Filter',label:'Filter'},path:[...workflow.navigation_path,{tid:'flow>Filter',label:'Filter'},{tid:'flow>Filter>Settings',label:'Settings'}]};
 const actions=[],records=[];let opened=false,pending,stopAtEdit=false;
 const n=()=>({...node,verified:true,surface:opened?'wizard':'graph',locked:false,tid:opened?'W':'N'});
 const native={verified:true,inventory_complete:true,input_fields:[{name:'Amount',type:'integer'}],control_variables:[{name:'Limit',index:0,type:'integer',value:5,is_null:false}],editor:null,dialogs:[],
  rows:[{kind:'condition',record_id:'bound',variable_mode:variable?1:0,field,type:'integer',operator_code:2,value:variable?condition.value:5,cells:{delete:'delete'}}]};
 const state=()=>({origin:'https://app.loginom.ai',loginom_build:'7.4.2',workflow_ref:workflow,scan:{complete:true},dom_epoch:{document:'dom',revision:1},prepared_node_context:n(),
  wizard:opened?{status:'observed',stage:'row_filter',root_ref:'ui-W',root_tid:'W',owner_context:owner}:{status:'absent'},
  ui:{dialogs:[],masks:[],truncated:{masks:false,dialogs:false},elements:opened?[{ref:'ui-cancel',tid:'W;btnClose',allowed_actions:['click']},
   {ref:'ui-delete',tid:'delete',allowed_actions:['click'],interaction:{state:'point_observed',point:{y:12}},bounding_box:{y:0,height:24}}]:[
   {ref:'ui-settings',tid:'N;Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Filter'},workflow_path:workflow.navigation_path}}]}});
 const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+60000};
 const operation={id:'saved-filter',deadline:ctx.deadline,action:{action_key:'node.apply',revision:'1'},parameters:r,nodeApply:{request:r,node,phases:[]},nodeTargetAdapter:{observe:async()=>structuredClone(graph)}};
 const options={operation,now:Date.now,receiptOptions:()=>({}),onRecord:async e=>{
  records.push(e);if(e.phase==='node_step_prepared'){if(stopAtEdit)throw Error('EDIT_READY');pending=e;}return structuredClone(e);
 },execute:async code=>{
  if(!pending)return code.includes('async function readFilterContext(')?{...structuredClone(native),node_context:n()}:{status:'SUCCEEDED',output:state()};
  const step=pending;pending=null;const action=step.action;actions.push(action.verb);
  if(action.verb.startsWith('user_')||action.verb==='variable_mapping_read'){
   if(action.verb==='user_values')assert.equal(active,false,'active builtin must never enter Values settings');
   const output={verified:true,cleanup_complete:true,effect_possible:false,independent_readback:true,settings_applied:false,
    node_context:action.verb==='variable_mapping_read'?node:source,
    ...(action.verb==='variable_mapping_read'?{mapping}:{source_active:active,variables:structuredClone(variables)})};
   if(action.verb==='user_runtime_read'&&!active){output.independent_readback=false;delete output.variables;}
   return {status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'node.variables.'+action.verb+'.internal',cleanup_complete:true,effect_possible:false,output};
  }
  if(action.verb==='begin_wizard')opened=true;else if(action.verb==='click'&&action.ref==='ui-cancel')opened=false;else assert.fail('Unexpected gesture '+JSON.stringify(action));
  return {status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,error:null,trace:[]};
 }};
 const config={targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'};
 return {r,native,graph,options,ctx,config,actions,records,
  configure:()=>{opened=true;stopAtEdit=true;return createFilterNodeSupport(config).nodeApplyDriverFactory(options).configureCalculator(ctx,r.parameters);},
  read:proof=>readFilterBindings(createNodeProcedure({...options,record:options.onRecord,...config,wrapMutation:code=>code,maxSteps:100,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node}}),{readGraph:async()=>graph,sourceProof:proof})};
}
for(const bindings of [undefined,[]])for(const active of [true,false])test('existing builtin admits the same saved legacy row, preserving the source '+JSON.stringify({bindings,active}),async()=>{
 const f=savedBuiltin({bindings,active});
 assert.equal((await preflightFilterSource(f.options,f.ctx,f.config)).verified,true);
 assert.ok(f.options.operation.variableBindingSource.verified);
 if(active)assert.ok(!f.actions.includes('user_values'));
 f.native.rows.push({...f.native.rows[0],record_id:'other',variable_mode:0,operator_code:0,value:20});
 const inventory=await f.read(f.options.operation.variableBindingSource);
 assert.equal(inventory.length,1);assert.equal(inventory[0].parameter,'/groups/0/0/value');assert.equal(inventory[0].variable.name,'Limit');assert.equal(inventory[0].source.ref.node_id,'vars');
});
for(const fault of ['name','position','unbound'])test('builtin refuses a legacy operand outside its saved binding: '+fault,async()=>{
 const f=savedBuiltin({variable:fault!=='unbound'});
 if(fault==='name')f.r.parameters.groups[0][0].value={kind:'variable',name:'Other'};
 if(fault==='position')f.r.parameters.groups[0].unshift({...f.r.parameters.groups[0][1]});
 await assert.rejects(preflightFilterSource(f.options,f.ctx,f.config),/omit groups, or resend the bound row without value via `bindings`/);
 assert.ok(!f.actions.includes('user_values'));
});
for(const kind of ['new','literal','binding'])test('Filter reuses one configuration baseline without an extra read: '+kind,async()=>{
 const f=savedBuiltin({variable:false});
 if(kind==='new')f.r.target={kind:'new',type:'transform.filter_data'};
 f.r.parameters.groups[0]=[f.r.parameters.groups[0][0]];
 f.r.parameters.groups[0][0].value=8;
 if(kind==='binding'){delete f.r.parameters.groups[0][0].value;f.r.bindings=[{parameter:'/groups/0/0/value',variable:{kind:'control',input:0,name:'Limit'}}];}
 await assert.rejects(f.configure(),/EDIT_READY/);
 const baselines=f.records.filter(e=>e.phase==='node_observation_completed'&&['saved binding row baseline','binding row baseline','complete filter baseline'].includes(e.readiness?.condition));
 assert.equal(baselines.length,1,JSON.stringify(baselines.map(x=>x.readiness.condition)));
});
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
test('empty and omitted bindings use the same unchanged execution without builtin preflight',async()=>{
 for(const extra of [{},{bindings:[]}]){
  const request={document_id:'doc',workflow_ref:{workflow_id:'flow'},target:{kind:'existing',type:'transform.filter_data',ref:{...ref,node_id:'filter'}},mode:'conditions',finish:'execute',parameters:{},inputs:[],mappings:[],variable_inputs:[],...extra};
  assert.equal(isUnchangedTransformExecution(request),true);
  const r=await preflightFilterSource({operation:{parameters:request,nodeTargetAdapter:{observe:async()=>{throw Error('must not inspect the builtin source');}}}},{},{});
  assert.equal(r.verified,true);
 }
});
