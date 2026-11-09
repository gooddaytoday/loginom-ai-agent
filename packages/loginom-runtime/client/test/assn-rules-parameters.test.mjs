import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAssnRulesParameters,resolveAssnRulesRoles} from '../lib/assn-rules-parameters.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
const p={transaction_field:'Transaction',item_field:'Item',min_support_pct:50,min_confidence_pct:60,max_items:2};
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
test('association rules register FP-Growth and preserve omitted existing settings',()=>{
 assert.deepEqual(NODE_TYPES['datamining.assn_rules'].modes,['fp_growth','apply']);
 validateAssnRulesParameters(p,'fp_growth',request);
 validateAssnRulesParameters({},'fp_growth',{...request,target:{kind:'existing'},inputs:[]});
 resolveAssnRulesRoles(p,['Transaction','Item'].map(name=>({name,type:'string',data_kind:'Дискретный'})));
});
test('unsupported modes, roles, thresholds and ports refuse before mutation',()=>{
 for(const patch of [{min_support_pct:101},{min_support_pct:NaN},{min_confidence_pct:-1},{max_items:4},{item_field:'Transaction'},{min_lift:-1}])
  assert.throws(()=>validateAssnRulesParameters({...p,...patch},'fp_growth',request),/Association rules/);
 for(const patch of [{inputs:[{input:1}]},{mappings:[{}]},{read:{ports:[3]}}])
  assert.throws(()=>validateAssnRulesParameters(p,'fp_growth',{...request,...patch}),/Association rules/);
 assert.throws(()=>validateAssnRulesParameters({},'fp_growth',request),/require/);
 assert.throws(()=>validateAssnRulesParameters(p,'apply',request),/apply/);
 for(const field of [{name:'Transaction',type:'integer',data_kind:'Дискретный'},{name:'Missing',type:'string',data_kind:'Дискретный'}])
  assert.throws(()=>resolveAssnRulesRoles(p,[field,{name:'Item',type:'string',data_kind:'Дискретный'}]),/discrete string/);
});
test('apply preserves an existing trained model and rejects edits before mutation',()=>{
 const r={...request,target:{kind:'existing'},inputs:[],finish:'execute',read:{ports:[1,2]}};
 validateAssnRulesParameters({},'apply',r);
 for(const patch of [p,{min_lift:0},null])assert.throws(()=>validateAssnRulesParameters(patch,'apply',r),/apply/);
 for(const patch of [{target:{kind:'new'}},{inputs:[{input:0}]},{mappings:[{}]},{finish:'done'},{finish:'close'},{read:{ports:[3]}}])
  assert.throws(()=>validateAssnRulesParameters({},'apply',{...r,...patch}),/apply/);
});
test('three-item rules accept two consequents and lift patches on the existing trained node',()=>{
 validateAssnRulesParameters({...p,max_items:3,max_consequents:2,min_lift:0},'fp_growth',request);
 validateAssnRulesParameters({min_lift:1.2},'fp_growth',{...request,target:{kind:'existing'},inputs:[]});
 for(const patch of [{max_items:2.5},{max_items:1},{max_consequents:0},{max_consequents:3},{max_consequents:1.5},{min_lift:Infinity},{min_lift:'1.2'}])
  assert.throws(()=>validateAssnRulesParameters({...p,...patch},'fp_growth',request),/Association rules/);
});

test('training recommendations accept port 2 with existing-node parameter preservation',()=>{
 validateAssnRulesParameters({...p,max_consequents:1,min_lift:0},'fp_growth',{...request,read:{ports:[1,2]}});
 validateAssnRulesParameters({},'fp_growth',{...request,target:{kind:'existing'},inputs:[],read:{ports:[0,1,2]}});
});

test('public dispatch admits all registered association-rule ports before the production handler',async()=>{
 const {nodeApiTools,dispatchNodeApi,validateNodeApplyEnvelope}=await import('../lib/node-api.mjs');
 const {createCandidateNodeSupport}=await import('../lib/node-support.mjs');
 const {validateNodeApplyRequest}=await import('../lib/node-apply.mjs');
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 const runtime={tools:nodeApiTools,startNodeApply:args=>validateNodeApplyRequest(args,handlers)};
 const envelope={operation_id:'recommend',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'new',type:'datamining.assn_rules',position:{x:320,y:280}},
  inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'source'},output:0,input:0}],
  mode:'fp_growth',parameters:p,mappings:[],finish:'execute',
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 for(const ports of [[2],[1,2],[0,1,2]])
  await dispatchNodeApi(runtime,'dock_node_apply',{...envelope,read:{ports,sample_rows:100,require_exact_numbers:true}});
 for(const type of ['transform.calculator','datamining.clustering'])
  assert.throws(()=>validateNodeApplyEnvelope({...envelope,target:{...envelope.target,type},read:{ports:[2]}}),/must be <= 1/);
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...envelope,read:{ports:[3],sample_rows:100,require_exact_numbers:true}}),/must be <= 2/);
});

test('maximum support exclusion admits only finite percentages or explicit disable and keeps auxiliary inputs unsupported',()=>{
 for(const value of [0,90,100,null])validateAssnRulesParameters({...p,exclude_support_above_pct:value},'fp_growth',request);
 for(const value of [-1,101,NaN,Infinity,'90',true])assert.throws(()=>validateAssnRulesParameters({...p,exclude_support_above_pct:value},'fp_growth',request));
 for(const parameters of [{selected_item_field:'Item'},{contain_selected_items:true}])assert.throws(()=>validateAssnRulesParameters({...p,...parameters},'fp_growth',request));
 for(const r of [request,{...request,target:{kind:'existing'}}])assert.throws(()=>validateAssnRulesParameters({...p,exclude_support_above_pct:90},'fp_growth',{...r,inputs:[{input:0},{input:1}]}),/auxiliary/);
});
