import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCorrAnalysisParameters,resolveCorrAnalysisSets} from '../lib/corr-analysis-parameters.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0]}};
test('Pearson is registered with its native research identity',()=>{
 assert.equal(NODE_TYPES['research.corr_analysis'].icon_class,'bg-vendor-icon-corranalysis');
 assert.deepEqual(NODE_TYPES['research.corr_analysis'].modes,['pearson']);
});
test('new correlation requires both complete sets and rejects other coefficients',()=>{
 const p={first_set:['X','Y'],second_set:['Z','W']};
 assert.doesNotThrow(()=>validateCorrAnalysisParameters(p,'pearson',request));
 for(const bad of [{}, {...p,first_set:[]},{...p,first_set:['X','X']},{...p,kendall:true}])assert.throws(()=>validateCorrAnalysisParameters(bad,'pearson',request));
 assert.throws(()=>validateCorrAnalysisParameters(p,'spearman',request));
 assert.throws(()=>validateCorrAnalysisParameters(p,'pearson',{...request,read:{ports:[1]}}));
});
test('sets replace selections, retain native field order and allow overlapping fields',()=>{
 const fs=['X','Y','Z','W'].map(name=>({name,type:'real',first_set:false,second_set:false}));
 const actual=resolveCorrAnalysisSets({first_set:['Y','X'],second_set:['W','X']},fs);
 assert.deepEqual(actual.filter(f=>f.first_set).map(f=>f.name),['X','Y']);
 assert.deepEqual(actual.filter(f=>f.second_set).map(f=>f.name),['X','W']);
 assert.deepEqual(resolveCorrAnalysisSets({},actual),actual);
 assert.throws(()=>resolveCorrAnalysisSets({first_set:['Missing']},actual));
 assert.throws(()=>resolveCorrAnalysisSets({first_set:['X']},actual.map(f=>({...f,type:'string'}))));
});
