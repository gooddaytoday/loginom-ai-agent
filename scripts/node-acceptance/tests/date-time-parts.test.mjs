import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('owner-approved date parts CSV omission uses counted D76 and rejects other value loss',()=>{
 const result=spawnSync('python3',['-B','-c',`import csv,importlib.util,tempfile
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
with tempfile.TemporaryDirectory() as d:
    p=Path(d)/'out.csv'
    for name in ['date-time-parts','date-time-parts-week']:
        o=r.expected_for(r.scenario(name),'/owned/parts.lgp')['outputs'][0]
        names=[c['name'] for c in o['columns']]
        rows=[[row[n] if row[n] is not None else 'NULL' for n in names] for row in o['rows']]
        rows[6][names.index('DateA')]='2026-07-01'
        def check(values,scenario=name):
            with p.open('w',newline='',encoding='utf-8') as stream:
                writer=csv.writer(stream,delimiter=';');writer.writerow(names);writer.writerows(values)
            counts=dict(negative_zero=0,midnight_date=0)
            r.check_csv(p,o,null_marker='NULL',scenario_name=scenario,d76=counts)
            return counts
        assert check(rows)==dict(negative_zero=0,midnight_date=1)
        for scenario,index,column,value in [
            ('date-time-iso',6,'DateA','2026-07-01'),
            (name,6,'DateA','2026-07-02'),
            (name,1,'DateA','2024-02-29'),
            (name,6,'DateA','2026-07-01T00:00:00.000'),
            *([(name,6,'A_Ms',0)] if 'A_Ms' in names else []),
        ]:
            changed=[row[:] for row in rows];changed[index][names.index(column)]=value
            try: check(changed,scenario);raise SystemExit('unexpected acceptance: '+str((scenario,column,value)))
            except AssertionError as error: assert str(error)=='CSV_VALUES_OR_ORDER',str(error)
        assert o['rows'][6]['DateA']=='2026-07-01T00:00:00.010'
        if 'A_Ms' in names: assert o['rows'][6]['A_Ms']==10
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
