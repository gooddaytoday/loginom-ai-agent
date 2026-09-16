import test from 'node:test';import assert from 'node:assert/strict';
import {configureCollapse} from '../lib/collapse-procedure.mjs';
function fixture(){
 const fields=['Id','A','B','C'].map((name,index)=>({name,label:name,type:index?'real':'integer',index,record_id:'r'+index,disposition:index===0?6:index===1?7:0,order:0}));
 let selected=null,skip=true,moves=0;
 const state=()=>{
  const information=fields.filter(f=>f.disposition===6).sort((a,b)=>a.order-b.order),transposed=fields.filter(f=>f.disposition===7).sort((a,b)=>a.order-b.order);
  return {wizard:{root_tid:'W',stage:'collapse'},node_collapse:{verified:true,inventory_complete:true,input_fields:structuredClone(fields),information:structuredClone(information),transposed:structuredClone(transposed),selections:{available:selected?.disposition===0?[selected.record_id]:[],selected:selected&&selected.disposition!==0?[selected.record_id]:[]},skip_null:{value:skip,switch_pressed:false},node_context:{verified:true}},ui:{elements:[...fields.map(f=>({ref:f.name,collapse_field:{field_key:f.name,record_id:f.record_id,role:f.disposition===0?'available':f.disposition===6?'information':'transposed'},allowed_actions:['click','press']})),...['frmMoveButtons;btnMove0','frmMoveButtons;btnMove1','btnUp','pedSkipNullCases;ValueControl;DisplayEl'].map(k=>({tid:'W;ColumnFlippingWizard;'+k,ref:k,allowed_actions:['click','set_checked']}))]}};
 };
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s));return s;},perform:async o=>{const s=state();assert.ok(o.ready(s));const a=o.resolve(s);moves++;
  if(a.verb==='set_checked')skip=a.checked;
  else if(a.verb==='press'){assert.equal(a.key,'Delete');const old=selected.order,role=selected.disposition;selected.disposition=0;selected.order=-1;fields.filter(f=>f.disposition===role&&f.order>old).forEach(f=>f.order--);}
  else if(a.ref.includes('btnMove')){const role=a.ref.endsWith('0')?6:7;selected.order=fields.filter(f=>f.disposition===role).length;selected.disposition=role;}
  else if(a.ref==='btnUp'){const previous=fields.find(f=>f.disposition===selected.disposition&&f.order===selected.order-1);assert.ok(previous);previous.order++;selected.order--;}
  else selected=fields.find(f=>f.name===a.ref);
 }};
 return {channel,fields,moves:()=>moves,state};
}
const ref=name=>({kind:'input_field',name});
test('collapse replaces roles, orders them and explicitly sets Null policy',async()=>{
 const f=fixture(),r=await configureCollapse(f.channel,{information:[ref('B')],transposed:[ref('C'),ref('A'),ref('Id')],ignore_empty:false});
 assert.deepEqual(r.configuration.information.map(x=>x.name),['B']);assert.deepEqual(r.configuration.transposed.map(x=>x.name),['C','A','Id']);assert.equal(r.configuration.skip_null.value,false);
 const count=f.moves();const again=await configureCollapse(f.channel,{});assert.equal(again.effect_possible,false);assert.equal(f.moves(),count);
});
test('collapse preserves roles for flag-only changes and rejects unknown fields before gestures',async()=>{
 const f=fixture();await assert.rejects(configureCollapse(f.channel,{information:[],transposed:[ref('missing')]}),/missing/);assert.equal(f.moves(),0);
 const r=await configureCollapse(f.channel,{ignore_empty:false});assert.deepEqual(r.configuration.transposed.map(x=>x.name),['A']);assert.equal(f.moves(),1);
});
