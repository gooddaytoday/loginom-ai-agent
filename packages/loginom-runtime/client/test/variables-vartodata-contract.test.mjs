import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {createVariablesToTableNodeSupport} from '../lib/variables-vartodata-node.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';

const request=()=>({operation_id:'op',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'crumb',label:'Сценарий'}]},
 target:{kind:'new',type:'variables.to_table'},inputs:[],variable_inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'source'},kind:'variables',output:0,input:0}],mode:'columns',parameters:{},mappings:[],finish:'execute',
 read:{ports:[0],sample_rows:1,require_exact_numbers:true},budgets:{configure_ms:600000,execute_ms:600000,total_ms:600000}});
test('VarToData has a distinct variable input and one typed table output; columns is the only mode',()=>{
 const card=NODE_TYPES['variables.to_table'];assert.ok(card);assert.equal(card.palette_group,'Переменные');
 assert.equal(card.tabular_inputs,0);assert.equal(card.variable_inputs,1);assert.equal(card.tabular_outputs,1);
 assert.deepEqual(card.input_kinds,['variables']);assert.deepEqual(card.output_kinds,['table']);assert.deepEqual(card.modes,['columns']);
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes(card.type));assert.ok(nodeApplyInputSchema.properties.mode.enum.includes('columns'));
});
test('closed registered columns request reaches the real handler admission before browser work',()=>{
 const support=createVariablesToTableNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.doesNotThrow(()=>validateNodeApplyRequest(request(),support.nodeApplyHandlers));
 for(const change of [r=>r.mode='rows',r=>r.parameters.variables=[],r=>r.variable_inputs[0].kind='control',r=>r.variable_inputs[0].source.workflow_id='foreign']){
  const r=request();change(r);assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers));
 }
 const card=describeNodeTypes(['variables.to_table'],{},new Map(),support.nodeApplyHandlers)[0];
 assert.equal(card.candidate_node_apply_available,true);assert.deepEqual(card.candidate_modes,['columns']);assert.equal(card.parameter_schema.additionalProperties,false);
});
