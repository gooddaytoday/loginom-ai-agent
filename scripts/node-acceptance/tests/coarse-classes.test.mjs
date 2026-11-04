import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('coarse classes catalog keeps independent train/apply expectations outside model inputs',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name,rows in [('coarse-classes-train',20),('coarse-classes-apply',3)]:
 c=r.scenario(name);e=r.expected_for(c,'/owned/coarse.lgp')
 assert c['base'] is None and c['export_count']==3
 assert c['input_files']==(['train.csv'] if rows==20 else ['train.csv','holdout.csv'])
 assert all((c['data']/f).is_file() for f in c['input_files'])
 assert [o['output_port'] for o in e['outputs']]==[0,1,2]
 assert [len(o['rows']) for o in e['outputs']]==[rows,2,1]
 assert [len(o['columns']) for o in e['outputs']]==[7,17,9]
 assert all(o['ordered'] and o['column_order']=='exact' for o in e['outputs'])
 assert all(o['output_node_type']=='preprocessing.coarse_classes' for o in e['outputs'])
 assert 'oracle' not in c['prompt'].read_text()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
