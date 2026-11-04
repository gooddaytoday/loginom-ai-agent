import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFactorAnalysisParameters,resolveFactorAnalysisFeatures} from '../lib/factor-analysis-parameters.mjs';
import {factorAnalysisOutputColumns,alignFactorAnalysisOutput} from '../lib/factor-analysis-output.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
const parameters={factor_analysis:{features:['X','Y','Z'],factors:2,rotation:'none'}};
const fields=['RowID','X','Y','Z','Tag'].map((name,i)=>({name,label:name,type:i===0?'integer':i===4?'string':'real',data_kind:i===4?'Дискретный':'Непрерывный',usage_type:i>0&&i<4?3:0}));
test('factor analysis is registered with separate parameters and two outputs',()=>{
 const h=createCandidateNodeSupport({}).nodeApplyHandlers.get('research.factor_analysis');
 assert.deepEqual(h.modes,['pca_fixed']);
 assert.equal(NODE_TYPES['research.factor_analysis'].tabular_outputs,2);
 assert.ok(nodeApplyInputSchema.properties.parameters.properties.factor_analysis);
 h.validate(parameters,'pca_fixed',request);
});
test('reject incomplete, unsupported or inconsistent PCA settings before UI',()=>{
 for(const p of [{},{factor_analysis:{features:['X','X'],factors:2,rotation:'none'}},{factor_analysis:{features:['X','Y'],factors:3,rotation:'none'}},{factor_analysis:{features:['X','Y'],factors:2,rotation:'varimax'}},{factor_analysis:{...parameters.factor_analysis,seed:42}}])assert.throws(()=>validateFactorAnalysisParameters(p,'pca_fixed',request));
 validateFactorAnalysisParameters({},'pca_fixed',{...request,target:{kind:'existing'}});
 assert.throws(()=>validateFactorAnalysisParameters(parameters,'apply',request));
 assert.throws(()=>resolveFactorAnalysisFeatures({factor_analysis:{features:['Tag']}},fields));
 assert.throws(()=>resolveFactorAnalysisFeatures({factor_analysis:{features:['Z','X']}},fields));
 resolveFactorAnalysisFeatures(parameters,fields);
});
test('native P factor fields persist for K<P and order is strict',()=>{
 const c={fields,factors:2};
 const scores=factorAnalysisOutputColumns(c,0),loadings=factorAnalysisOutputColumns(c,1);
 assert.deepEqual(scores.map(f=>f.name),['Factor1','Factor2','Factor3','RowID','X','Y','Z','Tag']);
 assert.deepEqual(loadings.map(f=>f.name),['ColumnName','ColumnDisplayName','Factor1','Factor2','Factor3']);
 assert.deepEqual(alignFactorAnalysisOutput(scores,scores),scores);
 assert.throws(()=>alignFactorAnalysisOutput([...scores.slice(0,3),scores[4],scores[3],...scores.slice(5)],scores));
 assert.throws(()=>alignFactorAnalysisOutput(scores.slice(1),scores));
});
