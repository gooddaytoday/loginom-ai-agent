import test from 'node:test';
import assert from 'node:assert/strict';
import {revealJoinField} from '../lib/join-field-reveal.mjs';
function fixture(fault){
 const input_fields=['L','R'].map(side=>Array.from({length:40},(_,i)=>({name:side+(i+1),record_id:side+i,type:'string'})));
 let top=0;const actions=[];
 const state=()=>({wizard:{stage:'join',root_ref:'wizard'},node_join:{verified:true,input_fields:structuredClone(input_fields),keys:[],mode:'inner',case_sensitive:true,include_joined_keys:false,node_context:{node_id:'owned'}},
  ui:{elements:input_fields.flatMap((fs,side)=>fs.slice(top?20:0,top?40:20).map(f=>({ref:f.record_id,signature:{join_field:{side:side?'right':'left',field_key:f.name,record_id:f.record_id,wizard_root_ref:'wizard',grid_ref:'grid'+side}},scroll:{ref:'grid'+side,top:side?0:top,max_top:500},allowed_actions:['scroll','drag','right_click']})))}});
 const channel={perform:async o=>{const a=o.resolve(o.initialObservation);actions.push(a);if(fault==='lost')throw Error('lost response');if(fault!=='stuck')top=400;},observe:async()=>{const s=state();if(fault==='changed')s.node_join.keys=[{left:'L1',right:'R1'}];return s;}};
 return {initial:state(),channel,actions};
}
test('Join reveals an offscreen key with its own grid anchor before drag or removal',async()=>{
 for(const verb of ['drag','right_click']){const f=fixture();const s=await revealJoinField(f.channel,f.initial,'L40','left',verb);assert.equal(f.actions.length,1);assert.equal(f.actions[0].verb,'scroll');assert.ok(f.actions[0].ref.startsWith('L'));assert.ok(s.ui.elements.some(e=>e.signature.join_field.field_key==='L40'));}
});
test('Join reveal refuses changed settings, stalled scrolling and lost response without retry',async()=>{
 for(const fault of ['changed','stuck','lost']){const f=fixture(fault);await assert.rejects(revealJoinField(f.channel,f.initial,'L40','left','drag'));assert.equal(f.actions.length,1);}
});
test('Join reveal rejects foreign grid, record and wizard anchors before any gesture',async()=>{
 for(const change of [e=>e.signature.join_field.wizard_root_ref='other',e=>e.signature.join_field.record_id='foreign',e=>e.scroll.ref='other']){const f=fixture();f.initial.ui.elements.forEach(change);await assert.rejects(revealJoinField(f.channel,f.initial,'L40','left','drag'));assert.equal(f.actions.length,0);}
});
