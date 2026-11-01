import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('minute/second scenario attaches only input and independently checks boundaries, nulls and the retained second field',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('date-time-minsec'); e=r.expected_for(c,'/owned/minsec.lgp')
assert c['base'] is None and c['input_files']==['minsec.csv']
assert (c['data']/'minsec.csv').is_file() and 'minsec.csv' in c['prompt'].read_text()
assert e['package_path']=='/owned/minsec.lgp'
o=e['outputs'][0]
assert o['output_node_type']=='transform.date_time' and o['output_port']==0
assert o['column_order']=='exact' and len(o['rows'])==10
assert [f['name'] for f in o['columns']]==['RowID','DateA','DateB','A_Hour','A_Second','B_Hour','B_Minute','B_Second']
assert all(f['label_any'] is True for f in o['columns'])
assert [o['rows'][0][key] for key in ['A_Hour','A_Second','B_Hour','B_Minute','B_Second']]==[0,0,23,59,59]
assert [o['rows'][2][key] for key in ['A_Second','B_Minute','B_Second']]==[59,59,0]
assert all(o['rows'][i]['A_Second'] is None for i in [6,8])
assert all(o['rows'][i]['B_Minute'] is None and o['rows'][i]['B_Second'] is None for i in [7,9])
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
