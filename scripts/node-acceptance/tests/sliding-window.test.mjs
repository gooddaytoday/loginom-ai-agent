import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('n21 resolves immutable user task, sales input and strict cold oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('n21'); e=r.expected_for(c,'/owned/window.lgp')
assert c['prompt'].name=='task.md' and c['base'] is None
assert sorted(p.name for p in c['data'].iterdir())==['sales.csv']
assert 'oracle' not in c['prompt'].read_text()
o=e['outputs'][0]
assert o['output_node_type']=='transform.sliding_window' and o['output_port']==0
assert o['ordered'] is True and o['column_order']=='exact' and len(o['rows'])==10
assert [f['name'] for f in o['columns']]==['Month','Sales_H_3','Sales_H_2','Sales_H_1','Sales','Sales_F_1','Price_H_1','Price']
assert all(f['label_any'] is True for f in o['columns'])
assert all(f['tolerance']==dict(abs=0,rel=0) for f in o['columns'] if f['type']=='real')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
