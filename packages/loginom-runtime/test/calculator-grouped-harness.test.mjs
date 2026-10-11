import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const path=process.env.CALCULATOR_HARNESS??new URL('../src/acceptance/calculator-grouped-before-done-v1.mjs',import.meta.url).pathname;
const {captureCalculator,captureDraft,validateCapture,CAPTURE_LIMITS}=await import(pathToFileURL(path));
const owner={document_id:'doc',node_id:'node',workflow_id:'flow',owner:'owner',run:'run',lease:'owner:run'};
function fixture(scenario){
 let edited=false;const events=[];
 const region=()=>({name:'Region',record_id:edited?'replaced':'original',excluded:edited,
  ...(edited?{exclusion_source:{record_id:'source',field_id:'20'}}:{source:{record_id:'source',field_id:'20'}})});
 const observe=async()=>({prepared_node_context:{verified:true,surface:'wizard',...owner,
  ...(scenario==='node'?{node_id:'foreign'}:{})},wizard:{status:'observed',stage:'output_mapping',root_tid:'root',root_ref:'ref'},
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
 assert.deepEqual(events,['capture','calculator_capture_before','exclude','capture','calculator_capture_after','cancel','calculator_capture_cancel']);
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
