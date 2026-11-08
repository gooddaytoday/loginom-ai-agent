import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('logreg-apply uses the approved task, both inputs and the independent 3x8 typed oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('logreg-apply');e=m.expected_for(c,'/own/apply.lgp')
assert c['prompt'].name=='task-apply.md'
assert c['input_files']==['train.csv','holdout.csv']
assert all((c['data']/n).is_file() for n in c['input_files'])
assert c['oracle'].is_file() and c['base'] is None
assert e['package_path']=='/own/apply.lgp'
o=e['outputs'][0]
assert o['output_node_type']=='datamining.log_regression' and o['output_port']==0
assert o['ordered'] and o['column_order']=='exact'
assert [f['name'] for f in o['columns']]==['PredictionEvent','PredictionProbability','ActualEvent','Target_predicted','X','Target','RowID','Note']
assert [f['type'] for f in o['columns']]==['boolean','real','boolean','string','real','string','integer','string']
assert len(o['rows'])==3 and all(len(r)==8 for r in o['rows'])
assert all(r['Target'] is None and r['ActualEvent'] is None for r in o['rows'])
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
