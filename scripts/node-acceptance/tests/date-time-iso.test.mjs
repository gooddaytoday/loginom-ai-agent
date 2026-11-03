import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('ISO scenarios attach only their approved input and retain the exact 12-column oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name,filename,count in [('date-time-iso','iso-weeks.csv',13),('date-time-iso-empty','iso-weeks-empty.csv',0)]:
 c=r.scenario(name); e=r.expected_for(c,'/owned/iso.lgp')
 assert (c['source']/'oracle.py').is_file()
 assert c['base'] is None and c['input_files']==[filename]
 assert (c['data']/filename).is_file() and filename in c['prompt'].read_text()
 o=e['outputs'][0]
 assert e['package_path']=='/owned/iso.lgp'
 assert o['output_node_type']=='transform.date_time' and o['output_port']==0
 assert o['column_order']=='exact' and len(o['rows'])==count
 assert [f['name'] for f in o['columns']]==['RowID','DateA','DateB','A_Year','A_ISOYear','A_ISOWeek','A_WeekStart','B_Year','B_ISOYear','B_ISOWeek','B_WeekStart','B_Weekday']
 assert all(f['label_any'] is True for f in o['columns'])
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
