import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkLogregNormalization} from '../logreg-normalization.mjs';
import {matchesExpectedOutput} from '../expected-outputs.mjs';
const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-logregression/acceptance/modes/normalization/expected.json',import.meta.url)));
const receipt=(normalization,id)=>({status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'one'},execution:{status:'completed',execution_id:id},
 configuration:{readback:{kind:'log_regression',mode:'enter',normalization,input_fields:['X'],target_field:'Target',event:'yes',threshold:0.8,training:{status:'trained',execution_id:id+'-teach'}}},
 output:{ports:expected.outputs.map(o=>({port:o.output_port,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:id,sample_complete:true,precision:{numbers_verified:true},
  row_count:o.rows.length,schema:o.columns.map(({name,type})=>({name,type})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:c.type==='integer'?String(r[c.name]):r[c.name]})))}))}});
test('normalization requires both full predictions on the same node in order',()=>{
 const replies=[receipt('none','raw'),receipt('standardize','std')];
 assert.equal(checkLogregNormalization(expected,replies).normalization,'standardize');
 for(const mutate of [r=>r.shift(),r=>r.pop(),r=>r.reverse(),r=>r[1].node.node_id='other',r=>r[0].output.ports[0].sample[0][1].value=0.5,
  r=>r[1].output.ports[0].sample.pop(),r=>r[1].output.ports[0].fresh=false,r=>r[1].configuration.readback.training.status='not_requested']){
  const candidate=structuredClone(replies);mutate(candidate);assert.throws(()=>checkLogregNormalization(expected,candidate));
 }
});
test('standardize requires independently expected full fresh typed coefficients',()=>{
 assert.equal(expected.outputs.length,2);
 const replies=[receipt('none','raw'),receipt('standardize','std')];
 for(const mutate of [r=>r[1].output.ports.pop(),r=>r[1].output.ports[1].fresh=false,
  r=>r[1].output.ports[1].sample[1][3].value=Math.log(3)/2,
  r=>r[1].output.ports[1].sample[1][3].type='string']){
  const candidate=structuredClone(replies);mutate(candidate);assert.throws(()=>checkLogregNormalization(expected,candidate));
 }
});
test('main and cold orders are exact and cannot substitute for each other',()=>{
 const cold=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-logregression/acceptance/modes/normalization/cold/expected.json',import.meta.url)));
 const port=receipt('standardize','std').output.ports[0];
 assert.equal(matchesExpectedOutput(port,expected.outputs[0]),true);
 assert.equal(matchesExpectedOutput(port,cold.outputs[0]),false);
 const order=cold.outputs[0].columns.map(c=>port.schema.findIndex(s=>s.name===c.name));
 const reopened={...port,schema:order.map(i=>port.schema[i]),sample:port.sample.map(row=>order.map(i=>row[i]))};
 assert.equal(matchesExpectedOutput(reopened,cold.outputs[0]),true);
 assert.equal(matchesExpectedOutput(reopened,expected.outputs[0]),false);
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
assert c['export_count']==2
cold=r.expected_for(c,'/own/normalization.lgp',cold=True)
assert [x['name'] for x in e['outputs'][0]['columns']][-4:]==['RowID','X','Target','Note']
assert [x['name'] for x in cold['outputs'][0]['columns']][-4:]==['X','Target','RowID','Note']
assert e['outputs'][0]['rows']==cold['outputs'][0]['rows']
assert sorted(e['outputs'][0]['columns'],key=lambda x:x['name'])==sorted(cold['outputs'][0]['columns'],key=lambda x:x['name'])
assert e['outputs'][1]==cold['outputs'][1]
import math, statistics
o=importlib.util.spec_from_file_location('oracle',c['oracle']);oracle=importlib.util.module_from_spec(o);o.loader.exec_module(oracle)
rows=oracle.source('modes/normalization.csv');sd=statistics.stdev(row['X'] for row in rows)
coeff=e['outputs'][1]['rows']
assert abs(coeff[0]['Target_coefficients'])<1e-12
assert abs(coeff[1]['Target_coefficients']-math.log(3)*sd/2)<1e-12
assert abs(coeff[1]['Target_oddsRatio']-math.exp(math.log(3)*sd/2))<1e-12
assert e['outputs'][0]['rows']==oracle.output(rows,oracle.fit(rows))['rows']
save={'status':'SUCCEEDED','action_key':'package.save_as','action_revision':'2','phase':'verified','cleanup_complete':True,
 'output':{'package_ref':{'kind':'package','path':'/own/normalization.lgp','active_identity':'/own/normalization.lgp'},'reopened':True}}
assert r.save_confirmed(c,save,'/own/normalization.lgp')
assert not r.save_confirmed({},save,'/own/normalization.lgp')
assert not r.save_confirmed(c,save,'/other.lgp')
save['output']['reopened']=False
assert not r.save_confirmed(c,save,'/own/normalization.lgp')
save['output']['save_completed']=True
assert r.save_confirmed({},save,'/own/normalization.lgp')
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
