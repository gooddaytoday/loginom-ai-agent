import test from 'node:test';
import assert from 'node:assert/strict';
import {observeColdCrossTable} from '../cold-crosstable-settings.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const state=(valid=true)=>({node_crosstable:{verified:valid,inventory_complete:valid,
 ...(valid?{}:{reason:'crosstable_local_variable_owner'}),node_context:{...node,verified:true,surface:'wizard'}}});
const fixture=states=>{
 const calls=[];return {calls,channel:{observe:async()=>{calls.push('observe');return states.shift();},
  configureCrossTableVariables:async values=>{assert.deepEqual(values,[]);calls.push('definitions');return {verified:true,settings_changed:false,settings_applied:false,draft_discarded:true};}},
  helpers:{closePreparedWizard:async()=>{calls.push('cancel');return {verified:true,settings_applied:false};},
   selectSource:async()=>calls.push('select'),openPreparedWizard:async()=>calls.push('open')}};
};
test('a complete unbound configuration needs no definition editor',async()=>{
 const f=fixture([state()]);assert.equal((await observeColdCrossTable(f.channel,{ref:node},f.helpers)).variablesInspected,false);
 assert.deepEqual(f.calls,['observe']);
});
test('missing own definition cache is initialized through one cancelled own UI editor and a new complete observation',async()=>{
 const f=fixture([state(false),state()]);assert.equal((await observeColdCrossTable(f.channel,{ref:node},f.helpers)).variablesInspected,true);
 assert.deepEqual(f.calls,['observe','cancel','definitions','select','open','observe']);
});
test('foreign owners, other failures and repeated incomplete observations refuse',async()=>{
 for(const damage of [s=>s.node_crosstable.node_context.node_id='foreign',s=>s.node_crosstable.reason='crosstable_input_record']){
  const s=state(false);damage(s);const f=fixture([s]);await assert.rejects(observeColdCrossTable(f.channel,{ref:node},f.helpers));assert.deepEqual(f.calls,['observe']);
 }
 const f=fixture([state(false),state(false)]);await assert.rejects(observeColdCrossTable(f.channel,{ref:node},f.helpers));
 assert.equal(f.calls.filter(c=>c==='definitions').length,1);
});
