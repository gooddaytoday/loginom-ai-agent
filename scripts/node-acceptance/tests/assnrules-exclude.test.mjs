import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {checkAssnRulesExclusionSaved,observeAssnRulesExclusionSaved} from '../assnrules-exclude.mjs';
import {matchesExpectedOutput} from '../expected-outputs.mjs';

const cold=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-assnrules/acceptance/v040/expected-exclude-cold.json',import.meta.url)));
const node={document_id:'package',workflow_id:'workflow',node_id:'rules'};
const snapshot=()=>({verified:true,kind:'parameters',node_context:{...node,verified:true},
 values:{pedExcludeLargeSupportItems:true,pedMaxSupport:90},
 switches:{pedExcludeLargeSupportItems:false,pedMaxSupport:false}});

test('exclude cold requires observed saved flag, exact threshold and same node',()=>{
 assert.deepEqual(checkAssnRulesExclusionSaved(snapshot(),cold,node),
  {exclude_support_above_pct:90,exclusion_enabled:true,settings_applied:false});
 for(const change of [s=>s.verified=false,s=>s.kind='auxiliary',s=>s.node_context.node_id='other',
  s=>s.node_context.verified=false,s=>s.values.pedExcludeLargeSupportItems=false,
  s=>s.values.pedMaxSupport=100,s=>s.values.pedMaxSupport='90',
  s=>s.switches.pedMaxSupport=true,s=>delete s.switches]){
  const s=snapshot();change(s);assert.throws(()=>checkAssnRulesExclusionSaved(s,cold,node));
 }
 for(const change of [e=>delete e.assnrules_exclusion,e=>e.assnrules_exclusion.exclude_support_above_pct=100,
  e=>e.outputs[0].output_port=0,e=>e.outputs[0].output_node_type='other',e=>e.outputs.push(e.outputs[0])]){
  const e=structuredClone(cold);change(e);assert.throws(()=>checkAssnRulesExclusionSaved(snapshot(),e,node));
 }
});

test('exclude cold keeps complete typed rule matching strict',()=>{
 const want=cold.outputs[0];
 const table={row_count:want.rows.length,schema:want.columns,sample_complete:true,precision:{numbers_verified:true},
  sample:want.rows.map(r=>want.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:c.type==='integer'?String(r[c.name]):r[c.name]})))};
 assert.equal(matchesExpectedOutput(table,want),true);
 for(const change of [p=>p.sample.pop(),p=>p.sample[0][4].value='A',p=>p.sample[0][3].value=1,
  p=>p.schema=p.schema.slice().reverse(),p=>p.sample[0][5].is_null=false]){
  const t=structuredClone(table);change(t);assert.equal(matchesExpectedOutput(t,want),false);
 }
});

test('saved exclusion inspection uses Next and Cancel only, including mismatches',async()=>{
 for(const mismatch of [false,true]){
  let stage='input_mapping',closed=0,opened=0;const gestures=[];
  const current=()=>({prepared_node_context:{...node,verified:true,surface:opened?'wizard':'graph'},
   wizard:opened?{stage,root_tid:'wizard'}:{status:'absent'},
   ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']}]},
   node_assn_rules:{...snapshot(),values:{pedExcludeLargeSupportItems:true,pedMaxSupport:mismatch?100:90}}});
  const channel={observe:async options=>{const s=current();assert.equal(options.ready(s),true);return s;},
   perform:async options=>{const s=current();assert.equal(options.ready(s),true);const action=options.resolve(s);
    assert.equal(action.verb,'wizard_step');gestures.push(action);stage=action.expected_stage;}};
  const load=async name=>name.endsWith('node-wizard-open.mjs')?{openPreparedWizard:async()=>{opened++;}}
   :name.endsWith('node-wizard-close.mjs')?{closePreparedWizard:async()=>{closed++;return {verified:true,cleanup_complete:true,settings_applied:false};}}
   :{selectPreparedGraphNode:async()=>{}};
  const inspect=observeAssnRulesExclusionSaved({load,channel,expected:cold});
  if(mismatch)await assert.rejects(inspect,/SAVED_SETTINGS/);else assert.equal((await inspect).exclusion_enabled,true);
  assert.equal(opened,1);assert.equal(closed,1);assert.equal(gestures.length,2);
 }
});

test('maximum support exclusion uses one input CSV, independently generated tables and scoped cold rules/settings',()=>{
 const result=spawnSync('python3',['-B','-c',`
import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('run_check','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('assnrules-exclude');e=r.expected_for(c,'/own/filters.lgp')
assert c['input_files']==['train.csv'] and c['export_count']==2
assert c['prompt'].name=='task-exclude.md' and c['base'] is None
s=importlib.util.spec_from_file_location('checks','scripts/node-acceptance/required-checks.py')
checks=importlib.util.module_from_spec(s);s.loader.exec_module(checks)
assert 'assnrules-exclude' in checks.select([checks.C+'assn-rules-procedure.mjs'])[1]
assert all((c['data']/name).is_file() for name in c['input_files'])
s=importlib.util.spec_from_file_location('oracle',c['source']/'oracle.py')
o=importlib.util.module_from_spec(s);s.loader.exec_module(o)
for name,value in o.exclude_artifacts().items():
 assert json.loads((c['source']/name).read_text())==value
assert [len(t['rows']) for t in e['outputs']]==[3,2]
assert [r['Item_0'] for r in e['outputs'][0]['rows']]==['B','C','B']
assert e['outputs'][1]['rows'][0]['Item_0_A']=='B'
assert e['outputs'][1]['rows'][0]['Item_0_C']=='C'
assert e['outputs'][1]['rows'][1]['Item_0_A']=='C'
assert e['outputs'][1]['rows'][1]['Item_0_C']=='B'
cold=json.loads((c['source']/c['cold_expected_name']).read_text())
assert cold['outputs']==[e['outputs'][1]]
assert cold['assnrules_exclusion']==dict(exclude_support_above_pct=90)
for name in ['assnrules-consequents','assnrules-basic','assnrules-retrain','assnrules-recommend']:
 other=r.expected_for(r.scenario(name),'/own/strict.lgp',cold=True)
 assert 'assnrules_exclusion' not in other
 assert len(other['outputs'])>=2

`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
