import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUngroupParameters,resolveUngroupFields,ungroupOutputFields} from '../lib/ungroup-parameters.mjs';
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
 for(const mode of ['computed','seasonal','weights'])assert.throws(()=>validateUngroupParameters(valid(),mode,request),/unsupported|shares/i);
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
