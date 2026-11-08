import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('string-format scenario attaches only the task and CSV and keeps the independent 10-column oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('date-time-formats'); e=r.expected_for(c,'/owned/formats.lgp')
assert (c['source']/'oracle.py').is_file()
assert c['base'] is None and c['input_files']==['formats.csv']
assert (c['data']/'formats.csv').is_file() and 'formats.csv' in c['prompt'].read_text()
o=e['outputs'][0]
assert e['package_path']=='/owned/formats.lgp'
assert o['output_node_type']=='transform.date_time' and o['output_node_label']=='Строковые представления' and o['output_port']==0
assert o['column_order']=='exact' and len(o['rows'])==4
assert [f['name'] for f in o['columns']]==['RowID','DateA','DateB','Raw','Keep','A_Year','A_Date','A_Time','A_Stamp','B_Markers']
assert all(f['label_any'] is True for f in o['columns'])
assert [f['type'] for f in o['columns']][5:]==['string']*5
r2=o['rows'][1]
assert r2['A_Stamp']=='2024-12-31 23:59:59.999' and r2['B_Markers']=='2025|1|01|01|00|00|00|001' and r2['Keep']==''
assert all(o['rows'][3][k] is None for k in ['A_Year','A_Date','A_Time','A_Stamp','B_Markers']) and o['rows'][3]['Raw']=='not-a-date'
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
