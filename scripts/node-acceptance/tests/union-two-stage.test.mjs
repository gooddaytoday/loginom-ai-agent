import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('two-stage Union catalog uses approved tasks, CSV inputs and independent typed expectations',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
oracle_spec=importlib.util.spec_from_file_location('oracle',Path('docs/node-development/nodes/union/acceptance/oracle-v040.py'))
oracle=importlib.util.module_from_spec(oracle_spec);oracle_spec.loader.exec_module(oracle)
for variant in ['two-stage','auto-label']:
 case=runner.scenario('union-'+variant)
 assert case['prompt'].name=='task-'+variant+'.md' and case['prompt'].is_file()
 assert case['input_files']==['main.csv','second.csv'] and case['base'] is None
 assert all((case['data']/name).is_file() for name in case['input_files'])
 expected=runner.expected_for(case,'/owned/union.lgp')
 independent=oracle.expected(variant);independent['package_path']='/owned/union.lgp'
 assert expected==independent
 output=expected['outputs'][0]
 assert len(output['rows'])==8 and output['column_order']=='exact'
 assert [c['name'] for c in output['columns']]==['Code','Backup','Amount']
 assert [c['type'] for c in output['columns']]==['string','string','integer']
 assert expected['nodes']==[{'type':'transform.union_data'}]
 assert 'output_node_label' not in output
 if variant=='auto-label':
  assert 'автоматическую метку' in case['prompt'].read_text()
  assert 'Повторно открой' in case['prompt'].read_text()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
