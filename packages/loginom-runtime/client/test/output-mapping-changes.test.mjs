import test from 'node:test';
import assert from 'node:assert/strict';
import {expandOutputChanges} from '../lib/output-mapping-changes.mjs';
import {resolveConfiguredOutputMapping} from '../lib/port-mapping-procedure.mjs';
import {predictNewCalculatorOutput} from '../lib/calculator-preflight.mjs';
const edit=(name,patch)=>({source:{kind:'configured_field',name},...patch});
const baseline=[edit('A',{name:'AliasA',label:'Custom label',excluded:false}),edit('B',{name:'B',label:'B',excluded:true})];
test('edits preserve unmentioned aliases, exclusions and full order without changing the request',()=>{
 const mapping={direction:'output',port:0,changes:[edit('A',{label:'New label'})]},copy=structuredClone(mapping);
 assert.deepEqual(expandOutputChanges(mapping,baseline).fields,[{...baseline[0],label:'New label'},baseline[1]]);
 assert.deepEqual(mapping,copy);
 assert.deepEqual(expandOutputChanges({...mapping,changes:[]},baseline).fields,baseline);
 const legacy={...mapping,changes:undefined,fields:[edit('A',{})]};
 assert.equal(expandOutputChanges(legacy,baseline),legacy);
});
test('ambiguous edits and mixing with full layouts are rejected',()=>{
 for(const mapping of [
  {direction:'input',changes:[]},{direction:'output',fields:[],changes:[]},
  {direction:'output',changes:[edit('missing',{name:'X'})]},
  {direction:'output',changes:[edit('A',{name:'X'}),edit('A',{label:'Y'})]},
  {direction:'output',changes:[edit('A',{})]},
 ])assert.throws(()=>expandOutputChanges(mapping,baseline));
});
test('native expansion preserves exclusions and enforces collision/inclusion rules',()=>{
 const configured=['A','B'].map(name=>({name,label:name,type:'string',used:true}));
 const sources=configured.map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),required:false}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:sources,
  target_fields:sources.map((s,i)=>({record_id:'t'+i,name:s.name,label:s.name,type:s.type,data_kind:'Дискретный',required:false,inherited:false,excluded:false,source:s}))};
 const mapping={direction:'output',port:0,changes:[edit('A',{name:'Renamed'})]};
 assert.deepEqual(resolveConfiguredOutputMapping(mapping,configured,native).fields.map(f=>f.name),['Renamed','B']);
 assert.throws(()=>resolveConfiguredOutputMapping({...mapping,changes:[edit('A',{name:'B'})]},configured,native),/Duplicate/);
 const excluded=resolveConfiguredOutputMapping({...mapping,changes:[edit('A',{excluded:true})]},configured,native);
 assert.deepEqual(excluded.fields.map(f=>f.excluded),[true,false]);
 assert.throws(()=>resolveConfiguredOutputMapping({...mapping,fields:[],changes:undefined},configured,native),/every configured/);
});
test('calculator preflight expands changes while still rejecting incomplete full layouts',()=>{
 const parameters={expressions:[{target:{kind:'new'},name:'Derived',label:'Derived',type:'real',formula:'A*2',replace:false}]};
 const fields=[{name:'A',label:'A',type:'real'}];
 assert.equal(predictNewCalculatorOutput(parameters,fields,[{direction:'output',port:0,changes:[edit('Derived',{name:'Result'})]}]).length,2);
 assert.throws(()=>predictNewCalculatorOutput(parameters,fields,[{direction:'output',port:0,changes:[edit('Derived',{name:'A'})]}]),/conflicting/);
 assert.throws(()=>predictNewCalculatorOutput(parameters,fields,[{direction:'output',port:0,fields:[edit('Derived',{name:'Result'})]}]),/every configured/);
});
