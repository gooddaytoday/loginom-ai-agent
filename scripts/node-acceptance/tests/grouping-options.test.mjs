import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {parseExpectedOutputs} from '../expected-outputs.mjs';

test('Grouping type expectations satisfy the stock cold-check contract',()=>{
 for(const kind of ['real','boolean']){
  const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/grouping/acceptance/types/expected-'+kind+'.json',import.meta.url)));
  expected.package_path='/own/types.lgp';
  assert.equal(parseExpectedOutputs(expected).outputs.length,1);
  assert.deepEqual(expected.nodes.map(n=>n.type),['imports.text','transform.group_data','exports.text']);
 }
});

test('Grouping Real and Boolean use unchanged proposal stages as separate stock expected',()=>{
 const result=spawnSync('python3',['-B','-c',`
import importlib.util,json,subprocess,sys
def load(name):
 s=importlib.util.spec_from_file_location(name,'scripts/node-acceptance/'+name+'.py')
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=load('run-check');checks=load('required-checks')
for kind in ['real','boolean']:
 c=r.scenario('group-'+kind);e=r.expected_for(c,'/own/types.lgp');cold=r.expected_for(c,'/own/types.lgp',cold=True)
 proposal=json.loads((c['source']/'expected.json').read_text())
 assert e['outputs']==cold['outputs']==proposal['cases'][kind]['stages']
 assert e['package_path']=='/own/types.lgp'
 assert c['input_files']==['types.csv'] and c['prompt'].name=='task-'+kind+'.md'
 assert c['prompt'].is_file() and (c['data']/'types.csv').is_file()
 assert 'group-'+kind in checks.select([checks.C+'grouping-parameters.mjs'])[1]
subprocess.run([sys.executable,str(c['source']/'oracle.py'),'--check'],check=True)
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('Grouping cache and result sort resolve approved oracle stages and required deltas',()=>{
 const result=spawnSync('python3',['-B','-c',`
import importlib.util,subprocess,sys
def load(name):
 s=importlib.util.spec_from_file_location(name,'scripts/node-acceptance/'+name+'.py')
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=load('run-check');checks=load('required-checks')
for name in ['grouping-cache','grouping-sort-result']:
 c=r.scenario(name);e=r.expected_for(c,'/own/test.lgp');cold=r.expected_for(c,'/own/test.lgp',cold=True)
 assert c['prompt'].is_file() and all((c['data']/f).is_file() for f in c['input_files'])
 assert len(e['outputs'])==len(cold['outputs'])==1
 assert e['outputs'][0]['ordered']==(name=='grouping-sort-result')
 assert any(row['Metric'] is None for row in e['outputs'][0]['rows'])
 assert name in checks.select([checks.C+'grouping-procedure.mjs'])[1]
 subprocess.run([sys.executable,str(c['source']/'oracle.py'),'--check'],check=True)
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
