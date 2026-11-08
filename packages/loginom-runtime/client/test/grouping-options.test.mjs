import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupingParameters} from '../lib/grouping-parameters.mjs';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {groupingParametersSchema,nodeApplyInputSchema} from '../lib/node-api.mjs';

const options={cache_groups:'pedDimCache',sort_result:'pedSortResult'};
const request={target:{kind:'existing'},inputs:[],read:{ports:[0]},mappings:[],finish:'execute'};
for(const key of Object.keys(options))test(`Grouping ${key} accepts only literal booleans on existing or complete new nodes`,()=>{
 assert.equal(groupingParametersSchema.properties[key]?.type,'boolean');
 assert.equal(nodeApplyInputSchema.properties.parameters.properties[key]?.type,'boolean');
 for(const value of [true,false])assert.doesNotThrow(()=>validateGroupingParameters({[key]:value},'aggregate',request));
 for(const value of [null,0,1,'true',{},[]])assert.throws(()=>validateGroupingParameters({[key]:value},'aggregate',request));
 assert.throws(()=>validateGroupingParameters({[key]:true},'aggregate',{...request,target:{kind:'new'}}));
});

function fixture(){
 const concat={separator:',',wrapper:'',unique:true,sort:false,direction:0};
 const fields=[{record_id:'key',name:'Region',label:'Region',type:'string',disposition:6,order:0,functions:0,concat},
  {record_id:'amount',name:'Amount',label:'Amount',type:'integer',disposition:7,order:0,functions:1,concat}];
 const native={verified:true,input_fields:fields,keys:fields.slice(0,1),measures:fields.slice(1),selected_records:['amount'],
  options:{pedDimCache:{value:true,switch_pressed:false},pedSortResult:{value:false,switch_pressed:false}}};
 const actions=[];
 const state=()=>({wizard:{stage:'grouping',root_tid:'W'},node_grouping:structuredClone(native),ui:{elements:[
  ...Object.values(options).map(k=>({tid:`W;GroupDataWizard;${k};ValueControl;DisplayEl`,ref:k,allowed_actions:['set_checked'],check_state:{checked:native.options[k].value}})),
  {ref:'key',grouping_field:{field_key:'Region',role:'group'},allowed_actions:['click']},
  {ref:'amount',grouping_field:{field_key:'Amount',role:'measure'},allowed_actions:['click']} ]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=state();assert.ok(o.ready(s));const a=o.resolve(s);actions.push(a);
  if(a.verb==='set_checked')native.options[a.ref].value=a.checked;
  else if(a.verb==='click')native.selected_records=[a.ref];
  else assert.fail(JSON.stringify(a));
  channel.afterAction?.(native,a);
 }};
 return {native,channel,actions};
}
for(const [key,control] of Object.entries(options))for(const full of [false,true])test(`Grouping ${key} toggles on the same node, preserves other settings, full=${full}`,async()=>{
 const f=fixture(),original=structuredClone(f.native);
 const lists=full?{group_by:[{kind:'input_field',name:'Region'}],measures:[{field:{kind:'input_field',name:'Amount'},function:'sum',name:'Metric',label:'Metric'}]}:{};
 for(const value of [false,true,false]){
  const result=await configureGrouping(f.channel,{...lists,[key]:value});
  assert.equal(result.configuration.options[control].value,value);
  for(const other of Object.values(options).filter(k=>k!==control))assert.deepEqual(f.native.options[other],original.options[other]);
  assert.deepEqual(f.native.input_fields,original.input_fields);
  const count=f.actions.filter(a=>a.verb==='set_checked').length;
  await configureGrouping(f.channel,{...lists,[key]:value});
  assert.equal(f.actions.filter(a=>a.verb==='set_checked').length,count,'same option value has no gesture');
 }
 const count=f.actions.length;
 assert.equal((await configureGrouping(f.channel,{})).preservation.unchanged,true);
 assert.equal(f.actions.length,count);
});
for(const fault of ['ignored','other-option','binding'])test(`Grouping options refuse ${fault} readback`,async()=>{
 const f=fixture();
 if(fault==='binding')f.native.options.pedSortResult.switch_pressed=true;
 else f.channel.afterAction=n=>{if(fault==='ignored')n.options.pedSortResult.value=false;else n.options.pedDimCache.value=false;};
 await assert.rejects(configureGrouping(f.channel,{sort_result:true}),/option|literal/i);
});
test('Grouping validates supported saved measures before any option gesture',async()=>{
 const f=fixture();f.native.measures[0].functions=32768;
 await assert.rejects(configureGrouping(f.channel,{sort_result:true}),/unsupported/);
 assert.equal(f.actions.length,0);
});
test('Grouping can change both literal options together',async()=>{
 const f=fixture();
 const result=await configureGrouping(f.channel,{cache_groups:false,sort_result:true});
 assert.deepEqual(result.configuration.options,{pedDimCache:{value:false,switch_pressed:false},pedSortResult:{value:true,switch_pressed:false}});
 assert.equal(f.actions.length,2);
});
