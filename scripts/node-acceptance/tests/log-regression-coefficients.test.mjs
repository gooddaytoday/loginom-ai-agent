import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('logreg-coefficients uses the approved task and complete independent 2x10 oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('logreg-coefficients');e=m.expected_for(c,'/own/coefficients.lgp')
assert c['prompt'].name=='task-coefficients.md'
assert c['input_files']==['train.csv'] and (c['data']/'train.csv').is_file()
assert c['oracle'].is_file() and c['base'] is None
assert e['package_path']=='/own/coefficients.lgp'
o=e['outputs'][0]
assert o['output_node_type']=='datamining.log_regression' and o['output_port']==1
assert o['ordered'] and o['column_order']=='exact'
assert [f['name'] for f in o['columns']]==['Name','DisplayName','UniqueValues','Target_coefficients','Target_stdError','Target_wald','Target_waldPValue','Target_oddsRatio','Target_lowerBound','Target_upperBound']
assert [f['type'] for f in o['columns']]==['string']*3+['real']*7
assert len(o['rows'])==2 and all(len(r)==10 for r in o['rows'])
assert o['rows'][0]['Name']=='<Константа>' and o['rows'][1]['Name']=='X'
assert all(r['UniqueValues'] is None for r in o['rows'])
assert all(o['rows'][0][k] is None for k in ['DisplayName','Target_oddsRatio','Target_lowerBound','Target_upperBound'])
assert all(f['tolerance']=={'abs':1e-7,'rel':1e-8} for f in o['columns'][3:])
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
