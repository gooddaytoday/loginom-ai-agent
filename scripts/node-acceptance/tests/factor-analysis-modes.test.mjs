import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('factor-auto and factor-cap use the approved independent typed oracle unchanged',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util, json
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for name, kind in [('factor-auto','variance'),('factor-cap','cap')]:
 c=m.scenario(name);e=m.expected_for(c,'/own/pca.lgp')
 assert c['prompt'].name=='task-'+('auto' if kind=='variance' else 'cap')+'.md'
 assert c['input_files']==['matrix.csv'] and (c['data']/'matrix.csv').is_file()
 assert c['export_count']==2 and c['base'] is None and c['oracle'].is_file()
 original=json.loads((c['source']/'expected.json').read_text())['cases'][kind]
 assert e==dict(original,package_path='/own/pca.lgp')
 assert m.expected_for(c,'/own/pca.lgp',cold=True)==e
 assert len(e['outputs'])==2 and e['factor_signs']['ports']==[0,1]
 assert all(o['column_order']=='exact' and o['ordered'] for o in e['outputs'])
 assert [len(o['rows']) for o in e['outputs']]==[8,3]
 if kind=='cap':
  assert all('Factor2' not in [f['name'] for f in o['columns']] for o in e['outputs'])
 else:
  assert e['outputs'][0]['rows'][0]['Factor3'] is None
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('factor-apply uses the approved task, both original CSVs and saved-fit oracle for main and cold',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('factor-apply')
assert c['prompt'].name=='task-apply.md'
assert c['input_files']==['matrix.csv','update.csv'] and all((c['data']/f).is_file() for f in c['input_files'])
assert c['export_count']==2 and c['base'] is None and c['factor_mode']=='apply' and c['oracle'].is_file()
e=r.expected_for(c,'/own/apply.lgp')
assert e==dict(json.loads((c['source']/'expected.json').read_text())['cases']['apply'],package_path='/own/apply.lgp')
assert r.expected_for(c,'/own/apply.lgp',cold=True)==e
assert [len(o['rows']) for o in e['outputs']]==[8,3]
assert e['factor_signs']['ports']==[0,1]
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
