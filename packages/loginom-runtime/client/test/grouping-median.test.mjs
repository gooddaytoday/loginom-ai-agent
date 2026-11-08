import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupingParameters,resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
import {groupingMeasureSchema} from '../lib/node-api.mjs';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

const field=name=>({kind:'input_field',name});
const measure=(name,fn,output)=>({field:field(name),function:fn,name:output,label:output});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const parameters={group_by:[field('Region')],measures:[measure('Amount','median','Metric')]};
const fields=[{name:'Region',type:'string'},{name:'Amount',type:'integer'},{name:'Text',type:'string'}];
const configuration={keys:[{name:'Region',label:'Region',type:'string'}],measures:[{name:'Amount',label:'Amount',type:'integer',functions:32}]};

test('Grouping median is advertised and resolves integer input to mask 32',()=>{
 assert.ok(groupingMeasureSchema.properties.function.enum.includes('median'));
 validateGroupingParameters(parameters,'aggregate',request);
 assert.deepEqual(resolveGroupingParameters(parameters,fields).functions,[{name:'Amount',mask:32}]);
 const mixed={...parameters,measures:[measure('Amount','sum','Total'),measure('Amount','median','Metric')]};
 assert.deepEqual(resolveGroupingParameters(mixed,fields).functions,[{name:'Amount',mask:33}]);
 for(const type of ['string','real','boolean','datetime','variant']){
  assert.throws(()=>resolveGroupingParameters(parameters,fields.map(f=>f.name==='Amount'?{...f,type}:f)),/incompatible/);
 }
 for(const fn of ['concat','first','last','only']){
  assert.throws(()=>validateGroupingParameters({...parameters,measures:[measure('Amount',fn,'Bad')]},'aggregate',request));
 }
});

// Independent native observation (LAB-998 discovery): single function binds
// the source Amount_Median / label «Amount|Медиана», real output.
const sources=[{record_id:'s0',name:'Region',label:'Region',type:'string'},{record_id:'s1',name:'Amount_Median',label:'Amount|Медиана',type:'real'}];
const native=()=>({verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:structuredClone(sources),
 target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,name:i===1?'Amount':s.name,source:structuredClone(s),inherited:false,excluded:false}))});
test('Grouping median output is real and binds the Median source',()=>{
 assert.deepEqual(groupingOutputDefinitions(configuration).map(f=>[f.name,f.type,f.label]),[['Region','string','Region'],['Amount','real','Amount|Медиана']]);
 const resolved=resolveGroupingOutput(configuration,parameters,native());
 assert.deepEqual(resolved.fields.map(f=>[f.source.name,f.name,f.current.type]),[['Region','Region','string'],['Amount_Median','Metric','real']]);
 const wrong=native();wrong.source_fields[1].type='integer';wrong.target_fields[1].type='integer';wrong.target_fields[1].source.type='integer';
 assert.throws(()=>resolveGroupingOutput(configuration,parameters,wrong));
});

test('Grouping preserves a saved median mask and still refuses other new bits and types',async()=>{
 const channel=c=>({observe:async options=>{const s={wizard:{stage:'grouping'},node_grouping:{...c,verified:true}};assert.ok(options.ready(s));return s;},perform:()=>assert.fail('preservation must not mutate')});
 assert.equal((await configureGrouping(channel(configuration),{})).preservation.unchanged,true);
 for(const bit of [1024,2048,4096,8192]){
  const c=structuredClone(configuration);c.measures[0].functions|=bit;
  await assert.rejects(configureGrouping(channel(c),{}),/unsupported/);
  assert.throws(()=>groupingOutputDefinitions(c),/Unsupported/);
 }
 for(const type of ['string','real']){
  const c=structuredClone(configuration);c.measures[0].type=type;
  await assert.rejects(configureGrouping(channel(c),{}),/unsupported/);
  assert.throws(()=>groupingOutputDefinitions(c),/Unsupported/);
 }
});
