import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('mask late delivery is isolated from exports and unchanged stage-0 expectations',()=>{
 const result=spawnSync('python3',['-B','-c',`
import importlib.util, tempfile, copy, runpy
from pathlib import Path
s=importlib.util.spec_from_file_location('runcheck','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('text-mask');e=r.expected_for(c,'/own/mask.lgp')
oracle=runpy.run_path(str(c['oracle']))['expected']
assert c['prompt'].name=='task-multi-file.md' and c['lgd_initial']=='expected-mask.json'
assert c['export_count']==2 and e==dict(oracle(True),package_path='/own/mask.lgp')
assert r.read(c['source']/c['lgd_initial'])==oracle(False)
assert len(oracle(False)['outputs'][0]['rows'])==5 and len(e['outputs'][0]['rows'])==6
assert r.expected_for(c,'/own/mask.lgp',cold=True)==e
with tempfile.TemporaryDirectory() as d:
 runner=r.Runner.__new__(r.Runner);runner.out=Path(d)/'mask-run'
 folder=Path(d);calls=[]
 def phase(name,command,where,timeout):
  config=r.read(command[-2]);calls.append((name,config))
  output=Path(command[-1]);output.mkdir()
  r.write(output/'result.json',dict(delivered=[dict(destination=b['destination']) for b in config['books']],
   cleanup=dict(package_closed=True,logged_out=True)))
 runner.phase=phase
 login=dict(package_directory='/own');build=Path('/build')
 initial=runner.text_mask_inputs(c,folder,login,build)
 late=runner.text_mask_inputs(c,folder,login,build,late=True)
 assert [Path(b['destination']).name for b in initial]==c['input_files']
 assert [Path(b['destination']).name for b in late]==['sales_2026-03.csv']
 assert Path(late[0]['fixture']).parent.name=='variants'
 assert {str(Path(b['destination']).parent) for b in initial+late}=={'/own/mask-run-mask'}
 assert calls[0][1]['text_mask_directory']==dict(name='mask-run-mask',create=True)
 assert calls[1][1]['text_mask_directory']==dict(name='mask-run-mask',create=False)
 assert all(x[1]['overwrite']=='reject' for x in calls)
 # A missing late-delivery receipt must refuse, never silently skip the month.
 def missing(name,command,where,timeout):r.write(Path(command[-1])/'result.json',dict(delivered=[],cleanup=dict(package_closed=True,logged_out=True)))
 runner.phase=missing
 try:runner.text_mask_inputs(c,folder,login,build,late=True)
 except AssertionError as error:assert str(error)=='TEXT_MASK_INPUT_DELIVERY_MISSING'
 else:raise AssertionError('missing delivery passed')
owner=dict(status='SUCCEEDED',node=dict(node_id='same',document_id='first'),configuration=dict(readback=dict(kind='text_import',
 source=dict(source_path='/own/mask-run-mask/sales_*.csv',file_info='Имя файла',parallel_processing=False),format={},columns=[],output_mapping={})),
 output=dict(ports=[dict(port=0,schema=[],sample=[])]))
second=copy.deepcopy(owner);second['node']['document_id']='reopened'
r.check_text_mask([(1,owner),(2,second)])
for key,value in [('node_id','other'),('source_path','/own/sales_2026-03.csv'),('parallel_processing',True)]:
 bad=copy.deepcopy(second)
 if key=='node_id':bad['node'][key]=value
 else:bad['configuration']['readback']['source'][key]=value
 try:r.check_text_mask([(1,owner),(2,bad)])
 except AssertionError:pass
 else:raise AssertionError(key)
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
