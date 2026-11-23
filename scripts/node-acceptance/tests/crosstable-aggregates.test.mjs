import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../../../',import.meta.url));
const run=code=>{
 const result=spawnSync('python3',['-B','-c',`import runpy,json,tempfile,csv
from pathlib import Path
r=runpy.run_path('scripts/node-acceptance/run-check.py')
${code}`],{cwd,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
};

test('CrossTable cycle A admits only its CSV and binds all four independent expectations',()=>run(`
root=Path('docs/node-development/nodes/transform-crosstable')
oracle=runpy.run_path(str(root/'acceptance/modes/oracle.py'))['proposals']()
for kind,count,task in [('numeric',4,'numeric-aggregates'),('scalar',2,'scalar-aggregates'),('datetime',2,'datetime-aggregates'),('null-cells',1,'null-cells')]:
 c=r['scenario']('crosstable-'+kind)
 assert c['input_files']==['aggregate-values.csv']
 assert c['data']==r['REPO']/root/'fixtures' and c['base'] is None
 assert c['prompt']==r['REPO']/root/'acceptance'/('task-'+task+'.md')
 assert c['export_count']==count
 assert (c['data']/c['input_files'][0]).is_file()
 expected=r['expected_for'](c,'/owned/check.lgp')
 assert expected==dict(oracle[kind],package_path='/owned/check.lgp')
 assert len(expected['outputs'])==count
 assert all(len(o['columns'])<=8 and len(o['rows'])==2 for o in expected['outputs'])
 assert all(c.get('label_any') for o in expected['outputs'] for c in o['columns'])
 if kind=='numeric': assert all(c['type']!='datetime' for o in expected['outputs'] for c in o['columns'])
`));

test('D76 CrossTable midnight counts are scenario scoped and never discard nonzero milliseconds',()=>run(`
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory)/'actual.csv'
 def check(target,value,scenario):
  p.write_text('When\\n'+value+'\\n')
  counts={}
  r['check_csv'](p,dict(columns=[dict(name='When',type='datetime')],rows=[dict(When=target)],column_order='exact'),scenario_name=scenario,d76=counts)
  return counts
 assert check('2026-01-01T00:00:00.000','2026-01-01','crosstable-datetime')==dict(negative_zero=0,midnight_date=1)
 assert check('2026-01-01T00:00:00.000','2026-01-01 00:00:00.000','crosstable-datetime')==dict(negative_zero=0,midnight_date=0)
 for scenario in ['crosstable-numeric','crosstable-scalar','crosstable-null-cells','crosstable-real-keys','unrelated']:
  assert check('2026-01-01T00:00:00.000','2026-01-01',scenario)=={}
 for target,value in [('2026-01-01T00:00:00.001','2026-01-01'),('2026-01-01T12:00:00.000','2026-01-01'),('2026-01-01T00:00:00.000','2026-01-02')]:
  try:check(target,value,'crosstable-datetime')
  except AssertionError:pass
  else:raise AssertionError('nonzero time or wrong date accepted')
 # Preserve the existing types300 allowance exactly; other scenarios get none.
 assert check('2026-01-01T00:00:00.001','2026-01-01','types300')==dict(negative_zero=0,midnight_date=1)
 p.write_text('Value\\n0\\n')
 counts={}
 r['check_csv'](p,dict(columns=[dict(name='Value',type='real')],rows=[dict(Value=-0.0)]),scenario_name='crosstable-datetime',d76=counts)
 assert counts==dict(negative_zero=0,midnight_date=0)
`));
