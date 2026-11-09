import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('factor-rotation uses the approved Real fixture and untouched Quartimax oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('run_check','scripts/node-acceptance/run-check.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('factor-rotation');e=m.expected_for(c,'/own/rotation.lgp')
assert c['prompt'].name=='task-rotation.md'
assert c['input_files']==['rotation.csv'] and (c['data']/'rotation.csv').is_file()
assert c['export_count']==2 and c['base'] is None and c['oracle'].is_file()
assert c['factor_mode']=='quartimax'
original=json.loads((c['source']/'expected.json').read_text())['cases']['quartimax']
assert e==dict(original,package_path='/own/rotation.lgp')
assert m.expected_for(c,'/own/rotation.lgp',cold=True)==e
assert all(o['column_order']=='exact' and o['ordered'] for o in e['outputs'])
assert e['factor_signs']['columns']==['Factor1','Factor2']
assert all(row['Factor3'] is None for row in e['outputs'][0]['rows'])
assert all(row['Factor3']==0 for row in e['outputs'][1]['rows'])
s=importlib.util.spec_from_file_location('checks','scripts/node-acceptance/required-checks.py')
checks=importlib.util.module_from_spec(s);s.loader.exec_module(checks)
assert 'factor-rotation' in checks.select({'packages/loginom-runtime/client/lib/factor-analysis-procedure.mjs'})[1]
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
