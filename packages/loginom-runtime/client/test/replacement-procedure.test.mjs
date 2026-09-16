import test from 'node:test';import assert from 'node:assert/strict';
import {revealReplacementAdd} from '../lib/replacement-procedure.mjs';
const state=(top,visible=false)=>({wizard:{root_tid:'w'},node_replacement:{selected:'Category',editor_open:false},ui:{elements:[{ref:'row',replacement_field:{role:'pair',field_key:'Category'},scroll:{ref:'grid',top},allowed_actions:['scroll']},...(visible?[{tid:'w;ReplaceColumnsWizard;grdReplaceItems;tbl;GroupHeader;0;AddButton',allowed_actions:['click']}]:[])]}});
test('long replacement table reveals Add through its bound pair grid',async()=>{const before=state(435),middle=state(35),after=state(0,true),states=[before,middle,after],actions=[];const channel={perform:async p=>actions.push(p.resolve())};assert.equal(await revealReplacementAdd(channel,async()=>states.shift(),()=>true),after);assert.deepEqual(actions,[{verb:'scroll',ref:'row',delta_y:-400},{verb:'scroll',ref:'row',delta_y:-400}]);});
test('visible Add does not scroll and failed or foreign scroll cannot proceed',async()=>{let calls=0;await revealReplacementAdd({perform:async()=>calls++},async()=>state(0,true),()=>true);assert.equal(calls,0);for(const change of [s=>s,s=>{s.node_replacement.selected='Other';return s;},s=>{s.ui.elements[0].scroll.ref='foreign';return s;}]){const states=[state(35),change(state(35))];await assert.rejects(()=>revealReplacementAdd({perform:async()=>{}},async()=>states.shift(),()=>true),/did not move/);}});

test('both colliding partial requests are cancelled before rule or policy changes',async()=>{
 const {configureReplacement}=await import('../lib/replacement-procedure.mjs');
 for(const variant of ['mode','rules','changed-label']){
  const modeOnly=variant==='mode';
  const selected=modeOnly?'A':'B',value=value=>({type:'string',value});
  const rule={field:{kind:'input_field',name:'A'},type:'string',case_sensitive:true,pairs:[{from:value('north'),to:value('North')}],other:{mode:'keep'}};
  const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'wizard',locked:false};
  const native={verified:true,node_context:node,selected,input_fields:['A','A_Replace','B'].map(name=>({name,label:name,type:'string',record_id:name,mode:name===selected?'manual':'none'})),pairs:[{record_id:'pair',from:value('old'),to:value('New')}],other:{mode:'keep'},case_sensitive:true,precision:0,editor_open:false};
  const form='DerivedDataSourceMappingEngineOutputPortWizard',actions=[];
  const s={wizard:{status:'observed',stage:'replacement',root_tid:'w',root_ref:'root',owner_context:{status:'observed'}},prepared_node_context:node,node_replacement:native,node_mapping:{verified:true,produce_mode:'supplement',mapping_wizard:form},ui:{dialogs:[],masks:[],elements:['btnNext','btnPrev','btnClose',form+';rbTable;DisplayEl'].map(t=>({tid:'w;'+t,ref:t,allowed_actions:['click','wizard_step']}))}};
  const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
   if(o.condition==='inspect saved replacement output policy')assert.equal(o.initialObservation?.node_replacement?.verified,true,'Native readiness must survive the real channel resample');
   const a=o.resolve(s);actions.push(a);
   if(a.ref==='btnNext')s.wizard.stage='output_mapping';
   if(a.ref==='btnPrev'){s.wizard.stage='replacement';s.node_replacement.input_fields=s.node_replacement.input_fields.map(f=>({...f,record_id:f.record_id+'-refreshed'}));if(variant==='changed-label')s.node_replacement.input_fields[0].label='Changed';}
   if(a.ref==='btnClose'){s.wizard={status:'absent'};s.prepared_node_context={...node,surface:'graph'};}
  }};
  await assert.rejects(configureReplacement(channel,modeOnly?{output_mode:'add'}:{rules:[rule]}),error=>{
   if(variant==='changed-label'){assert.match(error.message,/inspection changed input fields/);assert.equal(error.nodePhaseRefusal,undefined);return true;}
   assert.match(error.message,/collision: A_Replace/);assert.equal(error.nodePhaseRefusal.settings_unchanged,true);assert.equal(error.nodePhaseRefusal.proof.closed.draft_discarded,true);return true;
  });
  assert.deepEqual(actions.map(a=>a.ref),modeOnly?['btnClose']:['btnNext',form+';rbTable;DisplayEl','btnPrev',...(variant==='changed-label'?[]:['btnClose'])]);
  assert.equal(native.pairs[0].from.value,'old');assert.equal(native.input_fields.find(f=>f.name===selected).mode,'manual');
 }
});
