import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('smoothing-hp resolves immutable task, both inputs and ordered numeric oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('smoothing-hp');e=r.expected_for(c,'/owned/smoothing.lgp')
assert c['prompt'].name=='task.md' and c['base'] is None
assert sorted(p.name for p in c['data'].iterdir())==['series.csv','update.csv']
assert 'oracle' not in c['prompt'].read_text()
o=e['outputs'][0]
assert o['output_node_type']=='preprocessing.smoothing' and o['output_port']==0
assert o['ordered'] is True and o['column_order']=='exact' and len(o['rows'])==8
assert [f['name'] for f in o['columns']]==['RowID','X','R','Tag','X_S','R_S']
assert all(f['tolerance']==dict(abs=1e-8,rel=1e-10) for f in o['columns'] if f['name'].endswith('_S'))
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('Haar scenarios expose only wavelet.csv and keep immutable expected depth tables',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name,task,expected in [('smoothing-haar','task-wavelet.md','expected.json'),('smoothing-haar-depth2','task-wavelet-depth2.md','expected-depth2.json')]:
 c=r.scenario(name);e=r.expected_for(c,'/owned/haar.lgp');o=e['outputs'][0]
 assert c['prompt'].name==task and c['input_files']==['wavelet.csv'] and c['export_count']==1
 assert c['expected_name']==expected and c['source'].name=='modes'
 assert [f['name'] for f in o['columns']]==['RowID','X','Tag','X_S'] and len(o['rows'])==8
 assert o['columns'][-1]['tolerance']==dict(abs=1e-8,rel=1e-10)
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('non-Haar wavelets resolve approved tasks and private oracle tables with one CSV',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name,variant in [('db2','db2-symmetric'),('db2-depth2','db2-depth2'),('coif1','coif1-symmetric'),('cdf97','cdf97-symmetric'),('db2-zero','db2-zero'),('cdf97-reflect','cdf97-reflect')]:
 c=r.scenario('smoothing-'+name);e=r.expected_for(c,'/owned/wavelet.lgp');o=e['outputs'][0]
 assert c['prompt'].name=='task-'+variant+'.md' and c['input_files']==['wavelet.csv'] and c['export_count']==1
 assert c['expected_name']=='expected-'+variant+'.json' and c['source'].name=='modes'
 assert [f['name'] for f in o['columns']]==['RowID','X','Tag','X_S'] and len(o['rows'])==8
 assert o['columns'][-1]['tolerance']==dict(abs=1e-8,rel=1e-10)
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
