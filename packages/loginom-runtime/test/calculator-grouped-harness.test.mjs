import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const path=process.env.CALCULATOR_HARNESS??new URL('../src/acceptance/calculator-grouped-before-done-v1.mjs',import.meta.url).pathname;
const {captureCalculator,captureDraft,validateCapture,captureWindowDiagnostic,CAPTURE_LIMITS}=await import(pathToFileURL(path));
const owner={document_id:'doc',node_id:'node',workflow_id:'flow',owner:'owner',run:'run',lease:'owner:run'};
function fixture(scenario){
 let edited=false;const events=[];
 const region=()=>({name:'Region',record_id:edited?'replaced':'original',excluded:edited,
  ...(edited?{exclusion_source:{record_id:'source',field_id:'20'}}:{source:{record_id:'source',field_id:'20'}})});
 const observe=async()=>({prepared_node_context:{verified:true,surface:'wizard',...owner,
  ...(scenario==='node'?{node_id:'foreign'}:{})},wizard:{status:'observed',stage:'output_mapping',root_tid:'root',root_ref:'ref',owner_context:{status:'observed',node_id:'node'}},
  ...(scenario==='pending'?{pending:true}:{}),...(scenario==='running'?{running:true}:{}),...(scenario==='unknown'?{unknown_effect:true}:{}),
  node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',target_fields:[region()]}});
 const snapshot=async()=>{
  events.push('capture');if(scenario==='capture-error')throw Error('capture-failed');
  return {owner,root_tid:'root',root_ref:scenario==='root'?'foreign':'ref',dom:[],
   stores:[{records:[]},{records:[{internalId:scenario==='record'?'foreign':region().record_id,data:{Name:'Region'}}]}],
   collector_revision:1,predicates:{status:'partial',evaluated:false,cached_windows:[{evaluated:true,value:true},{evaluated:true,value:true}]},...(scenario==='bytes'?{extra:'x'.repeat(CAPTURE_LIMITS.bytes)}:{})};
 };
 return {events,drivers:{owner,current:()=>{if(scenario==='owner')throw Error('owner-changed');},observe,snapshot,
  exclude:async()=>{events.push('exclude');if(scenario==='uncertain')throw Error('unknown-effect');edited=true;return {verified:true,cleanup_complete:true,settings_applied:false};},
  cancel:async()=>{events.push('cancel');
   if(scenario?.startsWith('falsy:'))throw [false,0,'',null,undefined][+scenario.split(':')[1]];
   if(scenario==='error')throw Error('cancel-failed');
   return {verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:scenario==='applied',execution_started:false,node_context:owner};},
  record:async event=>events.push(event.event)}};
}
test('real orchestration pauses before Done and preserves legitimate Region replacement; collector missing stays explicit',async()=>{
 const {drivers,events}=fixture();const result=await captureDraft(drivers);
 assert.equal(result.cancel_verified,true);assert.equal(result.settings_applied,false);assert.equal(result.paused_before_done,true);
 assert.equal(result.capture_complete,false);assert.equal(result.native_verified,false);
 assert.equal(result.region_transition.before.record_id,'original');assert.equal(result.region_transition.after.record_id,'replaced');
 assert.deepEqual(events,['capture','calculator_capture_cached_windows','calculator_capture_before','exclude','capture','calculator_capture_cached_windows','calculator_capture_after','cancel','calculator_capture_cancel']);
});
for(const scenario of ['node','owner','pending','running','unknown','record','root','bytes','capture-error','uncertain','applied','error'])
 test('labelled channel/Ext doubles refuse '+scenario,async()=>{
  const {drivers,events}=fixture(scenario);await assert.rejects(captureDraft(drivers));
  if(['node','owner','pending','running','unknown','record','root','bytes','capture-error'].includes(scenario))assert.equal(events.includes('exclude'),false);
  if(scenario==='uncertain')assert.equal(events.includes('cancel'),false);
 });
for(let i=0;i<5;i++)test('falsy cancellation refusal preserved '+i,async()=>{
 const {drivers}=fixture('falsy:'+i);let caught=false;
 try{await captureDraft(drivers);}catch(e){caught=true;assert.equal(e,[false,0,'',null,undefined][i]);}
 assert.equal(caught,true);
});
test('fixed entry refuses binding before any browser invocation',async()=>{
 let calls=0;await assert.rejects(captureCalculator({binding:{},identity:{},browser:{callTool(){calls++;}},record(){}}));assert.equal(calls,0);
});
test('raw record and DOM bounds refuse without completeness claims',()=>{
 const capture={owner,root_tid:'root',root_ref:'ref',dom:Array(CAPTURE_LIMITS.dom+1),stores:[{records:[]},{records:[]}],collector_revision:1,predicates:{status:'partial',evaluated:false,cached_windows:[{evaluated:true,value:true},{evaluated:true,value:true}]}};
 assert.throws(()=>validateCapture(capture,owner,{root_tid:'root',root_ref:'ref',region:{record_id:'x'}}));
});

for(const invalid of ['source','inventory','Region'])test('owned pure '+invalid+' refusal cancels without mapping qualification',async()=>{
 const {drivers,events}=fixture();const read=drivers.observe;
 drivers.observe=async()=>{const s=await read();
  if(invalid==='source')s.node_mapping.source_identity_verified=false;
  if(invalid==='inventory')s.node_mapping.inventory_complete=false;
  if(invalid==='Region')s.node_mapping.target_fields=[];
  return s;};
 drivers.observeCancellation=async()=>{const s=await read();delete s.node_mapping;return s;};
 await assert.rejects(captureDraft(drivers),{message:invalid==='Region'?'LOGINOM_CAPTURE_REGION':'LOGINOM_CAPTURE_MAPPING'});
 assert.deepEqual(events,['cancel','calculator_capture_cancel']);
});
for(const drift of ['node','root','port','pending','running','unknown','owner'])test('pure refusal cannot cancel after '+drift+' custody loss',async()=>{
 const {drivers,events}=fixture();const read=drivers.observe;let ownerLost=false;
 drivers.current=()=>{if(ownerLost)throw Error('foreign-owner');};
 drivers.observe=async()=>{const s=await read();s.node_mapping.source_identity_verified=false;return s;};
 drivers.observeCancellation=async()=>{const s=await read();
  if(drift==='node')s.prepared_node_context.node_id='foreign';
  if(drift==='root')s.wizard.root_ref='replacement';
  if(drift==='port')s.wizard.owner_context={status:'observed',node_id:'foreign'};
  if(['pending','running'].includes(drift))s[drift]=true;
  if(drift==='unknown')s.unknown_effect=true;
  if(drift==='owner')ownerLost=true;
  return s;};
 await assert.rejects(captureDraft(drivers),{message:'LOGINOM_CAPTURE_MAPPING'});
 assert.equal(events.includes('cancel'),false);
});
for(const primary of [undefined,null,false,0,'',Error('original',{cause:0})])test('capture primary remains exact after confirmed cancel or secondary refusal: '+String(primary),async()=>{
 for(const secondary of [false,true]){
  const {drivers,events}=fixture();drivers.snapshot=async()=>{throw primary;};
  if(secondary)drivers.cancel=async()=>{events.push('cancel');throw Error('secondary');};
  let caught=false;try{await captureDraft(drivers);}catch(e){caught=true;assert.equal(e,primary);}
  assert.equal(caught,true);assert.equal(events.includes('cancel'),true);
  assert.equal(events.includes('calculator_capture_cancel'),!secondary);
 }
});

test('cached-window refusal retains bounded diagnostics before Cancel without weakening the gate',async()=>{
 const {drivers,events}=fixture(),snapshot=drivers.snapshot,records=[];
 drivers.snapshot=async()=>{const c=await snapshot();c.predicates.cached_windows=[
  {evaluated:true,value:false,reason:'rows_incomplete',cache_complete:true,rows_complete:false},
  {evaluated:false,reason:'cache_flags_unavailable'}];return c;};
 drivers.record=async e=>{records.push(e);events.push(e.event);return e;};
 await assert.rejects(captureDraft(drivers),{message:'LOGINOM_CAPTURE_CACHED_WINDOW'});
 assert.equal(records[0].event,'calculator_capture_cached_windows');assert.equal(records[0].stage,'before');
 assert.deepEqual(records[0].diagnostic,{length:2,truncated:false,windows:[
  {evaluated:true,value:false,reason:'rows_incomplete',cache_complete:true,rows_complete:false},
  {evaluated:false,value:null,reason:'cache_flags_unavailable',cache_complete:null,rows_complete:null}]});
 assert.ok(!events.includes('exclude'));assert.ok(!records.some(e=>e.event==='calculator_capture_before'));
 assert.equal(records.at(-1).event,'calculator_capture_cancel');
 assert.ok(!JSON.stringify(records[0]).includes('stores'));assert.ok(!JSON.stringify(records[0]).includes('dom'));
});
test('cached-window diagnostic bounds list and reason, retaining actual length and unknown flags',()=>{
 const r=captureWindowDiagnostic({dom:'private',stores:['private'],predicates:{cached_windows:[
  {evaluated:1,value:'true',reason:'r'.repeat(1000),cache_complete:undefined,rows_complete:null}, {}, {}, {}]}});
 assert.equal(r.length,4);assert.equal(r.truncated,true);assert.equal(r.windows.length,2);
 assert.equal(r.windows[0].reason.length,256);assert.equal(r.windows[0].evaluated,null);assert.equal(r.windows[0].value,null);
 assert.deepEqual(captureWindowDiagnostic({}),{length:null,truncated:false,windows:[]});
});
