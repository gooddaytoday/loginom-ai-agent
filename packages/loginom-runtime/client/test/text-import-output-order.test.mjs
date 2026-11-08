import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreImportOutputLayout} from '../lib/text-import-node.mjs';

const names=['Id','Amount','Active','EventAt','Note'];
function mapping(order=names,type='real') {
 const sources=[...names,...(order.includes('Extra')?['Extra']:[])].map((name,index)=>({name,label:name,index,field_id:String(index),record_id:'s'+index,type:name==='Amount'?type:'string'}));
 return {verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:sources,
  target_fields:order.map((name,index)=>({name,label:name,index,record_id:'t'+index,field_id:String(index),type:name==='Amount'?type:'string',data_kind:'Дискретный',source:sources.find(s=>s.name===name)}))};
}
function fixture(native) {
 let selected;
 const state=()=>({node_mapping:structuredClone(native),wizard:{root_ref:'wizard',root_tid:'W',stage:'output_mapping',
  output_columns:{page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:native.target_fields.length,returned:native.target_fields.length,next_offset:null},
   fields:native.target_fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:f.record_id===selected}))}},
  ui:{elements:[...native.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click']})),{ref:'up',tid:'W;ColumnsMappingEngineOutputPortWizard;btnMoveMappingColumnUp',allowed_actions:['click']}]}});
 return {async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){const s=state();assert.ok(o.ready(s));const a=o.resolve(s);
  if(a.ref!=='up'){selected=a.ref;return;}
  const index=native.target_fields.findIndex(f=>f.record_id===selected);
  [native.target_fields[index-1],native.target_fields[index]]=[native.target_fields[index],native.target_fields[index-1]];
  native.target_fields.forEach((f,i)=>f.index=i);
 }};
}
test('native real → string → new Extra → refresh types restores retained positions',async()=>{
 let before=mapping();
 for(const [order,type] of [[['Id','Active','EventAt','Note','Amount'],'string'],[['Id','Amount','Active','EventAt','Note','Extra'],'string'],[['Id','Active','EventAt','Note','Extra','Amount'],'real']]) {
  const after=mapping(order,type);
  await restoreImportOutputLayout(fixture(after),before,after,[]);
  assert.deepEqual(after.target_fields.map(f=>f.source.name),[...names,...(order.includes('Extra')?['Extra']:[])]);
  assert.equal(after.target_fields[1].type,type);assert.equal(after.autosync,true);
  before=structuredClone(after);
 }
});
test('retains user order and aliases by source association, appending new fields',async()=>{
 const order=['Note','Amount','Id','Active','EventAt'],before=mapping(order),after=mapping(['Note','Id','Active','EventAt','Amount','Extra'],'string');
 for(const m of [before,after])Object.assign(m.target_fields.find(f=>f.source.name==='Amount'),{name:'Total',label:'Сумма'});
 await restoreImportOutputLayout(fixture(after),before,after,[]);
 assert.deepEqual(after.target_fields.map(f=>f.name),['Note','Total','Id','Active','EventAt','Extra']);
 assert.equal(after.target_fields[1].label,'Сумма');
});
test('explicit fields and autosync=false keep their existing behavior',async()=>{
 for(const change of ['explicit','off']) {
  const before=mapping(),after=mapping([...names.slice(0,1),...names.slice(2),'Amount'],'string');
  if(change==='off')before.autosync=after.autosync=false;
  const initial=structuredClone(after);
  await restoreImportOutputLayout({observe:()=>assert.fail('no automatic edits')},before,after,change==='explicit'?[{fields:[]}]:[]);
  assert.deepEqual(after,initial);
 }
});
