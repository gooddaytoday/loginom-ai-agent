import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAssnRulesParameters,resolveAssnRulesRoles} from '../lib/assn-rules-parameters.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
const p={transaction_field:'Transaction',item_field:'Item',min_support_pct:50,min_confidence_pct:60,max_items:2};
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
test('association rules register FP-Growth and preserve omitted existing settings',()=>{
 assert.deepEqual(NODE_TYPES['datamining.assn_rules'].modes,['fp_growth']);
 validateAssnRulesParameters(p,'fp_growth',request);
 validateAssnRulesParameters({},'fp_growth',{...request,target:{kind:'existing'},inputs:[]});
 resolveAssnRulesRoles(p,['Transaction','Item'].map(name=>({name,type:'string',data_kind:'Дискретный'})));
});
test('unsupported modes, roles, thresholds and ports refuse before mutation',()=>{
 for(const patch of [{min_support_pct:101},{min_support_pct:NaN},{min_confidence_pct:-1},{max_items:3},{item_field:'Transaction'},{min_lift:1}])
  assert.throws(()=>validateAssnRulesParameters({...p,...patch},'fp_growth',request),/Association rules/);
 for(const patch of [{inputs:[{input:1}]},{mappings:[{}]},{read:{ports:[2]}}])
  assert.throws(()=>validateAssnRulesParameters(p,'fp_growth',{...request,...patch}),/Association rules/);
 assert.throws(()=>validateAssnRulesParameters({},'fp_growth',request),/require/);
 assert.throws(()=>validateAssnRulesParameters(p,'apply',request),/fp_growth/);
 for(const field of [{name:'Transaction',type:'integer',data_kind:'Дискретный'},{name:'Missing',type:'string',data_kind:'Дискретный'}])
  assert.throws(()=>resolveAssnRulesRoles(p,[field,{name:'Item',type:'string',data_kind:'Дискретный'}]),/discrete string/);
});
