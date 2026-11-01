import test from 'node:test';import assert from 'node:assert/strict';
import {validateUnionParameters,resolveUnionTables,unionOutputFields,validateUnionSchemas} from '../lib/union-parameters.mjs';
import {readFileSync} from 'node:fs';
const request={target:{kind:'new'},inputs:[{input:0},{input:1},{input:2}],read:{ports:[0]},finish:'execute',mappings:[]};
const valid=()=>({prefixes:{enabled:false,name:'Union',label:'Объединение'},tables:[{port:1,fields:[{source:'Memo',main:'Note'},{source:'Value',main:'Amount'},{source:'Key',main:'Code'}]},{port:2,fields:[{source:'Item',main:'Code'},{source:'Extra',main:null}]}]});
const schemas=[['Code','Amount','Note'],['Memo','Value','Key'],['Item','Extra']].map(ns=>ns.map(name=>({name,label:'Same',type:['Amount','Value'].includes(name)?'integer':'string'})));
test('union resolves reordered names and explicit unmatched columns for three inputs',()=>{const p=valid();validateUnionParameters(p,'append_all',request);const r=validateUnionSchemas({...request,parameters:p},schemas);assert.deepEqual(r.fields.map(f=>f.name),['Code','Amount','Note','Extra']);assert.deepEqual(r.mappings[0].pairs,[{main:'Note',source:'Memo'},{main:'Amount',source:'Value'},{main:'Code',source:'Key'}]);});
test('union refuses incomplete or ambiguous declarations before browser effects',()=>{for(const edit of [p=>p.tables.pop(),p=>p.tables[0].port=2,p=>p.tables[0].fields.push(p.tables[0].fields[0]),p=>p.tables[0].fields[0].main='Code',p=>delete p.prefixes.enabled,p=>p.tables[0].fields[0].main=undefined,p=>p.extra=true]){const p=valid();edit(p);assert.throws(()=>validateUnionParameters(p,'append_all',request));}assert.throws(()=>validateUnionParameters(valid(),'distinct',request));});
test('union rejects field loss, missing targets and implicit conversions',()=>{for(const edit of [p=>p.tables[0].fields.pop(),p=>p.tables[0].fields[0].main='Missing',p=>p.tables[0].fields[0].main='Amount',p=>p.tables[0].fields[0].source='Missing']){const p=valid();edit(p);assert.throws(()=>resolveUnionTables(p,schemas));}});
test('union requires all new inputs but permits adding a third to existing identity',()=>{assert.throws(()=>validateUnionParameters(valid(),'append_all',{...request,inputs:[{input:2}]}));assert.doesNotThrow(()=>validateUnionParameters(valid(),'append_all',{...request,target:{kind:'existing'},inputs:[{input:2}]}));assert.throws(()=>validateUnionParameters(valid(),'append_all',{...request,read:{ports:[1]}}));assert.throws(()=>validateUnionParameters(valid(),'append_all',{...request,finish:'close',mappings:[{direction:'input',port:1}]}));});
test('union separate output fields are explicit and collision-free',()=>{const p=valid(),input_fields=structuredClone(schemas);input_fields[2][1].name='Code';p.tables[1].fields[1].source='Code';const mappings=resolveUnionTables(p,input_fields);assert.throws(()=>unionOutputFields({input_fields,mappings,prefixes:p.prefixes}),/conflict/);p.prefixes.enabled=true;assert.deepEqual(unionOutputFields({input_fields,mappings,prefixes:p.prefixes}).map(f=>f.name),['Code','Amount','Note','UnionCode']);});
test('union complete output mappings cannot silently omit unmatched fields',()=>{assert.throws(()=>validateUnionSchemas({...request,parameters:valid(),mappings:[{direction:'output',port:0,fields:schemas[0].map(f=>({source:{kind:'configured_field',name:f.name}}))}]},schemas),/incomplete/);});
test('union rejects duplicate port aliases before opening any wizard',()=>{assert.throws(()=>validateUnionParameters(valid(),'append_all',{...request,mappings:[{direction:'input',port:1,fields:[{source:{kind:'configured_field',name:'Memo'},name:'Alias'},{source:{kind:'configured_field',name:'Key'},name:'ALIAS'}]}]}),/conflict/);});

const discovery=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/union/acceptance/union-auto-match/discovery-cases.json',import.meta.url)));
const automatic=mode=>({prefixes:{enabled:true,name:'U_',label:'U: '},auto_match:mode,tables:[{port:1,fields:[]}]});
test('union name/type matching accounts for reordered fields, case and incompatible types',()=>{
 const p=automatic('name_type');validateUnionParameters(p,'append_all',{...request,inputs:request.inputs.slice(0,2)});
 assert.deepEqual(resolveUnionTables(p,[discovery.main,discovery.joined]),[{port:1,pairs:[
  {main:'Amount',source:'Amount'},{main:'Code',source:'code'},{main:'CaseKey',source:'casekey'}],unmatched:['Wrong','Other','Solo']}]);
});
test('union label/type ambiguity refuses before selecting the first compatible field',()=>{
 assert.throws(()=>resolveUnionTables(automatic('label_type'),[discovery.main,discovery.joined]),e=>e.code==='UNION_AUTO_MATCH_AMBIGUOUS');
});
test('union explicit pairs and explicit null reserve their sources and destinations before automatic matching',()=>{
 const p=automatic('label_type');p.tables[0].fields=[{source:'Other',main:'Right'},{source:'code',main:null}];
 const r=resolveUnionTables(p,[discovery.main,discovery.joined]);
 assert.deepEqual(r[0].pairs,[{main:'Amount',source:'Amount'},{main:'CaseKey',source:'casekey'},{main:'Right',source:'Other'}]);
 assert.deepEqual(r[0].unmatched,['code','Wrong','Solo']);
});
test('union refuses two implicit sources competing for one main field',()=>{
 assert.throws(()=>resolveUnionTables(automatic('label_type'),[[{name:'A',label:'Same',type:'string'}],[{name:'X',label:'Same',type:'string'},{name:'Y',label:'same',type:'string'}]]),e=>e.code==='UNION_AUTO_MATCH_AMBIGUOUS');
});
test('union label/type matching uses labels independently of names and rejects an unknown mode',()=>{
 const p=automatic('label_type');assert.deepEqual(resolveUnionTables(p,[[{name:'A',label:'Title',type:'string'}],[{name:'B',label:'TITLE',type:'string'}]])[0].pairs,[{main:'A',source:'B'}]);
 assert.throws(()=>validateUnionParameters(automatic('guess'),'append_all',request));
});
