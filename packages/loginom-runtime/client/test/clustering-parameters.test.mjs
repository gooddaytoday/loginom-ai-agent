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
 for(const patch of [{clusters:1},{clusters:2.5},{seed:-1},{seed:2147483648},{normalization:'standardize'},{auto:true},{features:[]},{features:[p.features[0],p.features[0]]}])
  assert.throws(()=>validateClusteringParameters({...p,...patch},'k_means',request),/Clustering:/);
 assert.throws(()=>validateClusteringParameters(p,'g_means',request),/fixed k_means/);
 assert.throws(()=>validateClusteringParameters(p,'k_means',{...request,mappings:[{direction:'output',port:0}]}),/mapping overrides/);
});
test('identifiers, strings, unknown and discrete numeric fields cannot become features',()=>{
 for(const field of [{name:'X',type:'string',data_kind:'Дискретный'},{name:'X',type:'real',data_kind:'Дискретный'},{name:'Other',type:'real',data_kind:'Непрерывный'}])
  assert.throws(()=>resolveClusteringFeatures({features:[p.features[0]]},[field]),/continuous numeric/);
});
