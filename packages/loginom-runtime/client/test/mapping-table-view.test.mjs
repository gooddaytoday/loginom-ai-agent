import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureMappingTableView} from '../lib/mapping-table-view.mjs';
import {readOutputDefinitionPages} from '../lib/import-definition-pages.mjs';
const base='root;DerivedDataSourceOutputSocketWizard;';
function state(links=true){return {wizard:{root_ref:'root-ref',root_tid:'root',stage:'output_mapping'},node_mapping:{
 verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
 node_context:{node_id:'node',output_port:{port:0,port_guid:'port'}},autosync:false,
 source_fields:[{record_id:'s',name:'A',type:'real'}],target_fields:[{record_id:'t',name:'A',type:'real',source:{record_id:'s'}}]},
 ui:{elements:['rbTable','rbLinks'].map((key,i)=>({ref:key,tid:base+key+';DisplayEl',allowed_actions:['click'],
 signature:{check_state:{kind:'radio',source:'loginom_ext',checked:i===0?!links:links}}}))}};}
function fixture({beforeChange,afterChange,lost=false}={}){
 const initial=state(),calls=[];let after=state(false);
 const channel={perform:async o=>{const fresh=structuredClone(initial);beforeChange?.(fresh);assert.equal(o.ready(fresh),true,'gesture precondition');
  calls.push(o.resolve(fresh));if(lost)throw Error('unknown gesture');},observe:async o=>{afterChange?.(after);assert.equal(o.ready(after),true,'postcondition');return after;}};
 return {initial,channel,calls};
}
test('table view preserves fields and links with one confirmed native gesture',async()=>{
 const f=fixture(),r=await ensureMappingTableView(f.channel,f.initial);assert.deepEqual(r.node_mapping,f.initial.node_mapping);
 assert.deepEqual(f.calls,[{verb:'click',ref:'rbTable'}]);
});
test('already selected table is a no-op',async()=>{assert.deepEqual(await ensureMappingTableView({},state(false)),state(false));});
const faults={owner:s=>s.node_mapping.node_context.node_id='other',port:s=>s.node_mapping.node_context.output_port.port_guid='other',
 root:s=>s.wizard.root_ref='other',rootTid:s=>s.wizard.root_tid='other',stage:s=>s.wizard.stage='input_mapping',
 schema:s=>s.node_mapping.target_fields[0].name='B',link:s=>s.node_mapping.target_fields[0].source.record_id='other',
 source:s=>s.node_mapping.source_fields[0].type='integer',autosync:s=>s.node_mapping.autosync=true,
 inventory:s=>s.node_mapping.inventory_complete=false,identity:s=>s.node_mapping.source_identity_verified=false,
 produce:s=>s.node_mapping.produce_mode='replace'};
for(const [name,change] of Object.entries(faults))for(const when of ['beforeChange','afterChange'])
 test('reject '+name+' '+when,async()=>{const f=fixture({[when]:change});await assert.rejects(ensureMappingTableView(f.channel,f.initial));assert.equal(f.calls.length,when==='beforeChange'?0:1);});
test('unknown gesture is never retried or read as successful',async()=>{const f=fixture({lost:true});await assert.rejects(ensureMappingTableView(f.channel,f.initial),/unknown gesture/);assert.equal(f.calls.length,1);});
for(const fault of ['both','neither','duplicate','missing','untrusted'])test('reject ambiguous controls '+fault,async()=>{
 const f=fixture(),es=f.initial.ui.elements;
 if(fault==='both')es[0].signature.check_state.checked=true;
 if(fault==='neither')es[1].signature.check_state.checked=false;
 if(fault==='duplicate')es.push(structuredClone(es[0]));
 if(fault==='missing')es.pop();
 if(fault==='untrusted')es[1].signature.check_state.source='dom';
 await assert.rejects(ensureMappingTableView(f.channel,f.initial));assert.equal(f.calls.length,0);
});
test('definition reader restores Links before any consumer reads complete columns',async()=>{
 let current=state(),gestures=0;
 const channel={observe:async o=>{
  const s=structuredClone(current);
  if(o.outputColumnPage&&!s.ui.elements[1].signature.check_state.checked)s.wizard.output_columns={fields:[{index:0,status:'observed',name:'A'}],
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:1,total_columns:1,next_offset:null}};
  assert.equal(o.ready(s),true);return s;
 },perform:async o=>{assert.equal(o.ready(current),true);assert.deepEqual(o.resolve(current),{verb:'click',ref:'rbTable'});gestures++;current=state(false);}};
 const r=await readOutputDefinitionPages(channel,{expectedCount:1});assert.equal(r.definition_complete,true);assert.equal(gestures,1);
});
