import test from 'node:test';
import assert from 'node:assert/strict';
import {linRegressionOutputColumns,configureLinRegressionOutputs} from '../lib/linregression-output.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
const configuration={fields:[{name:'RowID',label:'RowID',type:'integer',usage_type:0},{name:'Factor',label:'Фактор',type:'real',usage_type:3},{name:'Response',label:'Цель',type:'real',usage_type:4}]};

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
