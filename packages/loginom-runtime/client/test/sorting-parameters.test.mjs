import test from 'node:test';import assert from 'node:assert/strict';
import {validateSortingParameters,resolveSortingParameters,validateSortingInputParameters} from '../lib/sorting-parameters.mjs';
import {resolveConfiguredOutputMapping} from '../lib/port-mapping-procedure.mjs';
const field=name=>({kind:'input_field',name}),req={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const valid=()=>({keys:[{field:field('Amount'),direction:'DESC'},{field:field('Name'),direction:'ASC',case_sensitive:false}],compare_with_locale:false});
const schema=[{name:'Amount',label:'Same',type:'real'},{name:'Name',label:'Same',type:'string'}];
test('sorting binds exact names and preserves mixed priority despite equal labels',()=>{const p=valid();validateSortingParameters(p,'keys',req);assert.deepEqual(resolveSortingParameters(p,schema).map(f=>[f.name,f.direction,f.case_sensitive]),[['Amount','DESC',undefined],['Name','ASC',false]]);});
test('sorting refuses missing fields and requires explicit text comparison',()=>{const p=valid();assert.throws(()=>resolveSortingParameters(p,schema.slice(0,1)),/missing/);delete p.keys[1].case_sensitive;assert.throws(()=>resolveSortingParameters(p,schema),/case_sensitive/);p.keys[1].case_sensitive=true;p.keys[0].case_sensitive=false;assert.throws(()=>resolveSortingParameters(p,schema),/case_sensitive/);});
test('sorting validates complete replacement before effects',()=>{for(const change of [p=>p.keys=[],p=>p.keys.push(p.keys[0]),p=>delete p.keys[0].direction,p=>p.keys[0].direction='desc',p=>p.keys[0].field.kind='label',p=>p.compare_with_locale='false',p=>p.extra=true]){const p=valid();change(p);assert.throws(()=>validateSortingParameters(p,'keys',req));}});
test('sorting preserves existing keys but new nodes require keys',()=>{assert.throws(()=>validateSortingParameters({},'keys',req));assert.doesNotThrow(()=>validateSortingParameters({compare_with_locale:false},'keys',{...req,target:{kind:'existing'},inputs:[]}));assert.throws(()=>validateSortingParameters(valid(),'keys',{...req,inputs:[]}));});
test('existing sorting replaces keys without repeating its current connection',()=>{
 const existing={...req,target:{kind:'existing'},inputs:[]};
 assert.doesNotThrow(()=>validateSortingParameters(valid(),'keys',existing));
 assert.throws(()=>validateSortingParameters(valid(),'keys',{...existing,inputs:[{input:1}]}),/one input/);
 assert.throws(()=>validateSortingParameters(valid(),'keys',{...existing,inputs:[{input:0},{input:0}]}),/one input/);
 assert.throws(()=>validateSortingParameters(valid(),'keys',{...existing,target:{kind:'new'}}),/explicit input/);
});
test('sorting cancellation cannot commit input mapping',()=>assert.throws(()=>validateSortingParameters(valid(),'keys',{...req,finish:'close',mappings:[{direction:'input',port:0}]}),/Close/));
test('variant keys require an explicit case flag just like string keys',()=>{
 const p={keys:[{field:field('Mixed'),direction:'ASC'}]},fields=[{name:'Mixed',label:'Смешанный',type:'variant'}];
 assert.throws(()=>resolveSortingParameters(p,fields),/Explicit case_sensitive/);
 p.keys[0].case_sensitive=false;assert.equal(resolveSortingParameters(p,fields)[0].type,'variant');
});

function mappedInputFixture(){
 const source_fields=[{name:'total_revenue',label:'Сумма',type:'real'},{name:'product',label:'Товар',type:'string'}]
  .map((f,index)=>({...f,record_id:'source-'+index,field_id:String(index),index,required:false}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,mapping_wizard:'TuneDataSourceMappingWizard',source_fields,
  target_fields:source_fields.map((source,index)=>({...source,record_id:'target-'+index,name:index===0?'RevenueAlias':'ProductAlias',source,data_kind:index===0?'Непрерывный':'Дискретный'}))};
 const resolve=mapping=>resolveConfiguredOutputMapping({direction:'input',port:0,...mapping},source_fields.map(f=>({...f,used:true})),native);
 return {native,resolve};
}
test('sorting input validation uses retained native aliases when no field mapping is requested',()=>{
 const f=mappedInputFixture(),resolved=f.resolve({});assert.equal(resolved.fields,null);
 const p={keys:[{field:field('RevenueAlias'),direction:'DESC'},{field:field('ProductAlias'),direction:'ASC',case_sensitive:false}]};
 assert.doesNotThrow(()=>validateSortingInputParameters(p,resolved,f.native));
 for(const name of ['total_revenue','Missing'])assert.throws(()=>validateSortingInputParameters({keys:[{field:field(name),direction:'DESC'}]},resolved,f.native),/missing/);
});
test('full input mapping preserves omitted alias names and validates the complete effective layout',()=>{
 const f=mappedInputFixture(),resolved=f.resolve({fields:[
  {source:{kind:'configured_field',name:'product'},name:'Item'},
  {source:{kind:'configured_field',name:'total_revenue'},label:'Новая метка'},
 ]});
 assert.deepEqual(resolved.fields.map(f=>[f.name,f.type]),[['Item','string'],['RevenueAlias','real']]);
 const p={keys:[{field:field('RevenueAlias'),direction:'DESC'},{field:field('Item'),direction:'ASC',case_sensitive:true}]};
 assert.doesNotThrow(()=>validateSortingInputParameters(p,resolved,f.native));
 assert.throws(()=>validateSortingInputParameters({keys:[{field:field('ProductAlias'),direction:'ASC',case_sensitive:true}]},resolved,f.native),/missing/);
});
test('sorting input validation rejects text flags against effective types before mapping changes',()=>{
 for(const fullMapping of [false,true]){
  const f=mappedInputFixture(),resolved=f.resolve(fullMapping?{fields:f.native.source_fields.map(s=>({source:{kind:'configured_field',name:s.name}}))}:{});
  for(const key of [{field:field('RevenueAlias'),direction:'ASC',case_sensitive:false},{field:field('ProductAlias'),direction:'ASC'}]){
   assert.throws(()=>validateSortingInputParameters({keys:[key]},resolved,f.native),/case_sensitive/);
  }
 }
});
test('sorting input validation is a no-op when keys are not being replaced',()=>{
 for(const p of [{},{compare_with_locale:false}])assert.doesNotThrow(()=>validateSortingInputParameters(p,null,null));
});
