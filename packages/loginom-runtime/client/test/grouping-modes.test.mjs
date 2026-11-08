import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupingParameters,resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
import {groupingMeasureSchema} from '../lib/node-api.mjs';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

const field=name=>({kind:'input_field',name});
const measure=(name,fn,output)=>({field:field(name),function:fn,name:output,label:output});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
// LAB-998 native FactorEditDialog;grpFactors chb-6/7/9;DisplayEl.
const cases=[['mode',64,'Mode','Мода',['integer','string']],['stddev',128,'Std','Стандартное откл.',['integer']],['null_count',512,'Null','Кол-во пропусков',['integer','string']],['first',1024,'First','Первый',['integer','string']],['last',2048,'Last','Последний',['integer','string']],['only',4096,'Only','Единственный',['integer','string']]];
for(const [fn,bit,suffix,label,types] of cases){
 test(`Grouping ${fn} validates only observed input types and combines native masks`,()=>{
  assert.ok(groupingMeasureSchema.properties.function.enum.includes(fn));
  const p={group_by:[field('Region')],measures:[measure('Amount',fn,'Metric')]};
  validateGroupingParameters(p,'aggregate',request);
  for(const type of ['integer','real','string','boolean','datetime','variant']){
   const fields=[{name:'Region',type:'string'},{name:'Amount',type}];
   if(!types.includes(type)){assert.throws(()=>resolveGroupingParameters(p,fields),/incompatible/);continue;}
   assert.deepEqual(resolveGroupingParameters(p,fields).functions,[{name:'Amount',mask:bit}]);
   assert.deepEqual(resolveGroupingParameters({...p,measures:[measure('Amount','count','Rows'),...p.measures]},fields).functions,[{name:'Amount',mask:bit|2}]);
  }
 });
 for(const type of types)test(`Grouping ${fn}/${type} resolves native suffixed sources and preserves saved configuration`,async()=>{
  const outputType=fn==='stddev'?'real':fn==='null_count'?'integer':type;
  const c={keys:[{name:'Region',label:'Region',type:'string'}],measures:[{name:'Amount',label:'Amount',type,functions:bit}]};
  const p={group_by:[field('Region')],measures:[measure('Amount',fn,'Metric')]};
  const sources=[{record_id:'s0',name:'Region',label:'Region',type:'string'},{record_id:'s1',name:'Amount_'+suffix,label:'Amount|'+label,type:outputType}];
  const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:sources,
   target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,name:i?'Amount':s.name,source:{...s},inherited:false,excluded:false}))};
  assert.deepEqual(groupingOutputDefinitions(c).map(f=>[f.name,f.type]),[['Region','string'],['Amount',outputType]]);
  const resolved=resolveGroupingOutput(c,p,native);
  assert.deepEqual(resolved.fields.map(f=>[f.source.name,f.name,f.current.type]),[['Region','Region','string'],['Amount_'+suffix,'Metric',outputType]]);
  const channel={observe:async o=>{const s={wizard:{stage:'grouping'},node_grouping:{...c,verified:true}};assert.ok(o.ready(s));return s;},perform:()=>assert.fail('preservation must not mutate')};
  assert.equal((await configureGrouping(channel,{})).preservation.unchanged,true);
  const wrong=structuredClone(native);wrong.source_fields[1].name='Amount_StdDev';wrong.target_fields[1].source.name='Amount_StdDev';
  assert.throws(()=>resolveGroupingOutput(c,p,wrong),/source differs/);
  c.measures[0].functions|=2;
  assert.deepEqual(groupingOutputDefinitions(c).map(f=>f.name),['Region','Amount_Count','Amount_'+suffix]);
 });
}
