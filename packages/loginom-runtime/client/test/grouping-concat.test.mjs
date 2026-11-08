import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupingParameters,resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
import {groupingMeasureSchema} from '../lib/node-api.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

const field=name=>({kind:'input_field',name});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const parameters=()=>({group_by:[field('Region')],measures:[{field:field('Amount'),function:'concat',name:'Metric',label:'Metric',concat:{separator:'|',wrapper:'',unique:false,order:'none'}}]});
test('Grouping concat requires complete options only on concat and rejects unsupported input before mutation',()=>{
 assert.ok(groupingMeasureSchema.properties.concat);
 for(const type of ['integer','string','real','boolean','datetime','variant']){
  const p=parameters();validateGroupingParameters(p,'aggregate',request);
  const fields=[{name:'Region',type:'string'},{name:'Amount',type}];
  if(['integer','string'].includes(type))assert.deepEqual(resolveGroupingParameters(p,fields).functions,[{name:'Amount',mask:8192}]);
  else assert.throws(()=>resolveGroupingParameters(p,fields),/incompatible/);
 }
 for(const mutate of [p=>delete p.measures[0].concat,...['separator','wrapper','unique','order'].map(k=>p=>delete p.measures[0].concat[k]),
  p=>p.measures[0].concat.separator='',p=>p.measures[0].concat.separator='x'.repeat(17),p=>p.measures[0].concat.separator='\n',
  p=>p.measures[0].concat.wrapper='?',p=>p.measures[0].concat.unique=1,p=>p.measures[0].concat.order='asc',
  p=>p.measures[0].concat.extra=true,p=>p.measures[0].function='first']){
  const p=parameters();mutate(p);assert.throws(()=>validateGroupingParameters(p,'aggregate',request));
 }
});
test('Grouping concat binds native Concat sources as strings, including combined numeric aggregates',()=>{
 for(const type of ['integer','string']){
  const c={keys:[{name:'Region',label:'Region',type:'string'}],measures:[{name:'Amount',label:'Amount',type,functions:8192}]};
  assert.deepEqual(groupingOutputDefinitions(c).map(f=>[f.name,f.type,f.label]),[['Region','string','Region'],['Amount','string','Amount|Список']]);
  const source_fields=[{record_id:'s0',name:'Region',label:'Region',type:'string'},{record_id:'s1',name:'Amount_Concat',label:'Amount|Список',type:'string'}];
  const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields,
   target_fields:source_fields.map((s,i)=>({...s,record_id:'t'+i,name:i?'Amount':s.name,source:{...s},inherited:false,excluded:false}))};
  assert.deepEqual(resolveGroupingOutput(c,parameters(),native).fields.map(f=>[f.source.name,f.name,f.current.type]),[['Region','Region','string'],['Amount_Concat','Metric','string']]);
  c.measures[0].functions|=2;
  assert.deepEqual(groupingOutputDefinitions(c).map(f=>[f.name,f.type]),[['Region','string'],['Amount_Count','integer'],['Amount_Concat','string']]);
 }
});
