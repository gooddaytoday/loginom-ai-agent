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
 for(const key of ['outlier_policy','extreme_policy'])assert.deepEqual(schema.properties.parameters.properties.outlier.properties[key].enum,['keep','mean','median','most_probable','limit','delete','constant']);
});
test('new edit requires both policies and rejects later-stage actions before configuration',()=>{
 for(const outlier_policy of ['keep','mean','median','most_probable'])for(const extreme_policy of ['keep','mean','median','most_probable'])
  assert.doesNotThrow(()=>validateElimOutlierParameters({outlier:{...outlier,outlier_policy,extreme_policy}},'edit',request));
 for(const key of ['outlier_policy','extreme_policy']){
  const {[key]:omitted,...missing}=outlier;
  assert.throws(()=>validateElimOutlierParameters({outlier:missing},'edit',request),/polic/);
  for(const value of ['invalid',null,3])assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,[key]:value}},'edit',request),/polic/);
 }
 assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,outlier_constant:0}},'edit',request));
 assert.throws(()=>validateElimOutlierParameters({outlier},'detect',request),/detect/);
});
test('E2 policies and independent finite constants validate before native configuration',()=>{
 for(const outlier_policy of ['limit','delete','constant'])for(const extreme_policy of ['limit','delete','constant']){
  const values={...outlier,outlier_policy,extreme_policy,...(outlier_policy==='constant'?{outlier_constant:-7}:{}),...(extreme_policy==='constant'?{extreme_constant:-9}:{})};
  assert.doesNotThrow(()=>validateElimOutlierParameters({outlier:values},'edit',request));
  assert.deepEqual(resolveElimOutlierParameters({outlier:values},fields),values);
 }
 for(const kind of ['outlier','extreme']){
  const policy=kind+'_policy',constant=kind+'_constant';
  for(const value of [undefined,NaN,Infinity,-Infinity,'-7',null])
   assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,[policy]:'constant',[constant]:value}},'edit',request),/constant/);
  assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,[constant]:-7}},'edit',request),/constant/);
 }
});
test('constant patch preserves each class and drops obsolete hidden values',()=>{
 const saved={...outlier,outlier_policy:'constant',extreme_policy:'constant',outlier_constant:-7,extreme_constant:-9};
 const patch={outlier:{outlier_constant:0}};
 assert.doesNotThrow(()=>validateElimOutlierParameters(patch,'edit',{...request,target:{kind:'existing'},inputs:[]}));
 assert.deepEqual(resolveElimOutlierParameters(patch,fields,saved),{...saved,outlier_constant:0});
 const changed=resolveElimOutlierParameters({outlier:{extreme_policy:'delete'}},fields,saved);
 assert.equal(changed.outlier_constant,-7);assert.equal(Object.hasOwn(changed,'extreme_constant'),false);
 assert.throws(()=>resolveElimOutlierParameters({outlier:{outlier_constant:-7}},fields,outlier),/constant/);
 assert.throws(()=>resolveElimOutlierParameters({outlier:{extreme_policy:'constant'}},fields,outlier),/constant/);
});
test('existing edit patch preserves the omitted policy independently',()=>{
 assert.doesNotThrow(()=>validateElimOutlierParameters({outlier:{outlier_policy:'most_probable'}},'edit',{...request,target:{kind:'existing'},inputs:[]}));
 assert.deepEqual(resolveElimOutlierParameters({outlier:{outlier_policy:'most_probable'}},fields,outlier),{...outlier,outlier_policy:'most_probable'});
 assert.deepEqual(resolveElimOutlierParameters({outlier:{extreme_policy:'keep'}},fields,outlier),{...outlier,extreme_policy:'keep'});
});
