import test from 'node:test';
import assert from 'node:assert/strict';
import {validateElimOutlierParameters,resolveElimOutlierParameters} from '../lib/elim-outlier-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
const fields=[{name:'X',type:'real',data_kind:'Непрерывный'}];
const outlier={fields:['X'],method:'sd',outlier_factor:1,extreme_factor:2,ordered:false,outlier_policy:'mean',extreme_policy:'median'};
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1,2]}};
test('edit is registered and exposes independent replacement policies',()=>{
 assert.ok(NODE_TYPES['preprocessing.elim_outlier'].modes.includes('edit'));
 assert.deepEqual(createCandidateNodeSupport({}).nodeApplyHandlers.get('preprocessing.elim_outlier').modes,['detect','edit']);
 const schema=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
 assert.ok(schema.properties.mode.enum.includes('edit'));
 for(const key of ['outlier_policy','extreme_policy'])assert.deepEqual(schema.properties.parameters.properties.outlier.properties[key].enum,['keep','mean','median','most_probable']);
});
test('new edit requires both policies and rejects later-stage actions before configuration',()=>{
 for(const outlier_policy of ['keep','mean','median','most_probable'])for(const extreme_policy of ['keep','mean','median','most_probable'])
  assert.doesNotThrow(()=>validateElimOutlierParameters({outlier:{...outlier,outlier_policy,extreme_policy}},'edit',request));
 for(const key of ['outlier_policy','extreme_policy']){
  const {[key]:omitted,...missing}=outlier;
  assert.throws(()=>validateElimOutlierParameters({outlier:missing},'edit',request),/polic/);
  for(const value of ['delete','constant','limit',null,3])assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,[key]:value}},'edit',request),/polic/);
 }
 assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,outlier_constant:0}},'edit',request));
 assert.throws(()=>validateElimOutlierParameters({outlier},'detect',request),/detect/);
});
test('existing edit patch preserves the omitted policy independently',()=>{
 assert.doesNotThrow(()=>validateElimOutlierParameters({outlier:{outlier_policy:'most_probable'}},'edit',{...request,target:{kind:'existing'},inputs:[]}));
 assert.deepEqual(resolveElimOutlierParameters({outlier:{outlier_policy:'most_probable'}},fields,outlier),{...outlier,outlier_policy:'most_probable'});
 assert.deepEqual(resolveElimOutlierParameters({outlier:{extreme_policy:'keep'}},fields,outlier),{...outlier,extreme_policy:'keep'});
});
