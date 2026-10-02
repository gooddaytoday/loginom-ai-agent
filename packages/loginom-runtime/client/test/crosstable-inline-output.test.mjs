import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceCrossTableConfiguration} from '../lib/crosstable-node.mjs';
const root='MF;TF-1;WizrdMCF';
const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'cross',tid:root};
function fixture(fault){
 let stage='crosstable';const calls=[];
 const changed={configuration:{node_context:owner},verified:true};
 const state=()=>({wizard:{status:'observed',stage,root_tid:root,title:'Кросс-таблица'},
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
