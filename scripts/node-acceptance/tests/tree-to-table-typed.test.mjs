import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('tree-to-table typed scenario reuses the R4 source and binds its CSV to the independent projection',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,runpy
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('tree-to-table-typed');d=r.scenario('table-tree-dates-variant');e=r.expected_for(c,'/owned/tree.lgp')
assert c['external'] and c['base'] is None and not c.get('tree_only')
for k in ['data','input_files','seed_files','source_package','prepared_table_source']: assert c[k]==d[k],k
assert c['prompt'].name=='task-typed.md' and c['prompt'].parent==c['source']
assert e['package_path']=='/owned/tree.lgp' and r.expected_for(c,'/owned/tree.lgp',cold=True)==e
assert [n['type'] for n in e['nodes']]==['imports.text','transform.collapse_columns','trees.from_table','trees.to_table']
[o]=e['outputs'];assert o['output_node_type']=='trees.to_table' and o['output_port']==0 and o['ordered']
assert [(x['name'],x['type']) for x in o['columns']]==[('When','datetime'),('Value','variant')]
assert [(x['When'],x['Value']) for x in o['rows']]==[('2026-11-07T12:34:56.789',dict(cell_type='integer',value='9007199254740993')),
 ('2026-11-08T00:00:00.001',dict(cell_type='boolean',value=False)),('2026-11-07T12:34:56.789',dict(cell_type='string',value=''))]
oracle=runpy.run_path(str(Path('docs/node-development/nodes/trees-datatotree/acceptance/modes/oracle.py')))
assert e==dict(oracle['tree_to_table_typed_projection'](),package_path='/owned/tree.lgp')
assert 'oracle' not in c['prompt'].read_text() and 'expected' not in c['prompt'].read_text()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
