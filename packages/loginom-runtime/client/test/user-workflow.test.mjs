import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserWorkflowBindings, userNodeTool, userActionInventory } from '../lib/user-workflow.mjs';
import { nodeApiTools, dispatchNodeApi } from '../lib/node-api.mjs';
import { validateActionParameters } from '../lib/action-catalog.mjs';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import {compactNodeRequestFailure,userResultSchema} from '../lib/user-results.mjs';
import {groupingParametersSchema,filterParametersSchema} from '../lib/node-api.mjs';
import {validateFilterConditions} from '../lib/filter-parameters.mjs';
import {validateTextExportParameters} from '../lib/text-export-parameters.mjs';

const workspace=()=>({document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'prefix',navigation_path:[{tid:'module',label:'Module'},{tid:'scenario',label:'Scenario'}]}});
const request=()=>({operation_id:'op',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf'},
  target:{kind:'existing',type:'transform.sorting',ref:{document_id:'doc',workflow_id:'wf',node_id:'sort'}},inputs:[],mappings:[],mode:'keys',parameters:{},finish:'execute',
  read:{ports:[0],sample_rows:3,require_exact_numbers:false}});

test('new export technical defaults preserve explicit format and never authorize overwrite or patch existing nodes',()=>{
 const b=createUserWorkflowBindings();b.remember(workspace());
 const r={...request(),target:{kind:'new',type:'exports.text'},mode:'delimited',inputs:[{}],parameters:{destination:'/test-2/a.csv'}};delete r.read;
 const expanded=b.expandNode(r);
 const card=userActionInventory({node_types:[{type:'exports.text',parameter_schema:{type:'object'}}]}).node_types[0];
 assert.deepEqual(card.creation_defaults.parameters,Object.fromEntries(Object.entries(expanded.parameters).filter(([k])=>k!=='destination')));
 assert.deepEqual(card.creation_defaults.required_parameters,['destination']);
 assert.doesNotThrow(()=>validateTextExportParameters(expanded.parameters,expanded.mode,expanded));
 assert.equal(expanded.parameters.delimiter,',');assert.equal(expanded.parameters.header,'names');assert.equal(expanded.parameters.bom,false);assert.equal(expanded.parameters.overwrite,undefined);
 assert.deepEqual(r.parameters,{destination:'/test-2/a.csv'});
 r.parameters={...r.parameters,delimiter:';',bom:true,header:'labels',line_ending:'CRLF',decimal_separator:','};
 const explicit=b.expandNode(r);for(const [key,value]of Object.entries(r.parameters))assert.equal(explicit.parameters[key],value);
 r.target.kind='existing';r.parameters={};assert.deepEqual(b.expandNode(r).parameters,{});
 r.target.kind='new';const missing=b.expandNode(r);assert.throws(()=>validateTextExportParameters(missing.parameters,missing.mode,missing),/Invalid parameters.destination:/);
 r.parameters={destination:'/test-2/a.csv',bom:'false'};const bad=b.expandNode(r);assert.throws(()=>validateTextExportParameters(bad.parameters,bad.mode,bad),/BOM must be boolean/);
});

test('verified running worker gives a wait step, while unknown effects still require inspection',()=>{
 const failure={effect_possible:true,operation_id:'original',error:{code:'REQUEST_REJECTED',message:'Another node operation is running'},output:{active_node_job:{operation_id:'original',state:'running'}}};
 const result=compactNodeRequestFailure(failure,{operation_id:'competing'});
 assert.equal(new AjvJsonSchemaValidator().getValidator(userResultSchema)(result).valid,true);
 assert.equal(result.state,'running');assert.equal(result.status,undefined);
 assert.deepEqual(result.next_step.arguments,{operation_id:'original',timeout_ms:10000});
 assert.equal(result.next_step.tool,'dock_node_wait');assert.equal(result.next_step.rejected_operation_id,'competing');
 delete failure.output.active_node_job;
 const uncertain=compactNodeRequestFailure(failure,{operation_id:'competing'});
 assert.equal(uncertain.status,'AMBIGUOUS');assert.equal(uncertain.next_step.tool,'dock_operation_inspect');
});

test('selected schema exposes technical names and filter date errors identify the exact operand',()=>{
 const grouping={group_by:[{kind:'input_field',name:'category'}],measures:[{field:{kind:'input_field',name:'total'},function:'sum',name:'Сумма',label:'Сумма'}]};
 assert.throws(()=>validateActionParameters(groupingParametersSchema,grouping,'parameters'),/parameters.measures\[0\].name/);
 grouping.measures[0].name='Revenue';assert.doesNotThrow(()=>validateActionParameters(groupingParametersSchema,grouping));
 assert.match(filterParametersSchema.properties.groups.items.items.description,/2024-01-01T00:00:00/);
 const filter={groups:[[{field:{kind:'input_field',name:'date'},operator:'>=',type:'datetime',value:'2024-01-01'}]]};
 assert.throws(()=>validateFilterConditions(filter),/parameters.groups\[0\]\[0\].value: Filter datetime/);
 filter.groups[0][0].value='2024-01-01T00:00:00';assert.doesNotThrow(()=>validateFilterConditions(filter));
});

test('nonempty selected parameters pass the user envelope and retain internal validation',async()=>{
 const bindings=createUserWorkflowBindings();bindings.remember(workspace());
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 const args=request();args.parameters={keys:[{field:'category',order:'ascending'}]};
 validateActionParameters(tool.inputSchema,args);
 const full=bindings.expandNode(args);let received;
 await dispatchNodeApi({tools:nodeApiTools,startNodeApply:async r=>{received=r;}},'dock_node_apply',full);
 assert.deepEqual(received.parameters,args.parameters);
 args.parameters={unknown_parameter:true};
 validateActionParameters(tool.inputSchema,args);
 await assert.rejects(()=>dispatchNodeApi({tools:nodeApiTools,startNodeApply:async()=>{throw Error('must not execute');}},'dock_node_apply',bindings.expandNode(args)),/unknown field/);
 assert.throws(()=>validateActionParameters(tool.inputSchema,{...args,extra:true}),/unknown field/);
});

test('technical defaults expand deterministically and preserve explicit choices',()=>{
 const bindings=createUserWorkflowBindings();bindings.remember(workspace());
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 for(const [type,finish,ports] of [['transform.sorting','execute',[0]],['transform.filter_data','execute',[0,1]],['exports.text','execute',[]],['transform.sorting','done',[]]]){
  const args=request();args.target.type=type;args.finish=finish;delete args.read;delete args.budgets;delete args.mappings;
  validateActionParameters(tool.inputSchema,args);
  const full=bindings.expandNode(args);assert.deepEqual(full.read.ports,ports);assert.deepEqual(full.mappings,[]);
  assert.deepEqual(full.budgets,{configure_ms:600000,execute_ms:120000,total_ms:600000},'configuration can use the shared allowance; total deadline still bounds execution, read and cleanup');
  assert.deepEqual(bindings.expandNode(args),full);
  assert.equal(bindings.expandNode({...args,read:{sample_rows:2},budgets:{total_ms:500000}}).budgets.total_ms,500000);
  const explicit={configure_ms:1000,execute_ms:1000,total_ms:2000};
  assert.deepEqual(bindings.expandNode({...args,budgets:explicit}).budgets,explicit,'caller deadlines must not be silently extended');
 }
});

test('compact model calls cannot override host budgets while the diagnostic contract retains them',async()=>{
 const bindings=createUserWorkflowBindings();bindings.remember(workspace());
 const original=nodeApiTools.find(t=>t.name==='dock_node_apply'),compact=userNodeTool(original);
 const args={...request(),budgets:{configure_ms:120000,execute_ms:120000,total_ms:120000}};
 assert.throws(()=>validateActionParameters(compact.inputSchema,args),/unknown field.*budgets/);
 assert.equal(new AjvJsonSchemaValidator().getValidator(compact.inputSchema)(args).valid,false);
 assert.ok(original.inputSchema.properties.budgets);
 const full=bindings.expandNode(args);let received;
 await dispatchNodeApi({tools:nodeApiTools,startNodeApply:async r=>{received=r;}},'dock_node_apply',full);
 assert.deepEqual(received.budgets,args.budgets);
});
test('compact rereads reject model deadlines and dispatch a bounded host deadline without changing read options',async()=>{
 const bindings=createUserWorkflowBindings(),original=nodeApiTools.find(t=>t.name==='dock_node_read'),compact=userNodeTool(original);
 const args={operation_id:'reread',source_operation_id:'created',read:{ports:[0],sample_rows:55,require_exact_numbers:true}};
 const short={...args,budget_ms:60000};
 assert.throws(()=>validateActionParameters(compact.inputSchema,short),/unknown field.*budget_ms/);
 assert.equal(new AjvJsonSchemaValidator().getValidator(compact.inputSchema)(short).valid,false);
 assert.ok(original.inputSchema.properties.budget_ms);
 validateActionParameters(compact.inputSchema,args);
 const before=structuredClone(args),calls=[],runtime={tools:nodeApiTools,startNodeRead:r=>{calls.push(r);return r;}};
 await dispatchNodeApi(runtime,'dock_node_read',bindings.expandNodeRead(args));
 assert.equal(calls[0].budget_ms,600000);
 assert.deepEqual(calls[0].read,args.read);assert.equal(calls[0].source_operation_id,args.source_operation_id);
 assert.deepEqual(args,before);
 await dispatchNodeApi(runtime,'dock_node_read',short);
 assert.equal(calls[1].budget_ms,60000,'full diagnostic deadlines remain explicit and immutable');
});
test('new import defaults use only a locally confirmed upload and preserve explicit settings',()=>{
 const binding=createUserWorkflowBindings();binding.remember(workspace());
 const args={...request(),target:{kind:'new',type:'imports.text'},mode:'delimited',parameters:{source:{artifact_id:'artifact',upload_operation_id:'delivery:upload'},settings:{columns:[{name:'Amount',type:'real'}]}}};
 binding.rememberDelivery({operation_id:'delivery',upload_operation_id:'delivery:upload',state:'running'},{artifact_id:'artifact'});
 assert.equal(binding.expandNode(args).parameters.settings.source.source_path,undefined);
 binding.rememberDelivery({operation_id:'delivery',upload_operation_id:'delivery:upload',outcome:{status:'SUCCEEDED',cleanup_complete:true,upload_completion_verified:true,destination:'/mimo/run/input.csv'}},{});
 const expanded=binding.expandNode(args);
 assert.equal(expanded.parameters.settings.source.source_path,'/mimo/run/input.csv');
 assert.deepEqual(expanded.parameters.settings.columns[0],{name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный',used:true});
 args.parameters.settings.source={encoding:'Windows-1251',source_path:'/mimo/explicit.csv'};
 args.parameters.settings.format={delimiter:';'};
 assert.equal(binding.expandNode(args).parameters.settings.source.encoding,'Windows-1251');
 assert.equal(binding.expandNode(args).parameters.settings.source.source_path,'/mimo/explicit.csv');
 assert.equal(binding.expandNode(args).parameters.settings.format.delimiter,';');
 delete args.parameters.settings.source;args.parameters.source.artifact_id='foreign';
 assert.equal(binding.expandNode(args).parameters.settings.source.source_path,undefined);
 assert.equal(args.parameters.settings.columns[0].label,undefined);
});
test('rejected requests distinguish parameter repair from pending-effect inspection',()=>{
 for(const pending of [false,true]){
  const failure={action_key:'request.validate',operation_id:pending?'original':null,effect_possible:pending,
   error:{code:'REQUEST_REJECTED',message:'Invalid parameters.parameters.settings.columns: array is too short'}};
  const result=compactNodeRequestFailure(failure,{operation_id:'attempt'});
  assert.equal(new AjvJsonSchemaValidator().getValidator(userResultSchema)(result).valid,true);
  assert.equal(result.error.parameter_path,'parameters.settings.columns');
  assert.equal(result.effect_possible,pending);assert.equal(result.cleanup_complete,!pending);
  assert.equal(result.next_step.tool,pending?'dock_operation_inspect':'dock_node_apply');
  if(pending)assert.equal(result.next_step.arguments.operation_id,'original');
  else assert.match(result.next_step.instruction,/NEW operation_id/);
 }
});

test('wrong node parameters name the field and direct only to the selected schema',()=>{
 const failure={action_key:'request.validate',effect_possible:false,error:{code:'REQUEST_REJECTED',message:'Invalid parameters.parameters: unknown field format'}};
 const request={operation_id:'export-bad',target:{type:'exports.text'}};
 const result=compactNodeRequestFailure(failure,request);
 assert.equal(result.error.parameter_path,'parameters.format');
 assert.equal(result.next_step.tool,'dock_action_describe');
 assert.deepEqual(result.next_step.arguments,{node_types:['exports.text']});
 assert.match(result.next_step.instruction,/NEW operation_id/);
 assert.equal(new AjvJsonSchemaValidator().getValidator(userResultSchema)(result).valid,true);
 failure.effect_possible=true;failure.operation_id='original';
 assert.equal(compactNodeRequestFailure(failure,request).next_step.tool,'dock_operation_inspect');
});

test('short user references expand into the unchanged node contract without browser or knowledge calls',async()=>{
  const bindings=createUserWorkflowBindings(),state=workspace();bindings.remember(state);
  const tool=nodeApiTools.find(t=>t.name==='dock_node_apply'),userTool=userNodeTool(tool),args=request();
  validateActionParameters(userTool.inputSchema,args);
  assert.throws(()=>validateActionParameters(tool.inputSchema,args),/Invalid/);
  assert.throws(()=>validateActionParameters(userTool.inputSchema,{...args,workflow_ref:state.workflow_ref}),/unknown field/);
  state.workflow_ref.navigation_path[0].tid='tampered';
  const full=bindings.expandNode(args);let received;
  await dispatchNodeApi({tools:nodeApiTools,startNodeApply:async r=>{received=r;}},'dock_node_apply',full);
  assert.equal(received.workflow_ref.navigation_path[0].tid,'module');
  assert.deepEqual(args.workflow_ref,{workflow_id:'wf'});
  assert.deepEqual(bindings.expandNode(args),full);
});
test('foreign identities and damaged prepare references fail before changing preparation state',()=>{
  const bindings=createUserWorkflowBindings(),state=workspace();bindings.remember(state);
  assert.throws(()=>bindings.expandNode({...request(),document_id:'foreign'}),/UNKNOWN_PREPARED_WORKFLOW/);
  assert.throws(()=>bindings.expandNode({...request(),workflow_ref:{workflow_id:'foreign'}}),/UNKNOWN_PREPARED_WORKFLOW/);
  const ref={...state.workflow_ref,document_id:'doc',navigation_path:state.workflow_ref.navigation_path.map(c=>({label:c.label,tid:c.tid}))};
  const args={intent:'existing_workflow',workflow_ref:ref};
  assert.deepEqual(bindings.normalizePreparation(args).workflow_ref,{...workspace().workflow_ref,document_id:'doc'});
  ref.navigation_path[0].tid='scenario';
  assert.throws(()=>bindings.normalizePreparation(args),/WORKFLOW_REFERENCE_MISMATCH/);
  assert.deepEqual(bindings.expandNode(request()).workflow_ref,workspace().workflow_ref);
});
test('verified save continuation updates the local path while old documents remain isolated',()=>{
  const bindings=createUserWorkflowBindings();bindings.remember(workspace());
  const saved=workspace();saved.workflow_ref.navigation_path[0].label='Saved module';bindings.remember(saved);
  assert.equal(bindings.expandNode(request()).workflow_ref.navigation_path[0].label,'Saved module');
  bindings.remember({document_id:'new-doc',workflow_ref:{...saved.workflow_ref,workflow_id:'new-wf'}});
  assert.throws(()=>bindings.expandNode({...request(),workflow_ref:{workflow_id:'new-wf'}}),/UNKNOWN_PREPARED_WORKFLOW/);
});


test('user resume accepts only an operation ID and dispatches without reconstructing a workflow',async()=>{
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_resume'));
 const args={operation_id:'original'};validateActionParameters(tool.inputSchema,args);
 assert.equal(new AjvJsonSchemaValidator().getValidator(tool.inputSchema)(args).valid,true);
 assert.throws(()=>validateActionParameters(tool.inputSchema,{...args,target:{kind:'existing'}}));
 let received;await dispatchNodeApi({tools:nodeApiTools,startNodeApply:(r,options)=>{received={r,options};}},'dock_node_resume',args);
 assert.deepEqual(received,{r:args,options:{resume:true}});
 await assert.rejects(dispatchNodeApi({tools:nodeApiTools},'dock_node_resume',{...args,finish:'execute'}));
});

test('published compact schema rejects contradictory finish/read requests and preserves defaults',()=>{
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 const check=new AjvJsonSchemaValidator().getValidator(tool.inputSchema);
 const original=request();assert.equal(check(original).valid,true);
 for(const finish of ['done','close']){
  const p={...original,finish};assert.equal(check(p).valid,false);
  delete p.read;assert.equal(check(p).valid,true);
  p.read={ports:[]};assert.equal(check(p).valid,true);
 }
 const full={...original,read:{coverage:'full',ports:[0]}};assert.equal(check(full).valid,false);
 full.target={...full.target,type:'transform.collapse_columns'};assert.equal(check(full).valid,true);
 delete full.read.ports;assert.equal(check(full).valid,true);
 full.read.ports=[1];assert.equal(check(full).valid,false);
 const exported={...original,target:{...original.target,type:'exports.text'}};assert.equal(check(exported).valid,false);
 exported.read={ports:[]};assert.equal(check(exported).valid,true);
});
