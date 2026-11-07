import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkLogregNormalization} from '../logreg-normalization.mjs';
const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-logregression/acceptance/modes/normalization/expected.json',import.meta.url)));
const receipt=(normalization,id)=>({status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'one'},execution:{status:'completed',execution_id:id},
 configuration:{readback:{kind:'log_regression',mode:'enter',normalization,input_fields:['X'],target_field:'Target',event:'yes',threshold:0.8,training:{status:'trained',execution_id:id+'-teach'}}},
 output:{ports:expected.outputs.map(o=>({port:0,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:id,sample_complete:true,precision:{numbers_verified:true},
  row_count:o.rows.length,schema:o.columns.map(({name,type})=>({name,type})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:c.type==='integer'?String(r[c.name]):r[c.name]})))}))}});
test('normalization requires both full predictions on the same node in order',()=>{
 const replies=[receipt('none','raw'),receipt('standardize','std')];
 assert.equal(checkLogregNormalization(expected,replies).normalization,'standardize');
 for(const mutate of [r=>r.shift(),r=>r.pop(),r=>r.reverse(),r=>r[1].node.node_id='other',r=>r[0].output.ports[0].sample[0][1].value=0.5,
  r=>r[1].output.ports[0].sample.pop(),r=>r[1].output.ports[0].fresh=false,r=>r[1].configuration.readback.training.status='not_requested']){
  const candidate=structuredClone(replies);mutate(candidate);assert.throws(()=>checkLogregNormalization(expected,candidate));
 }
});
test('catalog uses the approved unchanged task/data and independent expected, with cold settings audit',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('logreg-normalization');e=r.expected_for(c,'/own/normalization.lgp')
assert c['prompt'].name=='task-normalization.md' and c['input_files']==['normalization.csv']
assert c['base'] is None and c['oracle'].is_file() and (c['data']/'normalization.csv').is_file()
assert e['logreg_normalization'] is True and len(e['outputs'][0]['rows'])==32
assert e['outputs'][0]['column_order']=='exact' and e['package_path']=='/own/normalization.lgp'
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
