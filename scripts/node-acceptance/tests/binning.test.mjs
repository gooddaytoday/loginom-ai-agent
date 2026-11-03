import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('binning catalog selects only the task inputs and both strict independent ports',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for kind in ['count','width','real','integer','frequency','frequency-ties','apply','retrain','holdout']:
 c=r.scenario('binning-'+kind);e=r.expected_for(c,'/owned/binning.lgp')
 assert c['base'] is None and c['export_count']==2
 assert c['prompt'].name==('task.md' if kind=='count' else 'task-'+kind+'.md')
 assert c['input_files'] and all((c['data']/f).is_file() for f in c['input_files'])
 assert e['package_path']=='/owned/binning.lgp'
 assert [o['output_port'] for o in e['outputs']]==[0,1]
 assert all(o['ordered'] and o['column_order']=='exact' for o in e['outputs'])
 assert all(o['output_node_type']=='preprocessing.binning' for o in e['outputs'])
 assert all(f.get('tolerance')==dict(abs=1e-12,rel=1e-12) for o in e['outputs'] for f in o['columns'] if f['type']=='real')
 assert 'oracle' not in c['prompt'].read_text()
assert r.scenario('binning-count')['input_files']==['values.csv']
assert r.scenario('binning-apply')['input_files']==['frequency.csv','update.csv']
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
