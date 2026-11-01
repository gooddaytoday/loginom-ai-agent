import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('continuous real scenario binds its source and independent exact-equality oracle',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path)
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=module('runner','scripts/node-acceptance/run-check.py')
c=r.scenario('crosstable-real-keys');e=r.expected_for(c,'/owned/real.lgp')
o=module('oracle',c['source']/'oracle.py').expected()
assert json.loads((c['source']/'expected.json').read_text())==o
assert c['input_files']==['keys.csv'] and c['base'] is None
assert sorted(p.name for p in c['data'].iterdir())==['keys.csv']
assert e['package_path']=='/owned/real.lgp'
v=e['outputs'][0]
assert v['output_port']==0 and v['column_order']=='exact'
assert [x['type'] for x in v['columns']]==['real','string','real','integer','real','integer']
values=[[row[c['name']] for c in v['columns']] for row in v['rows']]
rows={(x[0],x[1]):x[2:] for x in values}
assert len(rows)==9
assert rows[(0.0,'A')]==[7.0,2,None,None]
assert rows[(1.25,'A')]==[3.0,1,13.0,1]
assert rows[(None,'A')]==[None,None,30.0,2]
assert rows[(0.1,'A')]==[29.0,1,31.0,1]
assert rows[(0.10000000000000002,'A')]==[37.0,1,None,None]
# A rounded/merged near-equal key must fail the runner's unchanged CSV check.
import tempfile,csv
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'result.csv'
 def write(rows):
  with p.open('w') as f:
   w=csv.writer(f);w.writerow([x['name'] for x in v['columns']])
   w.writerows([['?' if x is None else x for x in row] for row in rows])
 write(values);r.check_csv(p,v,null_marker='?')
 wrong=[list(row) for row in values]
 next(row for row in wrong if row[0]==0.10000000000000002)[0]=0.1
 write(wrong)
 try:r.check_csv(p,v,null_marker='?')
 except AssertionError:pass
 else:raise AssertionError('near-equal real keys were accepted')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
