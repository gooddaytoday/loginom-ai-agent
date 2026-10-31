import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAutoCorrelationParameters,resolveAutoCorrelationField} from '../lib/auto-correlation-parameters.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0]}};
const parameters={autocorrelation:{field:'X',lag_count:4}};
test('time-domain ACF uses its native research node and installed driver',()=>{
 assert.equal(NODE_TYPES['research.auto_correlation'].palette_group,'Исследование');
 assert.equal(NODE_TYPES['research.auto_correlation'].icon_class,'bg-vendor-icon-autocorrelation');
 const handler=createCandidateNodeSupport({}).nodeApplyHandlers.get('research.auto_correlation');
 assert.deepEqual(handler.modes,['time_domain']);
 assert.doesNotThrow(()=>handler.validate(parameters,'time_domain',request));
});
test('new ACF requires one field and positive safe lag count; patches preserve omissions',()=>{
 assert.doesNotThrow(()=>validateAutoCorrelationParameters(parameters,'time_domain',request));
 for(const p of [{},{autocorrelation:{}},{autocorrelation:{field:'X'}},{autocorrelation:{lag_count:4}},
  {autocorrelation:{field:['X'],lag_count:4}},{autocorrelation:{field:'X',lag_count:0}},
  {autocorrelation:{field:'X',lag_count:1.5}},{autocorrelation:{field:'X',lag_count:9007199254740992}},
  {autocorrelation:{field:'X',lag_count:4,pacf:true}},{autocorrelation:null},{field:'X'}])
  assert.throws(()=>validateAutoCorrelationParameters(p,'time_domain',request));
 for(const p of [{},{autocorrelation:{}},{autocorrelation:{lag_count:8}},{autocorrelation:{field:'Y'}}])
  assert.doesNotThrow(()=>validateAutoCorrelationParameters(p,'time_domain',{...request,target:{kind:'existing'}}));
 for(const change of [{inputs:[]},{inputs:[{input:1}]},{mappings:[{direction:'output'}]},{read:{ports:[1]}}])
  assert.throws(()=>validateAutoCorrelationParameters(parameters,'time_domain',{...request,...change}));
 assert.throws(()=>validateAutoCorrelationParameters(parameters,'frequency',request));
});
test('one numeric series replaces all used roles; missing fields and unsupported saved roles refuse',()=>{
 const fields=[{name:'RowID',type:'integer',usage_type:1},{name:'X',type:'real',usage_type:0},{name:'Text',type:'string',usage_type:0}];
 assert.equal(resolveAutoCorrelationField(parameters,fields),'X');
 assert.equal(resolveAutoCorrelationField({},fields),'RowID');
 for(const p of [{autocorrelation:{field:'Text'}},{autocorrelation:{field:'Unknown'}}])
  assert.throws(()=>resolveAutoCorrelationField(p,fields));
 assert.throws(()=>resolveAutoCorrelationField({},fields.map(f=>({...f,usage_type:1}))));
 assert.throws(()=>resolveAutoCorrelationField({},fields.map(f=>({...f,usage_type:0}))));
});
