import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('logreg-ridge uses the approved task and complete independent 32x8 penalized oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('logreg-ridge');e=m.expected_for(c,'/own/coefficients.lgp')
assert c['prompt'].name=='task-ridge.md'
assert c['input_files']==['train.csv'] and (c['data']/'train.csv').is_file()
assert c['oracle'].is_file() and c['base'] is None
assert e['package_path']=='/own/coefficients.lgp'
o=e['outputs'][0]
assert o['output_node_type']=='datamining.log_regression' and o['output_port']==0
assert o['ordered'] and o['column_order']=='exact'
assert len(o['rows'])==32 and all(len(r)==8 for r in o['rows'])
assert [f['name'] for f in o['columns']]==['PredictionEvent','PredictionProbability','ActualEvent','Target_predicted','X','Target','RowID','Note']
assert [f['type'] for f in o['columns']]==['boolean','real','boolean','string','real','string','integer','string']
assert o['columns'][1]['tolerance']=={'abs':1e-8,'rel':1e-10}
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
