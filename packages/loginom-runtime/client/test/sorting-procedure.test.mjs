import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSorting} from '../lib/sorting-procedure.mjs';

function fixture({newNode=false,locale=true}={}) {
 const fields=[{name:'Amount',label:'Сумма',type:'real'},{name:'Name',label:'Имя',type:'string'}];
 const configuration={verified:true,input_fields:fields,keys:[{...fields[0],record_id:'a',order:0,direction:'ASC'}],selections:{selected:[]},options:{chkLocaleAware:{value:locale,switch_pressed:false},chkBufferWhole:{value:false},cbxMaxThreadCount:{value:0}}};
 const gestures=[];const flags={};
 const snapshot=()=>({wizard:{stage:'sorting',root_tid:'root'},node_sorting:structuredClone(configuration),ui:{elements:[
  ...configuration.keys.flatMap(k=>['field','direction','delete'].map(part=>({ref:k.name+':'+part,tid:part,sorting_field:{field_key:k.name,record_id:k.record_id,role:'selected',part},allowed_actions:['click']}))),
  ...configuration.input_fields.filter(f=>!configuration.keys.some(k=>k.name===f.name)).map(f=>({ref:f.name+':available',tid:'available',sorting_field:{field_key:f.name,record_id:'input-'+f.name,role:'available',part:'field'},allowed_actions:['click']})),
  {ref:'locale',tid:'root;SortingWizard;SortingColumnCollection;chkLocaleAware;ValueControl;DisplayEl',allowed_actions:['set_checked']}
 ]}});
 const channel={observe:async()=>snapshot(),perform:async spec=>{
  const action=spec.resolve(snapshot());gestures.push(action);
  if(flags.failBeforeGesture)throw Error('ownership changed before gesture');
  if(action.ref==='locale')configuration.options.chkLocaleAware.value=action.checked;
  const key=configuration.keys.find(k=>action.ref.startsWith(k.name+':'));
  if(action.ref===key?.name+':field')configuration.selections.selected=[key.record_id];
  if(action.ref===key?.name+':direction'&&!flags.lostChange)key.direction=key.direction==='ASC'?'DESC':'ASC';
  if(action.ref===key?.name+':delete'&&!flags.lostRemoval){configuration.keys=configuration.keys.filter(k=>k!==key);configuration.keys.forEach((k,i)=>k.order=i);configuration.selections.selected=configuration.selections.selected.filter(id=>id!==key.record_id);}
  const available=configuration.input_fields.find(f=>action.ref===f.name+':available');
  if(available&&action.verb==='double_click')configuration.keys.push({...available,record_id:'added-'+available.name,order:configuration.keys.length,direction:'ASC',case_sensitive:true});
  if(flags.changeCache)configuration.options.chkBufferWhole.value=true;
 }};
 return {configuration,flags,gestures,run:p=>configureSorting(channel,p,{newNode})};
}

test('existing empty parameters preserve observed keys and locale without toggles',async()=>{
 const f=fixture({locale:false});const r=await f.run({});assert.equal(r.configuration.options.chkLocaleAware.value,false);assert.deepEqual(f.gestures,[]);
});
function renamedInputFixture(){
 const f=fixture();Object.assign(f.configuration.input_fields[0],{name:'RevenueAlias',label:'Выручка alias'});
 Object.assign(f.configuration.keys[0],{name:'total_revenue',label:'total_revenue',type:null,missing_input:true,direction:'DESC'});return f;
}
test('explicit replacement removes the missing input key and selects the real renamed input field',async()=>{
 const f=renamedInputFixture();const r=await f.run({keys:[{field:{kind:'input_field',name:'RevenueAlias'},direction:'DESC'}]});
 assert.deepEqual(r.configuration.keys.map(k=>({name:k.name,type:k.type,direction:k.direction})),[{name:'RevenueAlias',type:'real',direction:'DESC'}]);
 assert.equal(r.configuration.keys.some(k=>k.missing_input),false);
 assert.deepEqual(r.configuration.selections.selected,['added-RevenueAlias']);
 assert.deepEqual(f.gestures.map(g=>[g.verb,g.ref]),[['click','total_revenue:delete'],['double_click','RevenueAlias:available'],['click','RevenueAlias:field'],['click','RevenueAlias:direction']]);
});
test('empty parameters cannot preserve a missing input key as a valid sorting configuration',async()=>{
 for(const p of [{},{compare_with_locale:false}]){const f=renamedInputFixture();await assert.rejects(f.run(p),/missing|unavailable|replace/i);assert.deepEqual(f.gestures,[]);}
});
test('failed removal of a missing input key stops before adding its replacement',async()=>{
 const f=renamedInputFixture();f.flags.lostRemoval=true;
 await assert.rejects(f.run({keys:[{field:{kind:'input_field',name:'RevenueAlias'},direction:'DESC'}]}),/removal not applied/);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'total_revenue:delete'}]);
});
test('explicit direction changes once and unrequested cache and threads remain unchanged',async()=>{
 const f=fixture();const r=await f.run({keys:[{field:{kind:'input_field',name:'Amount'},direction:'DESC'}],compare_with_locale:false});
 assert.equal(r.configuration.keys[0].direction,'DESC');assert.equal(r.configuration.options.chkBufferWhole.value,false);
 assert.equal(f.gestures.filter(g=>g.ref==='Amount:direction').length,1);assert.deepEqual(f.gestures.at(-1),{verb:'set_checked',ref:'locale',checked:false});
});
test('unknown field fails before any gesture',async()=>{
 const f=fixture();await assert.rejects(f.run({keys:[{field:{kind:'input_field',name:'Missing'},direction:'ASC'}]}),/missing/);assert.deepEqual(f.gestures,[]);
});
test('unconfirmed change never retries a blind direction toggle',async()=>{
 const f=fixture();f.flags.lostChange=true;await assert.rejects(f.run({keys:[{field:{kind:'input_field',name:'Amount'},direction:'DESC'}]}),/direction differs/);
 assert.equal(f.gestures.filter(g=>g.ref==='Amount:direction').length,1);
});
test('foreign ownership and changes to unrelated options cannot succeed',async()=>{
 for(const flag of ['failBeforeGesture','changeCache']){const f=fixture();f.flags[flag]=true;await assert.rejects(f.run({compare_with_locale:false}),/ownership|Unrequested/);}
});
test('new node uses explicit locale default and variable-driven locale fails closed',async()=>{
 const f=fixture({newNode:true,locale:false});await f.run({});assert.equal(f.gestures[0].checked,true);
 const g=fixture();g.configuration.options.chkLocaleAware.switch_pressed=true;await assert.rejects(g.run({}),/Variable-driven/);assert.deepEqual(g.gestures,[]);
});
