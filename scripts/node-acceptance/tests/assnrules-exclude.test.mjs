import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('maximum support exclusion uses one CSV, independently generated tables and final cold tables',()=>{
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
assert json.loads((c['source']/c['cold_expected_name']).read_text())['outputs']==e['outputs']

`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
