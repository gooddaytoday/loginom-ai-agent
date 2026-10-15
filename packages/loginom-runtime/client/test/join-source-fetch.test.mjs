import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {configureJoinOutput} from '../lib/join-mappings.mjs';
import {verifyJoinSourceFetch} from '../lib/join-output-sync.mjs';
import {ensureGroupingOutputSources} from '../lib/grouping-output-sources.mjs';
import {joinOutputFields} from '../lib/join-parameters.mjs';
const native=JSON.parse(fs.readFileSync(new URL('./fixtures/join-source-fetch-native.json',import.meta.url)));
const configured=joinOutputFields(native.configuration);
const fixture=()=>structuredClone(native);
function channelFor(f){
 const actions=[];
 const channel={actions,observe:async o=>{
  const s=structuredClone(o.condition==='join output inventory'?f.initial:o.condition==='grouping source retrieval available'?f.links:o.condition==='grouping source retrieval settled'?f.loaded:f.after);
  assert(o.ready(s),'semantic readiness refused '+o.condition);return s;
 },perform:async o=>{
  assert(o.ready(o.initialObservation));const action=o.resolve(o.initialObservation);
  assert(o.initialObservation.ui.elements.some(e=>e.ref===action.ref&&e.allowed_actions.includes(action.verb)));
  actions.push(action);
 }};
 return channel;
}
test('real Join caller admits native autosync source fetch 8→21 through the existing hook',async()=>{
 const f=fixture(),channel=channelFor(f);
 const r=await configureJoinOutput(channel,f.configuration,f.parameters,{});
 assert.deepEqual(r.native_mapping,f.after.node_mapping);
 assert.deepEqual(r.changes,[]);assert.equal(channel.actions.length,3);
 assert.deepEqual(r.native_mapping.target_fields.map(f=>f.name),['LKey','Part','RKey','PartR','LValue','RValue']);
});
test('unchanged Grouping default still refuses the same actual helper route',async()=>{
 const f=fixture(),channel=channelFor(f);
 await assert.rejects(ensureGroupingOutputSources(channel,f.initial),/Fetching grouping sources changed/);
 assert.equal(channel.actions.length,3);
});
test('non-expanding source fetch retains the previous strict behavior with autosync off',()=>{
 const f=fixture();f.initial.node_mapping.autosync=false;f.after.node_mapping.autosync=false;
 f.after.node_mapping.target_fields=f.after.node_mapping.target_fields.slice(0,4);
 assert.equal(verifyJoinSourceFetch(f.initial.node_mapping,f.after.node_mapping,configured),true);
 f.after.node_mapping.target_fields[0].field_id='changed';
 assert.throws(()=>verifyJoinSourceFetch(f.initial.node_mapping,f.after.node_mapping,configured),/Fetching grouping sources changed/);
});
const bad={
 'foreign document':f=>f.after.node_mapping.node_context.document_id='foreign',
 'foreign workflow':f=>f.after.node_mapping.node_context.workflow_id='foreign',
 'foreign node':f=>f.after.node_mapping.node_context.node_id='foreign',
 'wrong port':f=>f.after.node_mapping.node_context.output_port.port=1,
 'wrong GUID':f=>f.after.node_mapping.node_context.output_port.port_guid='other',
 'wrong native index':f=>f.after.node_mapping.node_context.output_port.native_index=1,
 'stale opening':f=>f.after.node_mapping.node_context.output_port.opening_operation_id='old',
 'wrong root tid':f=>f.after.node_mapping.node_context.tid='other',
 'missing owner':f=>delete f.after.node_mapping.node_context,
 'missing opening':f=>delete f.initial.node_mapping.node_context.output_port.opening_operation_id,
 'autosync false':f=>f.initial.node_mapping.autosync=false,
 'autosync changed':f=>f.after.node_mapping.autosync=false,
 'incomplete inventory':f=>f.after.node_mapping.inventory_complete=false,
 'unverified sources':f=>f.after.node_mapping.source_identity_verified=false,
 'wrong mapping wizard':f=>f.after.node_mapping.mapping_wizard='OtherWizard',
 'missing source':f=>f.after.node_mapping.source_fields.pop(),
 'duplicate source ID':f=>f.after.node_mapping.source_fields[1].record_id=f.after.node_mapping.source_fields[0].record_id,
 'duplicate source field ID':f=>f.after.node_mapping.source_fields[1].field_id=f.after.node_mapping.source_fields[0].field_id,
 'source schema changed':f=>f.after.node_mapping.source_fields[2].type='integer',
 'retained ID changed':f=>f.after.node_mapping.target_fields[0].field_id='changed',
 'retained definition changed':f=>f.after.node_mapping.target_fields[0].data_kind='Непрерывный',
 'retained order changed':f=>f.after.node_mapping.target_fields.reverse(),
 'retained removed':f=>f.after.node_mapping.target_fields.shift(),
 'ambiguous target ID':f=>f.after.node_mapping.target_fields[1].field_id=f.after.node_mapping.target_fields[0].field_id,
 'unbound source':f=>f.after.node_mapping.target_fields[4].source=null,
 'source identity changed':f=>f.after.node_mapping.target_fields[4].source.record_id='foreign',
 'duplicate binding':f=>f.after.node_mapping.target_fields[5].source=f.after.node_mapping.target_fields[4].source,
 'appended order changed':f=>[f.after.node_mapping.target_fields[4],f.after.node_mapping.target_fields[5]]=[f.after.node_mapping.target_fields[5],f.after.node_mapping.target_fields[4]],
 'new field excluded':f=>f.after.node_mapping.target_fields[4].excluded=true,
 'extra target':f=>f.after.node_mapping.target_fields.push(f.after.node_mapping.target_fields[5]),
};
for(const [name,mutate] of Object.entries(bad))test('Join source fetch refuses '+name,()=>{
 const f=fixture();mutate(f);assert.throws(()=>verifyJoinSourceFetch(f.initial.node_mapping,f.after.node_mapping,configured));
});
for(const [name,mutate] of Object.entries({
 'foreign root':f=>f.after.wizard.root_ref='foreign',
 'foreign prepared owner':f=>f.after.prepared_node_context.node_id='foreign',
 'foreign intermediate root':f=>f.links.wizard.root_ref='foreign',
}))test('real Join caller refuses '+name,async()=>{
 const f=fixture();mutate(f);await assert.rejects(configureJoinOutput(channelFor(f),f.configuration,f.parameters,{}),/semantic readiness refused/);
});
