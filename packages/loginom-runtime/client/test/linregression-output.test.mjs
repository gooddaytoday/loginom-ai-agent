import test from 'node:test';
import assert from 'node:assert/strict';
import {linRegressionOutputColumns,configureLinRegressionOutputs} from '../lib/linregression-output.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {releaseNodeApply,validateNodeApplyRequest} from '../lib/node-apply.mjs';
const configuration={fields:[{name:'RowID',label:'RowID',type:'integer',usage_type:0},{name:'Factor',label:'Фактор',type:'real',usage_type:3},{name:'Response',label:'Цель',type:'real',usage_type:4}]};

test('repeated saved-model application only inspects and closes the coefficient mapping',async()=>{
 const mapping=configuredCoefficients(),before=structuredClone(mapping),actions=[];
 for(let i=0;i<2;i++){
  let closed=false;
  const state=()=>({node_mapping:mapping,prepared_node_context:{verified:true,surface:closed?'graph':'wizard',locked:false,document_id:'doc',workflow_id:'flow',node_id:'regression'},
   wizard:closed?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:'wizard',root_tid:'W',owner_context:{status:'observed'}},
   ui:{dialogs:[],masks:[],elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}]}});
  const channel={async openOutputPort(port){assert.equal(port,1);},async observe(options){const s=state();assert.equal(options.ready(s),true,options.condition);return s;},
   async perform(options){const s=state();assert.equal(options.ready(s),true);const action=options.resolve(s);assert.deepEqual(action,{verb:'click',ref:'close'});actions.push(action);closed=true;}};
  const result=await configureLinRegressionOutputs(channel,{...configuration,mode:'apply'},{},[],()=>assert.fail('apply cannot commit outputs'));
  assert.equal(result.verified,true);assert.equal(closed,true);assert.deepEqual(mapping,before);
 }
 assert.equal(actions.length,2);
});

test('apply refuses an unmaterialized coefficient output after closing its untouched draft',async()=>{
 const mapping=configuredCoefficients();mapping.source_fields=[];let closed=false;
 const state=()=>({node_mapping:mapping,prepared_node_context:{verified:true,surface:closed?'graph':'wizard',locked:false,document_id:'doc',workflow_id:'flow',node_id:'regression'},
  wizard:closed?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:'wizard',root_tid:'W',owner_context:{status:'observed'}},
  ui:{dialogs:[],masks:[],elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}]}});
 const channel={async openOutputPort(){},async observe(options){const s=state();assert.equal(options.ready(s),true);return s;},
  async perform(options){assert.deepEqual(options.resolve(state()),{verb:'click',ref:'close'});closed=true;}};
 await assert.rejects(configureLinRegressionOutputs(channel,{...configuration,mode:'apply'},{},[],()=>assert.fail('no commit')),/already trained model/);
 assert.equal(closed,true);
});

function configuredCoefficients(){
 const columns=[['Name','Имена входных полей','string'],['DisplayName','Метки входных полей','string'],['UniqueValues','Уникальные значения','string'],['Response_coefficients','Цель|Коэффициенты','real'],...['stdError','TStat','PValue','lowerBound','upperBound'].map(s=>['Response_'+s,'Цель|'+s,'real'])];
 const source_fields=columns.map(([name,label,type],index)=>({record_id:'source-'+index,field_id:String(index),index,name,label,type,required:false}));
 const ordered=[source_fields[0],source_fields[3],...source_fields.filter((_,i)=>i!==0&&i!==3)];
 return {verified:true,inventory_complete:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:true,source_fields,
  target_fields:ordered.map((source,index)=>({record_id:'target-'+index,field_id:String(index),index,name:source.name,label:index<2?source.label:source.name,type:source.type,required:false,inherited:false,excluded:index>=2,source:index<2?source:null,exclusion_source:index>=2?source:null}))};
}
async function configureExisting(mapping){
 let finished=0,gestures=0;
 const channel={async openOutputPort(port){assert.equal(port,1);},async perform(){gestures++;throw Error('Already configured output must not be mutated');},
  async observe(options){
   const offset=options.outputColumnPage?.offset??0,fields=mapping.target_fields.slice(offset,offset+8).map(f=>({...f,status:'observed'}));
   const state={node_mapping:mapping,wizard:{stage:'output_mapping',root_ref:'coefficients',output_columns:{fields,page:{status:'complete_definition_page',schema_id:'coefficient-schema',offset,limit:8,total_columns:mapping.target_fields.length,returned:fields.length,next_offset:offset+fields.length===mapping.target_fields.length?null:offset+fields.length}}}};
   assert.equal(options.ready(state),true);return state;
  }};
 const result=await configureLinRegressionOutputs(channel,configuration,{},[],async(stage,output,definition)=>{finished++;assert.equal(stage,'done');assert.equal(output,true);assert.equal(definition.definition_complete,true);});
 assert.equal(finished,1);assert.equal(gestures,0);return result;
}
test('reopened native coefficient output keeps its exact selection and source/exclusion bindings without gestures',async()=>{
 const mapping=configuredCoefficients(),before=structuredClone(mapping),result=await configureExisting(mapping);
 assert.equal(result.verified,true);assert.deepEqual(result.ports.map(p=>p.port),[0,1]);assert.deepEqual(mapping,before);
});
test('reopened coefficient output still refuses changed selection, source bindings and nonoptional fields',async()=>{
 for(const change of [m=>m.source_fields.pop(),m=>m.target_fields[0].source={...m.target_fields[0].source,record_id:'foreign'},
  m=>m.target_fields[2].exclusion_source=null,m=>m.target_fields[2].name='Renamed',m=>m.target_fields[1].label='Changed',
  m=>m.target_fields[1].type='integer',m=>m.target_fields[0].required=true,m=>m.target_fields[0].inherited=true,
  m=>m.target_fields[2].excluded=false,m=>m.source_fields[2]={...m.source_fields[1]},m=>m.target_fields[2].exclusion_source=m.target_fields[3].exclusion_source]){
  const mapping=structuredClone(configuredCoefficients());change(mapping);
  await assert.rejects(configureExisting(mapping),/only optional native coefficient fields/);
 }
});
test('a fresh intrinsic coefficient selection without source inventory remains supported',async()=>{
 const mapping=configuredCoefficients();mapping.source_fields=[];mapping.target_fields=mapping.target_fields.slice(0,2).map(f=>({...f,source:null}));
 assert.equal((await configureExisting(mapping)).verified,true);
});

function unfinishedCoefficients(){
 const mapping=configuredCoefficients();
 mapping.target_fields=mapping.source_fields.map((source,index)=>({...source,record_id:'target-'+index,
  source,exclusion_source:null,excluded:false,inherited:false}));
 let selected=null;const actions=[];
 const state=options=>{
  const offset=options.outputColumnPage?.offset??0,fields=mapping.target_fields.slice(offset,offset+8)
   .map(f=>({...f,status:'observed',name_ref:f.record_id,selected:selected===f.record_id}));
  return {node_mapping:structuredClone(mapping),wizard:{stage:'output_mapping',root_ref:'coefficients',root_tid:'W',
   output_columns:{fields,page:{status:'complete_definition_page',schema_id:'coefficient-schema',offset,limit:8,
    total_columns:mapping.target_fields.length,returned:fields.length,next_offset:offset+fields.length===mapping.target_fields.length?null:offset+fields.length}}},
   ui:{elements:[...mapping.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click']})),
    {tid:'W;DerivedDataSourceOutputSocketWizard;btnAddMappingToExcluded',ref:'exclude',allowed_actions:['click']}]}};
 };
 const channel={async openOutputPort(port){assert.equal(port,1);},async observe(options){const s=state(options);assert.ok(options.ready(s),options.condition);return s;},
  async perform(options){
   const current=options.initialObservation??state({});assert.ok(options.ready(current),options.condition);
   const action=options.resolve(current);actions.push(action);
   if(action.ref!=='exclude'){selected=action.ref;return;}
   const field=mapping.target_fields.find(f=>f.record_id===selected),source=field.source;
   mapping.target_fields=mapping.target_fields.filter(f=>f!==field);
   mapping.target_fields.push({...field,label:field.name,excluded:true,source:null,exclusion_source:source});
   mapping.target_fields.forEach((f,index)=>{f.index=index;});
  }};
 return {mapping,channel,actions};
}

test('released unexecuted LinRegression can finish the native coefficient selection with a new operation',async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'regression'},support=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'});
 const request={operation_id:'stopped',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'existing',type:'datamining.lin_regression',ref:node},inputs:[],mode:'enter',parameters:{input_fields:['Factor'],target_field:'Response'},mappings:[],finish:'execute',
  read:{ports:[0,1],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:600000,execute_ms:600000,total_ms:600000}};
 const operation={id:request.operation_id,nodeApply:{request,node,pending:{phase:'output_mapping'},signature:'sig',
  phases:[{phase:'node_finish'}],execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed'}}};
 const released=await releaseNodeApply({operation,handlers:support.nodeApplyHandlers,record:async e=>e,
  drivers:{releasePending:async()=>({verified:true,cleanup_complete:true,node_context:node,cleanup:{wizard_closed:true}})}});
 assert.equal(released.checkpoint_kind,'local_node_released');assert.equal(released.execution.status,'not_requested');
 assert.equal(released.configuration.status,'unknown');assert.equal(operation.nodeApply.pending,null);
 assert.match(released.next_step.instruction,/NEW operation_id/);
 assert.doesNotThrow(()=>validateNodeApplyRequest({...request,operation_id:'after-release'},support.nodeApplyHandlers));
 const f=unfinishedCoefficients(),sources=structuredClone(f.mapping.source_fields);let finished=0;
 const result=await configureLinRegressionOutputs(f.channel,configuration,request.parameters,[],async()=>{finished++;});
 assert.equal(result.verified,true);assert.equal(finished,1);
 assert.deepEqual(f.mapping.target_fields.filter(f=>!f.excluded).map(f=>f.name),['Name','Response_coefficients']);
 assert.deepEqual(f.mapping.source_fields,sources);assert.equal(f.actions.filter(a=>a.ref==='exclude').length,7);
 assert.equal(operation.nodeApply.execution.status,'not_requested');
});

test('initial coefficient selection still excludes intrinsic fields before native sources materialize',async()=>{
 const f=unfinishedCoefficients();f.mapping.source_fields=[];f.mapping.target_fields.forEach(f=>{f.source=null;});
 assert.equal((await configureLinRegressionOutputs(f.channel,configuration,{},[],async()=>{})).verified,true);
 assert.deepEqual(f.mapping.target_fields.filter(f=>!f.excluded).map(f=>f.name),['Name','Response_coefficients']);
});

test('unfinished native coefficient selection refuses incomplete, changed and nonoptional bindings before gestures',async()=>{
 for(const change of [m=>m.source_fields.pop(),m=>m.target_fields[0].source=null,
  m=>m.target_fields[1].source=m.target_fields[2].source,m=>m.target_fields[0].label='Changed',
  m=>m.target_fields[3].type='integer',m=>m.target_fields[2].name='Renamed',
  m=>m.target_fields[2].required=true,m=>m.target_fields[2].inherited=true]){
  const f=unfinishedCoefficients();change(f.mapping);
  await assert.rejects(configureLinRegressionOutputs(f.channel,configuration,{},[],async()=>{assert.fail('Invalid selection must not finish');}));
  assert.deepEqual(f.actions,[]);
 }
});

test('a partially reduced native coefficient selection preserves exclusions already committed',async()=>{
 const f=unfinishedCoefficients(),field=f.mapping.target_fields.splice(1,1)[0];
 f.mapping.target_fields.push({...field,label:field.name,excluded:true,source:null,exclusion_source:field.source});
 f.mapping.target_fields.forEach((field,index)=>{field.index=index;});
 const excluded=structuredClone(f.mapping.target_fields.at(-1));
 assert.equal((await configureLinRegressionOutputs(f.channel,configuration,{},[],async()=>{})).verified,true);
 assert.deepEqual(f.mapping.target_fields.find(f=>f.name==='DisplayName'),{...excluded,index:2});
 assert.equal(f.actions.filter(a=>a.ref==='exclude').length,6);
});

test('coefficient exclusion refuses source inventory drift before another exclusion or Done',async()=>{
 const f=unfinishedCoefficients(),perform=f.channel.perform;
 f.channel.perform=async options=>{await perform(options);if(f.actions.at(-1).ref==='exclude')f.mapping.source_fields.pop();};
 await assert.rejects(configureLinRegressionOutputs(f.channel,configuration,{},[],async()=>{assert.fail('Changed inventory must not finish');}),/exclusion changed the coefficient inventory/);
 assert.equal(f.actions.filter(a=>a.ref==='exclude').length,1);
});
test('native prediction and coefficient schemas follow the target technical name and label',()=>{
 assert.deepEqual(linRegressionOutputColumns(configuration,0).map(f=>f.name),['Response_rergession','RowID','Factor','Response']);
 assert.deepEqual(linRegressionOutputColumns(configuration,1),[{name:'Name',label:'Имена входных полей',type:'string'},{name:'Response_coefficients',label:'Цель|Коэффициенты',type:'real'}]);
 assert.throws(()=>linRegressionOutputColumns({fields:configuration.fields.filter(f=>f.usage_type!==4)},0),/configured target/);
});
test('the installed catalog and request validator admit Enter with both tabular outputs',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'});
 const card=describeNodeTypes(['datamining.lin_regression'],{},new Map(),support.nodeApplyHandlers,'7.4.2')[0];
 assert.equal(card.tabular_outputs,2);assert.equal(card.palette_group,'Data_Mining');
 assert.equal(card.parameter_schema.properties.target_field.type,'string');
 const source={document_id:'doc',workflow_id:'flow',node_id:'input'};
 const request={operation_id:'regression',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:'Scenario'}]},target:{kind:'new',type:'datamining.lin_regression'},inputs:[{source,output:0,input:0}],mode:'enter',parameters:{input_fields:['Factor'],target_field:'Response'},mappings:[],finish:'execute',read:{ports:[0,1],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:600000,execute_ms:600000,total_ms:600000}};
 assert.equal(validateNodeApplyRequest(request,support.nodeApplyHandlers).handler,support.nodeApplyHandlers.get('datamining.lin_regression'));
 assert.throws(()=>validateNodeApplyRequest({...request,mode:'ridge'},support.nodeApplyHandlers),/mode|Enter/);
});
