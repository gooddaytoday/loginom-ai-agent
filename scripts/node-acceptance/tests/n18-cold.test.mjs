import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyN18JavascriptStep} from '../n18-cold.mjs';

// Run the real cold graph branch; the native wizard dependencies alone are mocked.
const source=readFileSync(new URL('../cold-check.mjs',import.meta.url),'utf8');
const branch=source.match(/  for \(const want of expected\.nodes\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(branch);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const check=new AsyncFunction('graph','expected','load','channelFor','record','verifyN18JavascriptStep',branch);
const node={document_id:'doc',workflow_id:'flow',node_id:'calc'};
const graph=(...types)=>({nodes:types.map(type=>({type,ref:{...node,node_id:type==='transform.calculator'?'calc':type}}))});
const expected=(alternative=true)=>({n18_javascript_step:true,nodes:[{type:'imports.text'},{type:'programming.javascript',...(alternative?{alternative_types:['transform.calculator'],alternative_syntax:'javascript'}:{})},{type:'exports.text'}]});
function fixture({syntax='javascript',stage='calculator',change=()=>{},closed={},nextError}={}){
 const calls=[],records=[];
 const selected={prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'}};
 const state={prepared_node_context:{...node,verified:true,surface:'wizard'},wizard:{stage,root_tid:'wizard'},ui:{elements:[{tid:'wizard;btnNext',ref:'next',enabled:true,allowed_actions:['wizard_step']}]},node_calculator:{verified:true,inventory_complete:true,mode:'expression',syntax,node_context:{...node,verified:true}}};
 change(state);
 const baseline=structuredClone(state);
 const channel={async observe(spec){const graph=spec.condition==='cold n18 Calculator graph';calls.push(graph?'graph':spec.readCalculator?'read':'wizard');const s=graph?selected:state;if(!spec.ready(s))throw Error('NodeReadinessTimeout: NOT_READY');return s;},
  async perform(spec){assert.ok(spec.ready(state));assert.deepEqual(spec.identity(state),state.prepared_node_context);
   const action=spec.resolve(state);assert.deepEqual(action,{verb:'wizard_step',ref:'next',expected_stage:'calculator'});calls.push('next');if(nextError)throw Error(nextError);state.wizard.stage=action.expected_stage;}};
 const modules={
  'client/lib/node-graph-selection.mjs':{async selectPreparedGraphNode(){calls.push('select');}},
  'client/lib/node-wizard-open.mjs':{async openPreparedWizard(){calls.push('open');}},
  'client/lib/node-wizard-close.mjs':{async closePreparedWizard(){calls.push('cancel');return {verified:true,cleanup_complete:true,settings_applied:false,draft_discarded:true,node_context:{...node,verified:true},...closed};}}
 };
 return {calls,records,state,baseline,run:(g,e=expected())=>check(g,e,async name=>{assert.ok(modules[name]);return modules[name];},ref=>{assert.deepEqual(ref,node);return channel;},async value=>records.push(value),verifyN18JavascriptStep)};
}
const observed=()=>graph('imports.text','transform.calculator','transform.sorting','exports.text');
test('legacy exact JavaScript graph remains accepted without an alternative',async()=>{
 const f=fixture();await f.run(graph('imports.text','programming.javascript','exports.text'),expected(false));assert.deepEqual(f.calls,[]);
});
test('observed Calculator route still fails without approved opt-in',async()=>{
 await assert.rejects(fixture().run(observed(),expected(false)),/COLD_NODE_TYPE_MISSING:programming.javascript/);
});
test('n18 accepts the observed Calculator only after owned saved JavaScript read and Cancel',async()=>{
 const f=fixture();await f.run(observed());assert.deepEqual(f.calls,['graph','select','open','wizard','read','cancel']);
 assert.equal(f.records[0].phase,'n18_saved_javascript_step');assert.equal(f.records[0].syntax,'javascript');assert.equal(f.records[0].settings_applied,false);
 assert.deepEqual(f.state,f.baseline);
});
test('n18 advances an owned saved Calculator from input_mapping once without editing settings',async()=>{
 const f=fixture({stage:'input_mapping'});await f.run(observed());
 assert.deepEqual(f.calls,['graph','select','open','wizard','next','read','cancel']);
 assert.deepEqual(f.state,{...f.baseline,wizard:{...f.baseline.wizard,stage:'calculator'}});
 assert.equal(f.records[0].settings_applied,false);
});
test('input_mapping still requires independent JavaScript readback after Next',async()=>{
 const f=fixture({stage:'input_mapping',syntax:'expression'});
 await assert.rejects(f.run(observed()),/COLD_N18_CALCULATOR_JAVASCRIPT_REQUIRED/);
 assert.deepEqual(f.calls,['graph','select','open','wizard','next','read','cancel']);assert.deepEqual(f.records,[]);
});
test('input_mapping of a foreign node cannot authorize Next',async()=>{
 const f=fixture({stage:'input_mapping',change:s=>s.prepared_node_context.node_id='foreign'});
 await assert.rejects(f.run(observed()),/NOT_READY/);assert.ok(!f.calls.includes('next'));assert.equal(f.calls.at(-1),'cancel');
});
for(const [name,change] of [
 ['disabled',s=>s.ui.elements[0].enabled=false],
 ['unpermitted',s=>s.ui.elements[0].allowed_actions=[]],
 ['ambiguous',s=>s.ui.elements.push({...s.ui.elements[0]})]
])test('input_mapping refuses '+name+' Next and cancels',async()=>{
 const f=fixture({stage:'input_mapping',change});await assert.rejects(f.run(observed()),/COLD_N18_CALCULATOR_NEXT_UNCONFIRMED/);
 assert.ok(!f.calls.includes('next'));assert.equal(f.calls.at(-1),'cancel');assert.deepEqual(f.records,[]);
});
test('an unconfirmed Next such as a lost-links question is not retried or resolved by deletion',async()=>{
 const f=fixture({stage:'input_mapping',nextError:'lost-links question'});
 await assert.rejects(f.run(observed()),/lost-links question/);
 assert.deepEqual(f.calls,['graph','select','open','wizard','next','cancel']);assert.deepEqual(f.records,[]);
});
test('approved Calculator alternative refuses expression syntax and cancels',async()=>{
 const f=fixture({syntax:'expression'});await assert.rejects(f.run(observed()),/COLD_N18_CALCULATOR_JAVASCRIPT_REQUIRED/);
 assert.equal(f.calls.at(-1),'cancel');assert.deepEqual(f.records,[]);
});
for(const [name,change] of [
 ['foreign wizard owner',s=>s.prepared_node_context.node_id='foreign'],
 ['foreign native settings',s=>s.node_calculator.node_context.node_id='foreign'],
 ['unverified settings',s=>s.node_calculator.verified=false],
 ['partial settings',s=>s.node_calculator.inventory_complete=false],
 ['wrong wizard',s=>s.wizard.stage='sorting']
])test('Calculator alternative refuses '+name,async()=>{
 const f=fixture({change});await assert.rejects(f.run(observed()),/NOT_READY/);assert.equal(f.calls.at(-1),'cancel');
});
test('unconfirmed Cancel cannot produce a successful alternative proof',async()=>{
 const f=fixture({closed:{draft_discarded:false}});await assert.rejects(f.run(observed()),/COLD_N18_CALCULATOR_CANCEL_UNCONFIRMED/);assert.deepEqual(f.records,[]);
});
test('n18 alternative cannot be enabled for an unmarked fixture',async()=>{
 const e=expected();delete e.n18_javascript_step;
 await assert.rejects(fixture().run(observed(),e),/COLD_NODE_ALTERNATIVE_UNSUPPORTED/);
});
test('alternative preserves required import and export nodes',async()=>{
 await assert.rejects(fixture().run(graph('transform.calculator','exports.text')),/COLD_NODE_TYPE_MISSING:imports.text/);
 await assert.rejects(fixture().run(graph('imports.text','transform.calculator')),/COLD_NODE_TYPE_MISSING:exports.text/);
});
test('missing or ambiguous Calculator refuses before opening a wizard',async()=>{
 for(const g of [graph('imports.text','exports.text'),graph('imports.text','transform.calculator','transform.calculator','exports.text')]){
  const f=fixture();await assert.rejects(f.run(g),/COLD_N18_CALCULATOR_MISSING_OR_AMBIGUOUS/);assert.deepEqual(f.calls,[]);
 }
});
test('only the approved Calculator JavaScript declaration is supported',async()=>{
 for(const patch of [{alternative_types:[]},{alternative_types:['transform.filter_data']},{alternative_types:'transform.calculator'},{alternative_syntax:'expression'}]){
  const e=expected();Object.assign(e.nodes[1],patch);await assert.rejects(fixture().run(observed(),e),/COLD_NODE_REQUIREMENT_INVALID/);
 }
});
