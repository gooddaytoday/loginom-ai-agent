import test from 'node:test';
import assert from 'node:assert/strict';
const {observeReplacementOutputPolicy,configureReplacementOutput}=await import(process.env.REPLACEMENT_OUTPUT_UNDER_TEST??'../lib/replacement-output.mjs');
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {nativePage} from './fixtures/navigation/native-page.mjs';

const forms=['DerivedDataSourceMappingEngineOutputPortWizard','DerivedDataSourceOutputSocketWizard'];
function fixture(form){
 const root='MF;TF-1;WizrdMCF',context={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'wizard',tid:root};
 const table={ref:'table',tid:root+';'+form+';rbTable;DisplayEl',allowed_actions:['click'],
  check_state:{kind:'radio',checked:true,indeterminate:false,source:'loginom_ext',owner_ref:'radio-owner'}};
 const view={wizard:{status:'observed',stage:'output_mapping',root_tid:root,root_ref:'wizard'},prepared_node_context:context,
  node_mapping:{verified:true,produce_mode:'supplement'},ui:{elements:[table],dialogs:[],masks:[]}};
 const fresh=structuredClone(view);fresh.node_mapping={...view.node_mapping,fresh:true};
 const calls=[];
 const channel={observe:async o=>{calls.push(['observe',o]);const s=calls.filter(c=>c[0]==='observe').length===1?view:fresh;assert.ok(o.ready(s));return s;},
  perform:async o=>{calls.push(['perform',o]);assert.strictEqual(o.initialObservation,view);assert.ok(o.ready(view));assert.strictEqual(o.identity(),context);assert.deepEqual(o.resolve(view),{verb:'click',ref:'table'});}};
 return {channel,view,fresh,table,calls};
}
for(const form of forms){
 test(form+': proven native checked skips perform but requires a fresh mapping read',async()=>{
  const f=fixture(form);assert.strictEqual(await observeReplacementOutputPolicy(f.channel),f.fresh);
  assert.deepEqual(f.calls.map(c=>c[0]),['observe','observe']);
  assert.equal(f.calls[1][1].readMappings,true);assert.equal(f.calls[1][1].condition,'replacement output policy');
  assert.equal(f.calls[1][1].ready({...f.fresh,node_mapping:{verified:false}}),false);
 });
 const untrusted={unchecked:f=>{f.table.check_state.checked=false;},missing:f=>{delete f.table.check_state;},
  indeterminate:f=>{f.table.check_state.indeterminate=true;},unknownIndeterminate:f=>{delete f.table.check_state.indeterminate;},
  stringChecked:f=>{f.table.check_state.checked='true';},checkbox:f=>{f.table.check_state.kind='checkbox';},
  aria:f=>{f.table.check_state.source='aria';},htmlInput:f=>{f.table.check_state.source='native';},
  noOwner:f=>{delete f.table.check_state.owner_ref;},blankOwner:f=>{f.table.check_state.owner_ref=' ';},
  unverifiedContext:f=>{f.view.prepared_node_context.verified=false;},graphContext:f=>{f.view.prepared_node_context.surface='graph';},
  foreignWizard:f=>{f.view.prepared_node_context.tid='foreign';}};
 for(const [name,change] of Object.entries(untrusted))test(form+': '+name+' retains guarded perform and mapping read',async()=>{
  const f=fixture(form);change(f);await observeReplacementOutputPolicy(f.channel);
  assert.deepEqual(f.calls.map(c=>c[0]),['observe','perform','observe']);assert.equal(f.calls.at(-1)[1].readMappings,true);
 });
 for(const name of ['duplicate','bothForms','foreignRoot'])test(form+': refuses '+name+' target without a gesture',async()=>{
  const f=fixture(form);
  if(name==='foreignRoot')f.table.tid='foreign;'+form+';rbTable;DisplayEl';
  else f.view.ui.elements.push({...f.table,ref:'other',tid:name==='bothForms'?f.table.tid.replace(form,forms.find(x=>x!==form)):f.table.tid});
  await assert.rejects(observeReplacementOutputPolicy(f.channel),/table view unavailable/);assert.deepEqual(f.calls.map(c=>c[0]),['observe']);
 });
 test(form+': post-gesture refusal is preserved and does not start mapping read',async()=>{
  const f=fixture(form);f.table.check_state.checked=false;const error=Error('AMBIGUOUS UI_SCAN_LIMIT');
  f.channel.perform=async()=>{throw error;};await assert.rejects(observeReplacementOutputPolicy(f.channel),e=>e===error);
  assert.equal(f.calls.length,1);
 });
}

for(const mode of ['readFailure','ownerChanged','mappingUnverified'])test('real channel '+mode+' prevents the next output mutation after skipped click',async()=>{
 const f=fixture(forms[1]),binding=nativePage().binding,records=[],failure=Error('native mapping read failed');let reads=0,mutations=0;
 const state={...f.view,origin:'https://loginom.test',loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,
  dom_epoch:{document:'doc',revision:1},scan:{complete:true},ui:{...f.view.ui,truncated:{elements:false,masks:false,dialogs:false}}};
 const channel=createNodeProcedure({preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,
  operation:{id:'policy',action:{action_key:'node.apply',revision:'1'},deadline:10000},now:()=>1,wait:async()=>{},
  record:async e=>{records.push(e);return e;},wrapMutation:()=>{mutations++;throw Error('unexpected mutation');},
  execute:async code=>{
   if(code.includes('async function readNodeMapping')){
    reads++;if(mode==='readFailure')throw failure;
    return {verified:mode!=='mappingUnverified',node_context:mode==='ownerChanged'?{...state.prepared_node_context,node_id:'foreign'}:state.prepared_node_context};
   }
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }});
 await assert.rejects(configureReplacementOutput(channel,{requested_output_mode:'replace'},{}),e=>
  mode==='readFailure'?e===failure:mode==='ownerChanged'?/context changed/.test(e.message):e.name==='NodeReadinessTimeout');
 assert.ok(reads>0);assert.equal(mutations,0);assert.equal(records.some(r=>r.phase==='node_step_prepared'),false);
 assert.equal(records.some(r=>r.phase==='node_observation_completed'&&r.readiness.condition==='replacement output policy'),false);
});
