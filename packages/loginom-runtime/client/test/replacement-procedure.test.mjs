import test from 'node:test';import assert from 'node:assert/strict';
import {revealReplacementAdd,replacementRealEditorText} from '../lib/replacement-procedure.mjs';
test('numeric patch writes requested native tolerance, commits blur, and preserves saved precision on empty patch',async()=>{
 const {configureReplacement}=await import('../lib/replacement-procedure.mjs');
 for(const separator of ['.',',']){
  const native={verified:true,input_fields:[{record_id:'n',name:'N',label:'N',type:'real',mode:'manual'}],selected:'N',result_type:'real',mode:'exact',pairs:[],other:{mode:'keep'},precision:1,precision_decimal_separator:separator,editor_open:false};
  const s={wizard:{root_tid:'w',stage:'replacement'},node_replacement:native,ui:{elements:['fill','press'].map(verb=>({tid:'w;ReplaceColumnsWizard;edPrecision',ref:verb,allowed_actions:[verb]}))}},actions=[];
  const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{const a=o.resolve(s);actions.push(a);if(a.verb==='press'){assert.equal(a.key,'Tab');native.precision=Number(actions.at(-2).text.replace(',','.'));}}};
  const rule={field:{kind:'input_field',name:'N'},type:'real',pairs:[],other:{mode:'keep'},precision:0.25};
  assert.equal((await configureReplacement(channel,{rules:[rule],output_mode:'replace'})).configuration.rules[0].precision,0.25);
  assert.deepEqual(actions.map(a=>a.verb),['fill','press']);assert.equal(actions[0].text,'0'+separator+'25');
  actions.length=0;assert.equal((await configureReplacement(channel,{})).configuration.rules[0].precision,0.25);assert.equal(actions.length,0);
 }
});
test('real values follow the observed native decimal separator without scaling or rounding',()=>{
 for(const [separator,pair,remaining] of [['.','9.125','-5.25'],[',','9,125','-5,25']]){
  assert.equal(replacementRealEditorText(9.125,separator),pair);
  assert.equal(replacementRealEditorText(-5.25,separator),remaining);
 }
 for(const separator of [undefined,null,';', ''])assert.throws(()=>replacementRealEditorText(1.25,separator),/Observed.*separator/);
});
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

test('Boolean and mixed configuration use owned editors and reexecution preserves both groups',async()=>{
 const {configureReplacement}=await import('../lib/replacement-procedure.mjs');
 const value=(value,type='string')=>({type,value});
 for(const mode of ['exact','mixed']){
  const rule={field:{kind:'input_field',name:'Code'},type:'string',case_sensitive:true,pairs:mode==='exact'?[{from:value('yes'),to:value(true,'boolean')},{from:value('no'),to:value(false,'boolean')}]:[{from:value('AB-12'),to:value('EXACT-FIRST')}],other:{mode:mode==='exact'?'null':'keep'},...(mode==='exact'?{result_type:'boolean'}:{regex_pairs:[{from:value('AB-([0-9]{2})'),to:value('REGEX')}]})};
  const n={verified:true,inventory_complete:true,input_fields:[{record_id:'field',name:'Code',label:'Code',type:'string',mode:'manual'}],selected:'Code',result_type:'string',mode:null,pairs:[],other:{mode:'keep'},case_sensitive:true,precision:0,editor_open:false};
  const controls=['btnTypeChange','itmTypeChangeBoolean','ReplaceEditor;fldVariant;ValueContainer;txt','ReplaceEditor-1;fldVariant;ValueContainer;txt','ReplaceEditor-1;fldVariant;ValueContainer;cbx;trg_picker','ReplaceEditor-1;fldVariant;ValueContainer;cbx;boundlist;true','ReplaceEditor-1;fldVariant;ValueContainer;cbx;boundlist;false','cbxReplaceOther;trg_picker','cbxReplaceOther;boundlist;На_пропущенное',...[0,1].map(i=>'grdReplaceItems;tbl;GroupHeader;'+i+';AddButton')];
  const s={wizard:{stage:'replacement',root_tid:'w'},node_replacement:n,ui:{elements:[]}},actions=[];let serial=0,editing=null;
  const sync=()=>{s.ui.elements=controls.map(t=>({tid:'w;ReplaceColumnsWizard;'+t,ref:t,allowed_actions:['click','fill','press']})).concat([{tid:'roweditorbuttons;update',ref:'update',allowed_actions:['click']}],n.pairs.flatMap(p=>['from','delete'].map(part=>({ref:part+':'+p.record_id,replacement_field:{field_key:'Code',role:'pair',part,record_id:p.record_id},allowed_actions:['click','double_click']}))));};sync();
  const channel={observe:async o=>{sync();assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
   sync();const a=o.resolve(s);actions.push(a);const tid=a.ref;
   if(tid==='itmTypeChangeBoolean')n.result_type='boolean';
   if(tid.startsWith('grdReplaceItems;tbl;GroupHeader;')){const group=Number(tid.split(';')[3]);n.pairs.push({record_id:'p'+serial++,collection_id:group,index:n.pairs.filter(p=>p.collection_id===group).length,from:value(''),to:value(n.result_type==='boolean'?null:'',n.result_type)});}
   if(tid.startsWith('from:')){editing=n.pairs.find(p=>p.record_id===tid.slice(5));n.editor_open=true;}
   if(tid.startsWith('delete:'))n.pairs=n.pairs.filter(p=>p.record_id!==tid.slice(7));
   if(a.verb==='fill')editing[tid.startsWith('ReplaceEditor-1')?'to':'from']=value(a.text);
   if(tid.includes(';cbx;boundlist;'))editing.to=value(tid.endsWith(';true'),'boolean');
   if(tid==='update'){n.editor_open=false;n.mode=n.pairs.some(p=>p.collection_id===1)?n.pairs.some(p=>p.collection_id===0)?'mixed':'regex':'exact';}
   if(tid==='cbxReplaceOther;boundlist;На_пропущенное')n.other={mode:'null'};
  }};
  const result=await configureReplacement(channel,{rules:[rule],output_mode:'replace'},{mode});
  assert.equal(result.verified,true);assert.deepEqual(result.configuration.rules,[rule]);
  if(mode==='exact')assert.deepEqual(n.pairs.map(p=>p.to.value),[true,false]);
  else assert.deepEqual(n.pairs.map(p=>p.collection_id),[0,1]);
  actions.length=0;assert.deepEqual((await configureReplacement(channel,{}, {mode})).configuration.rules,[rule]);assert.equal(actions.length,0);
 }
});
