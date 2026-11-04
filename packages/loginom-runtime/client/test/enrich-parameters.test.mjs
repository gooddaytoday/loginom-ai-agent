import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEnrichParameters,resolveEnrichTables,enrichOutputFields,validateEnrichSchemas} from '../lib/enrich-parameters.mjs';

const field=(name,type='string')=>({name,label:name,type});
const schemas=[
 [field('RowID','integer'),field('Key','integer'),field('Amount','real'),field('Note')],
 [field('Key','integer'),field('Name'),field('Rate','real')],
 [field('Key','integer'),field('Name')],
];
const request={target:{kind:'new'},inputs:[{input:0},{input:1},{input:2}],read:{ports:[0]},finish:'execute',mappings:[]};
const valid=()=>({enrichment:{prefixes:{enabled:true,name:'Ref',label:'Lookup'},tables:[
 {port:1,keys:[{main:'Key',lookup:'Key'}]},
 {port:2,keys:[{main:'Key',lookup:'Key'}]},
]}});

test('enrich resolves independent lookups against main, excludes keys and retains exact scalar types',()=>{
 const p=valid();
 validateEnrichParameters(p,'left',request);
 const result=validateEnrichSchemas({...request,parameters:p},schemas);
 assert.deepEqual(result.mappings,[
  {port:1,pairs:[{main:'Key',source:'Key'}],unmatched:['Name','Rate']},
  {port:2,pairs:[{main:'Key',source:'Key'}],unmatched:['Name']},
 ]);
 assert.deepEqual(result.fields.map(({name,label,type})=>({name,label,type})),[
  ...schemas[0],field('RefName'),field('RefRate','real'),field('RefName_1'),
 ].map((f,i)=>({...f,label:i===4||i===6?'LookupName':i===5?'LookupRate':f.label})));
});

test('enrich supports one lookup with composite keys and different technical names',()=>{
 const p={enrichment:{prefixes:{enabled:false,name:'Ref',label:'Lookup'},tables:[{port:1,keys:[
  {main:'Code',lookup:'LookupCode'},{main:'Zone',lookup:'Area'},
 ]}]}};
 const input_fields=[[field('RowID','integer'),field('Code','integer'),field('Zone')],
  [field('LookupCode','integer'),field('Area'),field('Name')]];
 validateEnrichParameters(p,'left',{...request,inputs:request.inputs.slice(0,2)});
 const mappings=resolveEnrichTables(p,input_fields);
 assert.deepEqual(enrichOutputFields({input_fields,mappings,prefixes:p.enrichment.prefixes}).map(f=>f.name),['RowID','Code','Zone','Name']);
 assert.equal(mappings[0].pairs.length,2);
});

test('enrich rejects unsupported modes, missing keys, third lookup and ambiguous declarations before effects',()=>{
 for(const edit of [
  p=>delete p.enrichment,p=>p.extra=true,p=>p.enrichment.extra=true,
  p=>p.enrichment.tables=[],p=>p.enrichment.tables[0].keys=[],
  p=>p.enrichment.tables[0].keys.push({main:'Key',lookup:'Name'}),
  p=>p.enrichment.tables[0].keys.push({main:'RowID',lookup:'Key'}),
  p=>p.enrichment.tables[0].port=2,
  p=>p.enrichment.tables.push({port:3,keys:[{main:'Key',lookup:'Key'}]}),
  p=>delete p.enrichment.prefixes.enabled,p=>p.enrichment.prefixes.name='9bad',
  p=>p.enrichment.tables[0].keys[0].lookup='',
  p=>p.enrichment.tables[0].keys[0].expression='Key',
 ]){const p=valid();edit(p);assert.throws(()=>validateEnrichParameters(p,'left',request));}
 assert.throws(()=>validateEnrichParameters(valid(),'inner',request));
 assert.throws(()=>validateEnrichParameters(valid(),'left',{...request,inputs:[{input:0},{input:1}]}));
 assert.throws(()=>validateEnrichParameters(valid(),'left',{...request,read:{ports:[1]}}));
 assert.throws(()=>validateEnrichParameters(valid(),'left',{...request,mappings:[{direction:'output',port:0,changes:[]}]}));
});

test('enrich requires exact names and matching key types, never implicit conversion',()=>{
 for(const edit of [
  p=>p.enrichment.tables[0].keys[0].main='key',
  p=>p.enrichment.tables[0].keys[0].lookup='Missing',
  p=>p.enrichment.tables[0].keys[0].lookup='Name',
 ]){const p=valid();edit(p);assert.throws(()=>resolveEnrichTables(p,schemas));}
 assert.throws(()=>resolveEnrichTables(valid(),schemas.slice(0,2)));
});

test('enrich preserves omitted settings only on an existing unchanged source declaration',()=>{
 const existing={...request,target:{kind:'existing'},inputs:[]};
 assert.doesNotThrow(()=>validateEnrichParameters({},'left',existing));
 assert.throws(()=>validateEnrichParameters({},'left',request));
 assert.throws(()=>validateEnrichParameters({},'left',{...existing,inputs:[{input:1}]}));
});

test('enrich output mapping must cover every generated field and preserve unique names',()=>{
 const p=valid();
 const mapping={direction:'output',port:0,autosync:false,fields:validateEnrichSchemas({...request,parameters:p},schemas).fields.map(f=>({source:{kind:'configured_field',name:f.name}}))};
 assert.doesNotThrow(()=>validateEnrichSchemas({...request,parameters:p,mappings:[mapping]},schemas));
 assert.throws(()=>validateEnrichSchemas({...request,parameters:p,mappings:[{...mapping,fields:mapping.fields.slice(1)}]},schemas));
 assert.throws(()=>validateEnrichParameters(p,'left',{...request,mappings:[{direction:'output',port:0,fields:[
  {source:{kind:'configured_field',name:'Key'},name:'Alias'},
  {source:{kind:'configured_field',name:'Amount'},name:'ALIAS'},
 ]}]}));
});
