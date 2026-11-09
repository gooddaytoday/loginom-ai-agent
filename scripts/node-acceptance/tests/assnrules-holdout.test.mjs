import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkAssnRulesHoldout} from '../assnrules-holdout.mjs';
const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-assnrules/acceptance/v040/expected-holdout.json',import.meta.url),'utf8'));
function receipt(mode,id){
 return {status:'SUCCEEDED',cleanup_complete:true,node:{document_id:'doc',workflow_id:'flow',node_id:'rules'},execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'assn_rules',mode,transaction_field:'Transaction',item_field:'Item',min_support_pct:50,min_confidence_pct:60,max_items:2,min_lift:0,consequence_limit:1,training:{status:mode==='apply'?'not_requested':'trained'}}},
  output:{ports:expected.outputs.map(o=>({port:o.output_port,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:id,
   schema:o.columns.map(({name,type})=>({name,type})),row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},
   sample:o.rows.map(row=>o.columns.map(f=>({type:f.type,is_null:false,value:f.type==='integer'?String(row[f.name]):row[f.name]})))}))}};
}
test('holdout requires the same trained node, unchanged settings and both complete typed ports',()=>{
 assert.equal(checkAssnRulesHoldout(expected,[receipt('fp_growth','train'),receipt('apply','apply')]).node.node_id,'rules');
 for(const mutate of [r=>r.shift(),r=>r.reverse(),r=>r[1].node.node_id='new',r=>r[1].configuration.readback.training.status='trained',r=>r[1].configuration.readback.min_lift=1,
  r=>r[1].output.ports[0].sample=[],r=>r[1].output.ports[1].sample=[],r=>r[1].output.ports[1].sample[0][0].value='T4',r=>r[1].output.ports[0].schema.reverse(),
  r=>r[1].output.ports[0].sample[0][1].is_null=true,r=>r[1].output.ports[1].sample[0][2].type='integer',r=>r[1].output.ports[1].fresh=false,r=>r.push(receipt('fp_growth','retrain'))]){
  const r=[receipt('fp_growth','train'),receipt('apply','apply')];mutate(r);assert.throws(()=>checkAssnRulesHoldout(expected,r),/ASSNRULES_HOLDOUT/);
 }
});
test('holdout catalog exposes only the approved task and CSVs and retains independent train rules',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('assnrules-holdout');e=m.expected_for(c,'/own/holdout.lgp')
assert c['data']==m.REPO/'docs/node-development/nodes/datamining-assnrules/fixtures/v040'
assert c['input_files']==['recommend-train.csv','recommend-holdout.csv'] and c['export_count']==2 and c['base'] is None
assert c['prompt'].name=='task-recommendations.md' and c['assnrules_holdout']
assert all((c['data']/name).is_file() for name in c['input_files'])
assert e==m.expected_for(c,'/own/holdout.lgp',cold=True)
assert [o['output_port'] for o in e['outputs']]==[1,2]
assert [len(o['rows']) for o in e['outputs']]==[2,1]
rule=e['outputs'][0]['rows'][0]
assert e['outputs'][1]['rows']==[dict(rule,Transaction='H1')]
for token in ['oracle','expected','H1','.75']: assert token not in c['prompt'].read_text()
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
