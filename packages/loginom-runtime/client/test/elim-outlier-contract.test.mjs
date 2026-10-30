import test from 'node:test';
import assert from 'node:assert/strict';
import {validateElimOutlierParameters,resolveElimOutlierParameters,validateElimOutlierPreview} from '../lib/elim-outlier-parameters.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApiTools,nodeApplyInputSchema,nodeOutputReadInputSchema,validateNodeApplyEnvelope} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
const fields=[{name:'RowID',type:'integer',data_kind:'Непрерывный'},{name:'X',type:'real',data_kind:'Непрерывный'},{name:'Note',type:'string',data_kind:'Дискретный'}];
const outlier={fields:['X'],method:'sd',outlier_factor:1,extreme_factor:3,ordered:false};
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1,2]}};
test('detect contract is registered with three outputs and its own parameter namespace',()=>{
 assert.equal(NODE_TYPES['preprocessing.elim_outlier'].tabular_outputs,3);
 const support=createCandidateNodeSupport({});
 assert.deepEqual(support.nodeApplyHandlers.get('preprocessing.elim_outlier').modes,['detect']);
 const schema=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
 assert.ok(schema.properties.target.properties.type.enum.includes('preprocessing.elim_outlier'));
 assert.ok(schema.properties.mode.enum.includes('detect'));
 assert.deepEqual(schema.properties.parameters.properties.outlier.properties.method.enum,['sd','iqr']);
 assert.deepEqual(schema.properties.parameters.properties.ordered,{const:false});
});
test('new detect requires explicit factors, method, complete field set and ordered flag',()=>{
 assert.doesNotThrow(()=>validateElimOutlierParameters({outlier},'detect',request));
 for(const key of Object.keys(outlier))assert.throws(()=>validateElimOutlierParameters({outlier:Object.fromEntries(Object.entries(outlier).filter(([k])=>k!==key))},'detect',request));
 for(const patch of [{method:'mad'},{fields:[]},{fields:['X','X']},{fields:['']},{outlier_factor:-1},{extreme_factor:0},{extreme_factor:Infinity},{ordered:1},{policy:'clip'}])
  assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,...patch}},'detect',request));
 assert.throws(()=>validateElimOutlierParameters({outlier,fields:[]},'detect',request));
 assert.throws(()=>validateElimOutlierParameters({outlier},'apply',request));
 assert.throws(()=>validateElimOutlierParameters({outlier},'detect',{...request,mappings:[{direction:'output',port:0}]}));
 assert.throws(()=>validateElimOutlierParameters({outlier},'detect',{...request,read:{ports:[3]}}));
});
test('existing patch preserves omitted settings, validates merged factors and continuous numeric fields',()=>{
 const old={...outlier,method:'iqr',outlier_factor:1.5};
 assert.doesNotThrow(()=>validateElimOutlierParameters({},'detect',{...request,target:{kind:'existing'},inputs:[]}));
 assert.deepEqual(resolveElimOutlierParameters({},fields,old),old);
 assert.deepEqual(resolveElimOutlierParameters({outlier:{outlier_factor:2}},fields,old),{...old,outlier_factor:2});
 assert.throws(()=>resolveElimOutlierParameters({outlier:{outlier_factor:4}},fields,old),/extreme_factor/);
 for(const name of ['Note','unknown'])assert.throws(()=>resolveElimOutlierParameters({outlier:{...outlier,fields:[name]}},fields),/continuous numeric/);
 assert.throws(()=>resolveElimOutlierParameters({outlier},fields.map(f=>({...f,data_kind:'Дискретный'}))),/continuous numeric/);
});
test('live preview without data kind checks numeric names; full input mapping still requires continuous kind',()=>{
 // execution-events.jsonl:321/331: cached_preview_column_infos exposes type,
 // but no data_kind. Absence here is not a discrete field or a kind proof.
 const preview=fields.map(({data_kind,...f})=>f);
 assert.doesNotThrow(()=>validateElimOutlierPreview({outlier},preview));
 for(const name of ['Note','unknown'])assert.throws(()=>validateElimOutlierPreview({outlier:{...outlier,fields:[name]}},preview));
 assert.throws(()=>resolveElimOutlierParameters({outlier},preview),/continuous numeric/);
 assert.throws(()=>resolveElimOutlierParameters({outlier},fields.map(f=>({...f,data_kind:'Дискретный'}))),/continuous numeric/);
});
test('public apply/read accepts all three outlier ports while old type and receipt limits remain strict',()=>{
 const r={operation_id:'detect',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'MF;TF',navigation_path:[{tid:'scenario',label:'Scenario'}]},target:{kind:'new',type:'preprocessing.elim_outlier'},inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'source'},input:0,output:0}],mode:'detect',parameters:{outlier},mappings:[],finish:'execute',read:{ports:[0,1,2],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 assert.doesNotThrow(()=>validateActionParameters(nodeApplyInputSchema,r));
 assert.doesNotThrow(()=>validateNodeApplyEnvelope(r));
 const published=new AjvJsonSchemaValidator().getValidator(nodeApplyInputSchema);
 assert.equal(published(r).valid,true);
 for(const type of ['datamining.clustering','transform.filter_data','transform.calculator'])assert.throws(()=>validateNodeApplyEnvelope({...r,target:{...r.target,type}}));
 assert.equal(published({...r,target:{...r.target,type:'datamining.clustering'}}).valid,false);
 assert.throws(()=>validateActionParameters(nodeApplyInputSchema,{...r,read:{...r.read,ports:[3]}}));
 assert.doesNotThrow(()=>validateActionParameters(nodeOutputReadInputSchema,{operation_id:'read',source_operation_id:'detect',read:{ports:[0,1,2],sample_rows:100,require_exact_numbers:true}}));
 const node={document_id:'doc',workflow_id:'wf',node_id:'clustering'};
 const source={parameters:{...r,target:{type:'datamining.clustering'}},outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,execution:{status:'completed'},output:{ports:[0,1].map(port=>({port,schema:[{name:'X',label:'X',type:'real'}]}))}}}};
 assert.throws(()=>buildNodeReadRequest({operation_id:'read',source_operation_id:'detect',read:{ports:[2]}},source),/choose ports present/);
});
