import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('positional union catalog keeps the seven approved tasks and all 62 independent ordered outputs',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
count=0
for name in ['edit','repeat','matrix-regular','matrix-reverse','matrix-empty-main','matrix-empty-attached','matrix-both-empty']:
 c=r.scenario('colunion-'+name);e=r.expected_for(c,'/owned/test.lgp')
 assert c['prompt'].is_file() and c['base'] is None
 assert len(c['input_files'])==2 and all((c['data']/f).is_file() for f in c['input_files'])
 assert all(f.endswith('.csv') for f in c['input_files'])
 assert c['export_count']==len(e['outputs'])
 for o in e['outputs']:
  assert o['output_node_type']=='transform.col_union_data' and o['output_port']==0
  assert o['ordered'] is True and o['column_order']=='exact' and len(o['columns'])==8
  assert [f['name'] for f in o['columns']]==['RowID','Code','Amount','Flag','Day','BRowID','AttachedCode','Rate']
  assert all(f['tolerance']==dict(abs=0,rel=0) for f in o['columns'] if f['type']=='real')
 count+=len(e['outputs'])
assert count==62
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
