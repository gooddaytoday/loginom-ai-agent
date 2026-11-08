import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClusteringParameters,resolveClusteringFeatures} from '../lib/clustering-parameters.mjs';
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
const p={features:[{kind:'input_field',name:'X'},{kind:'input_field',name:'Y'}],clusters:3};
test('fixed clustering admits numeric feature roles and preserves omitted existing settings',()=>{
 validateClusteringParameters(p,'k_means',request);
 resolveClusteringFeatures(p,['X','Y'].map(name=>({name,type:'real',data_kind:'Непрерывный'})));
 validateClusteringParameters({},'k_means',{...request,target:{kind:'existing'},inputs:[]});
});
test('unsupported training modes and malformed requests refuse before UI work',()=>{
 for(const patch of [{clusters:1},{clusters:2.5},{seed:-1},{seed:2147483648},{normalization:'minmax'},{auto:true},{features:[]},{features:[p.features[0],p.features[0]]}])
  assert.throws(()=>validateClusteringParameters({...p,...patch},'k_means',request),/Clustering:/);
 assert.throws(()=>validateClusteringParameters(p,'unknown',request),/supported/);
 assert.throws(()=>validateClusteringParameters(p,'k_means',{...request,mappings:[{direction:'output',port:0}]}),/mapping overrides/);
});

test('g-means requires automatic bounds, rejects fixed k and validates partial existing edits',()=>{
 const automatic={features:p.features,min_clusters:2,max_clusters:4,threshold:1,seed:42};
 validateClusteringParameters(automatic,'g_means',request);
 validateClusteringParameters({threshold:0.5},'g_means',{...request,target:{kind:'existing'},inputs:[]});
 for(const patch of [{min_clusters:0},{max_clusters:1001},{min_clusters:5},{threshold:0},{threshold:Infinity},{clusters:3},{max_clusters:undefined}])
  assert.throws(()=>validateClusteringParameters({...automatic,...patch},'g_means',request),/Clustering:/);
 assert.throws(()=>validateClusteringParameters({...p,min_clusters:2},'k_means',request),/Clustering:/);
});
test('standardization is admitted through the production validator',()=>{
 validateClusteringParameters({...p,normalization:'standardize'},'k_means',request);
});
test('identifiers, strings, unknown and discrete numeric fields cannot become features',()=>{
 for(const field of [{name:'X',type:'string',data_kind:'Дискретный'},{name:'X',type:'real',data_kind:'Дискретный'},{name:'Other',type:'real',data_kind:'Непрерывный'}])
  assert.throws(()=>resolveClusteringFeatures({features:[p.features[0]]},[field]),/continuous numeric/);
});

for(const normalization of ['scale_minus_one_one','scale_zero_one','absolute_scale'])test('native scaling enters the production validator: '+normalization,()=>{
 validateClusteringParameters({...p,normalization},'k_means',request);
});

test('apply requires an existing saved model and refuses all setting or connection edits',()=>{
 const r={...request,target:{kind:'existing'},inputs:[],finish:'execute'};
 validateClusteringParameters({},'apply',r);
 for(const patch of [{clusters:3},{features:p.features},{seed:42},{normalization:'none'}])
  assert.throws(()=>validateClusteringParameters(patch,'apply',r),/apply/);
 for(const change of [{target:{kind:'new'}},{inputs:[{input:0}]},{mappings:[{direction:'output',port:0}]},{finish:'done'},{finish:'close'}])
  assert.throws(()=>validateClusteringParameters({},'apply',{...r,...change}),/apply/);
});
