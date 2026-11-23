import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUngroupParameters,resolveUngroupFields,ungroupOutputFields,ungroupSecondaryFields} from '../lib/ungroup-parameters.mjs';
const request={target:{kind:'new'},inputs:[{input:0},{input:1}],read:{ports:[0]},finish:'execute',mappings:[]};
const valid=()=>({ungroup:{keys:[{total:'Group',support:'Group'}],value_field:'Total',item_field:'Item',share_field:'Share',rounding:{format:'none'},balance:'none'}});
const fields=[['Group','Total'],['Group','Item','Share']].map(names=>names.map(name=>({name,label:name,type:['Total','Share'].includes(name)?'real':'string',data_kind:['Total','Share'].includes(name)?'Непрерывный':'Дискретный'})));
test('ungroup accepts explicit shares and all observed rounding/balance combinations',()=>{
 for(const format of ['none','precision','multiple'])for(const balance of ['none','last','proportional','equal']){
  const p=valid();p.ungroup.rounding=format==='none'?{format}:{format,value:format==='precision'?0:3};p.ungroup.balance=balance;
  validateUngroupParameters(p,'shares',request);resolveUngroupFields(p.ungroup,fields);
 }
});
test('ungroup refuses unsupported modes and malformed complete configurations before UI',()=>{
 for(const mode of ['weights','variables'])assert.throws(()=>validateUngroupParameters(valid(),mode,request),/unsupported|shares/i);
 assert.throws(()=>validateUngroupParameters(valid(),'seasonal',request),/seasonality together/);
 for(const mutate of [p=>p.extra=true,p=>p.ungroup.keys=[],p=>p.ungroup.keys.push({total:'GROUP',support:'Other'}),p=>p.ungroup.share_field='Item',p=>p.ungroup.value_field='Group',p=>delete p.ungroup.balance,p=>p.ungroup.rounding={format:'none',value:0},p=>p.ungroup.rounding={format:'precision',value:13},p=>p.ungroup.rounding={format:'multiple',value:0},p=>p.ungroup.variable='V']){
  const p=valid();mutate(p);assert.throws(()=>validateUngroupParameters(p,'shares',request));
 }
});
test('ungroup validates both input identities, port zero and existing preservation',()=>{
 assert.throws(()=>validateUngroupParameters({},'shares',request));
 assert.doesNotThrow(()=>validateUngroupParameters({},'shares',{...request,target:{kind:'existing'},inputs:[]}));
 for(const change of [{inputs:[{input:0}]},{inputs:[{input:0},{input:0}]},{read:{ports:[1]}},{read:{ports:[]}},{mappings:[{direction:'output',port:1}]}])assert.throws(()=>validateUngroupParameters(valid(),'shares',{...request,...change}));
 assert.throws(()=>validateUngroupParameters({},'shares',{...request,target:{kind:'existing'}}));
});
test('ungroup resolves typed roles and deterministic output order',()=>{
 const p=valid().ungroup;resolveUngroupFields(p,fields);
 assert.deepEqual(ungroupOutputFields({input_fields:fields,ungroup:p}).map(f=>[f.name,f.type]),[['Group','string'],['Total','real'],['Total_Rounded','real'],['Item','string'],['OutputValue','real']]);
 for(const mutate of [f=>f[1][0].type='integer',f=>f[0][1].type='string',f=>f[1][2].data_kind='Дискретный',f=>f[1][1].type='integer',f=>f[1][0].name='Other']){
  const f=structuredClone(fields);mutate(f);assert.throws(()=>resolveUngroupFields(p,f));
 }
});
const season=()=>({total_order_field:'Period',support_order_field:'Period',period:'year',multiplier:1,index_count:12,rare_density:0.25,absent_periods:1,novelty_periods:1,max_history_periods:0});
const seasonalFields=[['Group','Period','Total'],['Group','Period','Item','Weight']].map(names=>names.map(name=>({name,label:name,type:name==='Period'?'datetime':['Total','Weight'].includes(name)?'integer':'string',data_kind:['Total','Weight'].includes(name)?'Непрерывный':'Дискретный'})));
const seasonal=()=>({ungroup:{...valid().ungroup,share_field:'Weight'},seasonality:season()});
test('ungroup seasonal accepts explicit annual settings, ports 0/1 and band exclusions only',()=>{
 const bands=['ConfidenceBandUpper','ConfidenceBandLower'].map(name=>({source:{kind:'configured_field',name},excluded:true}));
 const r={...request,read:{ports:[0,1]},mappings:[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'Group'}},...bands]}]};
 validateUngroupParameters(seasonal(),'seasonal',r);
 resolveUngroupFields(seasonal().ungroup,seasonalFields,{seasonality:season()});
 assert.doesNotThrow(()=>validateUngroupParameters({},'seasonal',{...r,target:{kind:'existing'},inputs:[],mappings:[]}));
 assert.throws(()=>validateUngroupParameters(seasonal(),'seasonal',{...r,mappings:[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'OutputSI'},excluded:true}]}]}),/exclusion/);
 assert.throws(()=>validateUngroupParameters(valid(),'shares',r));
 for(const mutate of [p=>delete p.seasonality,p=>p.seasonality.period='month',p=>p.seasonality.index_count=4,p=>p.seasonality.rare_density=0.5,p=>delete p.seasonality.max_history_periods,p=>p.seasonality.extra=1,
  p=>p.ungroup.balance='last',p=>p.ungroup.rounding={format:'precision',value:2},p=>p.ungroup.keys.push({total:'Period',support:'Period'}),p=>p.seasonality.support_order_field='Item']){
  const p=seasonal();mutate(p);assert.throws(()=>validateUngroupParameters(p,'seasonal',r));
 }
 assert.throws(()=>validateUngroupParameters({...valid(),seasonality:season()},'shares',request),/seasonality/);
 for(const mutate of [f=>f[0][1].type='string',f=>f[1][1].type='integer',f=>f[0][2].type='real',f=>f[1][3].type='real']){
  const f=structuredClone(seasonalFields);mutate(f);assert.throws(()=>resolveUngroupFields(seasonal().ungroup,f,{seasonality:season()}));
 }
});
test('ungroup seasonal output sets follow the native integer total and real factors',()=>{
 const c={method:'seasonal',input_fields:seasonalFields,ungroup:seasonal().ungroup};
 assert.deepEqual(ungroupOutputFields(c).map(f=>[f.name,f.type]),[['Group','string'],['Period','datetime'],['Total','integer'],['Total_Rounded','integer'],['Item','string'],['OutputValue','integer'],
  ['ConfidenceBandUpper','integer'],['ConfidenceBandLower','integer'],['OutputTrend','integer'],['OutputSI','real'],['OutputVT','integer'],['OutputVTDesc','string']]);
 assert.deepEqual(ungroupSecondaryFields(c,3).map(f=>[f.name,f.type]),[['Item','string'],['Group','string'],['UngroupQuality','real'],['SeasonalIndex1','real'],['SeasonalIndex2','real'],['SeasonalIndex3','real']]);
 assert.deepEqual(ungroupSecondaryFields({...c,method:'computed'},12).map(f=>f.name),['Item','Group']);
});
