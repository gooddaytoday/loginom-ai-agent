import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('ACF catalog resolves approved user tasks and independent ordered fixtures for 1/4/8 lags and update',()=>{
 const script=`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
for name,rows in [('acf-series',4),('acf-update',4),('acf-one',1),('acf-eight',8)]:
 c=m.scenario(name); e=m.expected_for(c,'/own/test.lgp')
 assert e['package_path']=='/own/test.lgp'
 o=e['outputs'][0]
 assert o['output_node_type']=='research.auto_correlation' and o['output_port']==0
 assert len(o['rows'])==rows and o['ordered'] is True and o['column_order']=='exact'
 assert [f['type'] for f in o['columns']]==['integer','real','real','boolean']
 assert all(f['label_any'] for f in o['columns'])
 assert all(('tolerance' in f)==(f['type']=='real') for f in o['columns'])
 assert all((c['data']/n).is_file() for n in c['input_files'])
 assert len(c['input_files'])==(2 if name=='acf-update' else 1)
 assert c['prompt'].is_file()
print('PASS')`;
 const result=spawnSync('python3',['-B','-c',script],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
