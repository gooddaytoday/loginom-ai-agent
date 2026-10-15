import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {unionParametersSchema} from '../lib/node-api.mjs';
import {validateUnionParameters,resolveUnionPrefixes,validateUnionSchemas} from '../lib/union-parameters.mjs';
import {configureUnion} from '../lib/union-procedure.mjs';
const preserve=()=>({enabled:false,preserve_native:true});
const parameters=prefixes=>({prefixes,tables:[{port:1,fields:[{source:'A',main:'A'},{source:'Extra',main:null}]}]});
const request={target:{kind:'new'},inputs:[{input:0},{input:1}],mappings:[],read:{ports:[0]},finish:'execute'};
const schema=unionParametersSchema.properties.prefixes;
const validateSchema=new AjvJsonSchemaValidator().getValidator(schema);
for(const invalid of [
 {enabled:true,preserve_native:true}, {enabled:false,preserve_native:false},
 {enabled:false,preserve_native:true,name:'Different_'}, {enabled:false,preserve_native:true,label:'Different: '},
 {enabled:false,preserve_native:true,name:'',label:''}, {enabled:false,preserve_native:null},
 {enabled:false}, {preserve_native:true}, {enabled:false,name:'Different_'},
 {enabled:false,name:'Different_',label:'Different: ',extra:true},
])test('preserve-native rejects malformed or mixed intent before observation: '+JSON.stringify(invalid),async()=>{
 assert.equal(validateSchema(invalid).valid,false);
 assert.throws(()=>validateUnionParameters(parameters(invalid),'append_all',request));
 let calls=0;
 await assert.rejects(configureUnion({observe:async()=>{calls++;},perform:async()=>{calls++;}},parameters(invalid),{request}),/Explicit union prefix settings required/);
 assert.equal(calls,0);
});
test('preserve-native schema admits only the explicit new form alongside unchanged explicit values',()=>{
 for(const prefixes of [preserve(),{enabled:false,name:'',label:''},{enabled:false,name:'Different_',label:'Different: '},{enabled:true,name:'Joined_',label:'Присоединённое: '}]){
  assert.doesNotThrow(()=>validateActionParameters(schema,prefixes));
  assert.equal(validateSchema(prefixes).valid,true);
  assert.doesNotThrow(()=>validateUnionParameters(parameters(prefixes),'append_all',request));
 }
 const fields=[[{name:'A',label:'A',type:'string'}],[{name:'A',label:'A',type:'string'},{name:'Extra',label:'Extra',type:'string'}]];
 assert.deepEqual(validateUnionSchemas({...request,parameters:parameters(preserve())},fields).fields.map(f=>f.name),['A','Extra']);
});
function fixture(prefixes){
 const c={verified:true,inventory_complete:true,node_context:{node_id:'same-owned-union'},prefixes:{...prefixes},input_fields:[[{name:'A',type:'string'}],[{name:'A',type:'string'},{name:'Extra',type:'string'}]],mappings:[{port:1,pairs:[{main:'A',source:'A'}],unmatched:['Extra']}]};
 const tid='W;UnionDataWizard;cntUsePrefixes;cnt;chb;InputEl';
 const snapshot={wizard:{stage:'union',root_tid:'W'},node_union:c,ui:{elements:[{tid,ref:'owned-prefix-checkbox',allowed_actions:['set_checked']}]}};
 let reads=0;const gestures=[];
 const channel={observe:async o=>{reads++;assert.equal(o.readUnion,true);assert.equal(o.ready(snapshot),true);return structuredClone(snapshot);},perform:async o=>{
  assert.equal(o.ready(snapshot),true);const a=o.resolve(snapshot);gestures.push(a);
  assert.deepEqual(a,{verb:'set_checked',ref:'owned-prefix-checkbox',checked:false});
  c.prefixes.enabled=false;
 }};
 return {c,channel,gestures,reads:()=>reads};
}
for(const strings of [{name:'Different_',label:'Different: '},{name:'',label:''},{name:'Иное',label:''}])for(const enabled of [false,true])
 test('preserve binds same-node actual strings without textbox writes '+JSON.stringify({enabled,...strings}),async()=>{
  const f=fixture({enabled,...strings}),p=parameters(preserve()),original=structuredClone(p);
  const r=await configureUnion(f.channel,p,{request});
  assert.deepEqual(r.configuration.prefixes,{enabled:false,...strings});
  assert.deepEqual(f.gestures,enabled?[{verb:'set_checked',ref:'owned-prefix-checkbox',checked:false}]:[]);
  assert.deepEqual(p,original);assert.equal(r.configuration.node_context.node_id,'same-owned-union');
 });
test('baseline and explicit empty requests still refuse different native strings before any prefix gesture',async()=>{
 for(const prefixes of [{enabled:false,name:'Union',label:'Объединение'},{enabled:false,name:'',label:''}]){
  const f=fixture({enabled:false,name:'Different_',label:'Different: '});
  await assert.rejects(configureUnion(f.channel,parameters(prefixes),{request}),/Union disabled prefix values differ from native settings; persistence cannot be verified/);
  assert.equal(f.reads(),1);assert.deepEqual(f.gestures,[]);
 }
});
test('preserve refuses incomplete native strings and never falls back to a baseline',async()=>{
 for(const prefix of [{enabled:false},{enabled:false,name:null,label:''},{enabled:false,name:'A',label:undefined}]){
  const f=fixture(prefix);
  await assert.rejects(configureUnion(f.channel,parameters(preserve()),{request}),/Union native prefix settings unavailable/);
  assert.deepEqual(f.gestures,[]);
 }
});
test('binding copies primitives and retains the original preserve intent unchanged',()=>{
 const intent=preserve(),native={enabled:true,name:'Different_',label:'Different: '};
 const resolved=resolveUnionPrefixes(intent,native);native.name='later';native.label='later';
 assert.deepEqual(resolved,{enabled:false,name:'Different_',label:'Different: '});assert.deepEqual(intent,preserve());
});
test('preserve cannot adopt changed strings after disabling the checkbox',async()=>{
 const f=fixture({enabled:true,name:'Different_',label:'Different: '}),perform=f.channel.perform;
 f.channel.perform=async o=>{await perform(o);f.c.prefixes.name='replacement';};
 await assert.rejects(configureUnion(f.channel,parameters(preserve()),{request}),/Union preserved native prefix values changed/);
 assert.equal(f.gestures.length,1);
});
test('Close still skips prefix configuration and does not resolve or edit request strings',async()=>{
 const f=fixture({enabled:true,name:'Different_',label:'Different: '}),before=structuredClone(f.c);
 const r=await configureUnion(f.channel,parameters(preserve()),{request:{finish:'close'}});
 assert.equal(r.draft_edits_skipped,true);assert.equal(r.effect_possible,false);
 assert.deepEqual(f.c,before);assert.deepEqual(f.gestures,[]);
});
