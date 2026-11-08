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
test('observed Loginom CSV passes date-time-formats only through the counted D76 midnight_date form',()=>{
 // LAB-1101 runs 2-4: the passthrough DateB 2025-01-01T00:00:00.001 is written as a date.
 const result=spawnSync('python3',['-B','-c',`import importlib.util,tempfile
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('date-time-formats'); e=r.expected_for(c,'/owned/formats.lgp'); o=e['outputs'][0]
text='''RowID;DateA;DateB;Raw;Keep;A_Year;A_Date;A_Time;A_Stamp;B_Markers
1;2024-02-29 13:14:15.125;2024-02-29;29.02.2024;NULL;2024;2024-02-29;13:14:15;2024-02-29 13:14:15.125;2024|1|02|29|00|00|00|000
2;2024-12-31 23:59:59.999;2025-01-01;31.12.2024;;2024;2024-12-31;23:59:59;2024-12-31 23:59:59.999;2025|1|01|01|00|00|00|001
3;2025-01-01;2023-03-01 12:01:02.003;01.01.2025;null;2025;2025-01-01;00:00:00;2025-01-01 00:00:00.000;2023|1|03|01|12|01|02|003
4;NULL;NULL;not-a-date;0;NULL;NULL;NULL;NULL;NULL
'''
with tempfile.TemporaryDirectory() as d:
    p=Path(d)/'out.csv'; p.write_text(text,encoding='utf-8')
    counts=dict(negative_zero=0,midnight_date=0)
    assert r.check_csv(p,o,null_marker='NULL',scenario_name='date-time-formats',d76=counts)==';'
    assert counts==dict(negative_zero=0,midnight_date=1),counts
    for other in ['date-time-iso',None]:
        try: r.check_csv(p,o,null_marker='NULL',scenario_name=other); raise SystemExit('accepted for '+str(other))
        except AssertionError as error: assert str(error)=='CSV_VALUES_OR_ORDER'
    p.write_text(text.replace('2;2024-12-31 23:59:59.999;2025-01-01;','2;2024-12-31 23:59:59.999;2025-01-02;'),encoding='utf-8')
    try: r.check_csv(p,o,null_marker='NULL',scenario_name='date-time-formats'); raise SystemExit('wrong date accepted')
    except AssertionError as error: assert str(error)=='CSV_VALUES_OR_ORDER'
    p.write_text(text.replace('2024|1|01|01|00|00|00|001'.replace('2024','2025'),'2025|1|1|1|0|0|0|1'),encoding='utf-8')
    try: r.check_csv(p,o,null_marker='NULL',scenario_name='date-time-formats'); raise SystemExit('unpadded markers accepted')
    except AssertionError as error: assert str(error)=='CSV_VALUES_OR_ORDER'
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
