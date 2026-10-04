import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceCrossTableConfiguration} from '../lib/crosstable-node.mjs';
const root='MF;TF-1;WizrdMCF';
const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'cross',tid:root};
function fixture(fault){
 let stage='crosstable';const calls=[];
 const changed={configuration:{node_context:owner},verified:true};
 // Captured native stage titles differ: the inline mapping page uses its own
 // heading even though its prepared GUID and wizard root remain the same.
 const state=()=>({wizard:{status:'observed',stage,root_tid:root,
  title:stage==='output_mapping'?'Настройка соответствия между столбцами':'Кросс-таблица'},
  prepared_node_context:fault==='owner'&&stage==='output_mapping'?{...owner,node_id:'foreign'}:owner,
  node_crosstable:{verified:true,dialogs:[]},node_mapping:{verified:false,reason:'mapping_render_bound'},
  ui:{elements:[{tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']}]}});
 const channel={async observe(o){calls.push(o);const s=state();if(fault==='title'&&stage==='output_mapping')s.wizard.title='Other';
  if(fault==='root'&&stage==='output_mapping')s.wizard.root_tid='Other';assert.ok(o.ready(s));return s;},
  async perform(o){const s=state();assert.ok(o.ready(s));assert.equal(o.resolve(s).verb,'wizard_step');stage=stage==='crosstable'?'output_mapping':'done';}};
 return {channel,changed,calls};
}
test('new inline output advances without pretending an empty mapping is a full inventory',async()=>{
 const f=fixture();const r=await advanceCrossTableConfiguration(f.channel,f.changed);
 assert.equal(r.validation.status,'accepted_by_loginom_next');assert.equal(r.validation.node_context,owner);
 assert.ok(f.calls.every(o=>o.readMappings!==true));assert.equal(r.configuration,f.changed.configuration);
});
test('deferred inline output still refuses a foreign node, wizard or title',async()=>{
 for(const fault of ['owner','root','title']){
  const f=fixture(fault);await assert.rejects(advanceCrossTableConfiguration(f.channel,f.changed),/inline output owner/);
 }
});
function savedAutosyncFixture(fault){
 let stage='crosstable',value=false,changed=false;const actions=[];
 const state=()=>({wizard:{status:'observed',stage,root_tid:root,root_ref:'wizard',title:stage==='output_mapping'?'Настройка соответствия между столбцами':'Кросс-таблица',
  output_columns:{auto_sync:{status:'observed',value,ref:'auto'},page:{status:'complete_definition_page',schema_id:'schema-'+value,offset:0,limit:8,total_columns:1,returned:1,next_offset:null},
   fields:[{status:'observed',index:0,name:changed?'Unexpected':'Id',label:'Id',type:'integer',data_kind:'Дискретный',source:{status:'rendered_source',label:'Id',type:'integer'}}]}},
  prepared_node_context:fault==='owner'&&value?{...owner,node_id:'foreign'}:owner,node_crosstable:{verified:true,dialogs:[]},
  ui:{elements:[{tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']},
   {tid:root+';DerivedDataSourceMappingEngineOutputPortWizard;rbTable;DisplayEl',ref:'table',allowed_actions:['set_checked'],check_state:{checked:true}},
   {tid:root+';DerivedDataSourceMappingEngineOutputPortWizard;btnAutoSyncThroughColumns',ref:'auto',allowed_actions:['click']}]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){const s=state();assert.ok(o.ready(s));const a=o.resolve(s);actions.push(a);
  if(a.ref==='auto'){value=true;if(fault==='definition')changed=true;}
  else if(stage==='crosstable')stage='output_mapping';else {assert.equal(value,true,'native required mapping requires explicit autosync enable');stage='done';}}};
 return {channel,changed:{verified:true,configuration:{node_context:owner}},actions};
}
const enable={target:{kind:'existing'},mappings:[{direction:'output',port:0,autosync:true}]};
test('explicit saved CrossTable autosync enable precedes native mapping validation',async()=>{
 const f=savedAutosyncFixture();const r=await advanceCrossTableConfiguration(f.channel,f.changed,enable);
 assert.deepEqual(f.actions.map(a=>a.ref),['next','auto','next']);assert.equal(r.inline_autosync.rendered_definition_preserved,true);
 assert.deepEqual(r.inline_autosync.autosync,{before:false,value:true});assert.equal(r.validation.status,'accepted_by_loginom_next');
});
test('inline enable refuses definition or owner drift before the final Next',async()=>{
 for(const fault of ['definition','owner']){const f=savedAutosyncFixture(fault);await assert.rejects(advanceCrossTableConfiguration(f.channel,f.changed,enable));
  assert.deepEqual(f.actions.map(a=>a.ref),['next','auto']);}
});
test('unrequested, false, new-node and other-port autosync never authorize an inline toggle',async()=>{
 for(const request of [undefined,{target:{kind:'existing'},mappings:[]},{target:{kind:'existing'},mappings:[{direction:'output',port:0,autosync:false}]},
  {...enable,target:{kind:'new'}},{target:{kind:'existing'},mappings:[{direction:'input',port:0,autosync:true}]},{target:{kind:'existing'},mappings:[{direction:'output',port:1,autosync:true}]}]){
  const f=savedAutosyncFixture();await assert.rejects(advanceCrossTableConfiguration(f.channel,f.changed,request));assert.ok(f.actions.every(a=>a.ref==='next'));
 }
});
