import test from 'node:test';
import assert from 'node:assert/strict';
import {linRegressionOutputColumns} from '../lib/linregression-output.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
const configuration={fields:[{name:'RowID',label:'RowID',type:'integer',usage_type:0},{name:'Factor',label:'Фактор',type:'real',usage_type:3},{name:'Response',label:'Цель',type:'real',usage_type:4}]};
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
