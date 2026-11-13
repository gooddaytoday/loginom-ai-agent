import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('FS oracle rejects repeated effects, corrupt bytes, missing/extra files and duplicate ZIP entries',()=>{
 const result=spawnSync('python3',['-B','-c',String.raw`
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import json, runpy, warnings
root=Path('docs/node-development/nodes/programming-javascript/acceptance/fs')
oracle=runpy.run_path(str(root/'oracle.py'))
runner=runpy.run_path('scripts/node-acceptance/run-check.py')
warnings.simplefilter('ignore', UserWarning)
with TemporaryDirectory() as temp:
 archive=Path(temp)/'files.zip'
 def check(case, entries, execution=1, valid=False):
  with ZipFile(archive,'w') as z:
   z.writestr('output/',b'')
   if case=='operations': z.writestr('output/archive/',b'')
   for name,data in entries: z.writestr('output/'+name,data)
  try: oracle['verify_archive'](case,archive,'output',execution)
  except AssertionError:
   assert not valid
  else: assert valid
 for case in ['read','write','operations','effects']:
  spec=runner['scenario']('js-fs-'+case)
  assert spec['oracle'].is_file() and spec['oracle'].resolve()==(root/'oracle.py').resolve()
  assert json.loads((root/('js-fs-'+case)/'expected.json').read_text())==oracle['expected'](case)
  entries=list(oracle['files'](case).items())
  check(case,entries,valid=True)
  check(case,entries[:-1])
  check(case,entries+[('extra.txt',b'x')])
  check(case,entries+[entries[0]])
  check(case,[(name,b'corrupt' if i==0 else data) for i,(name,data) in enumerate(entries)])
 check('effects',list(oracle['files']('effects',2).items()))
 check('effects',list(oracle['files']('effects',2).items()),2,valid=True)
 check('effects',list(oracle['files']('effects').items()),2)
 spec=runner['scenario']('js-fs-paths')
 assert spec['oracle'].is_file()
 paths=oracle['expected']('paths')
 assert json.loads((root/'js-fs-paths/expected.json').read_text())==paths
 def paths_archive(phase, extra=()):
  with ZipFile(archive,'w') as z:
   for name in ['root/','root/original/','root/moved/']: z.writestr(name,b'')
   z.writestr('root/original/run-sidecar.txt',b'LAB1549_SIDE')
   if phase!='fixtures': z.writestr('root/'+('original' if phase=='saved' else 'moved')+'/paths.lgp',b'unchanged package')
   if phase in ['sidecar','warm','cold']: z.writestr('root/moved/run-sidecar.txt',b'LAB1549_SIDE')
   for name,data in extra: z.writestr(name,data)
 for phase in ['fixtures','saved','moved','sidecar','warm','cold']:
  paths_archive(phase)
  oracle['verify_paths_archive'](archive,'root',phase,'run-sidecar.txt')
 for extra in [[('root/extra.txt',b'x')],[('root/original/paths.lgp',b'copy')],
               [('root/moved/run-sidecar.txt',b'wrong')],[('other/paths.~lgp',b'foreign')]]:
  paths_archive('moved',extra)
  try: oracle['verify_paths_archive'](archive,'root','moved','run-sidecar.txt')
  except AssertionError: pass
  else: raise AssertionError('paths oracle accepted extra/copy/wrong/foreign artifact')
 replies=[]
 for i,out in enumerate(paths['outputs'][:2]):
  row=out['rows'][0]
  port={'port':0,'sample_complete':True,'row_count':1,'freshness_basis':'completed_execution_port_source',
        'schema':[{'name':c['name'],'label':c['name'],'type':c['type'],'index':n} for n,c in enumerate(out['columns'])],
        'precision':{'numbers_verified':True},'sample':[[{'type':c['type'],'is_null':row[c['name']] is None,'value':row[c['name']]} for c in out['columns']]]}
  replies.append((i*2,{'status':'SUCCEEDED','cleanup_complete':True,'node':{'node_id':'js'},
    'configuration':{'readback':{'kind':'javascript'}},'output':{'ports':[port]}}))
  replies.append((i*2+1,{'status':'SUCCEEDED','configuration':{'readback':{'kind':'text_export','destination':str(i)}}}))
 stages=[{**out,'output_node_type':'programming.javascript'} for out in paths['outputs'][:2]]
 for stage in stages: stage.pop('export_destination')
 runner['check_text_update_ports'](replies,['0','1'],stages,same_node_id=True,kind='javascript')
 errors=runner['scenario']('js-fs-errors')
 assert errors['oracle'].is_file()
 assert json.loads((root/'js-fs-errors/expected.json').read_text())==oracle['expected']('errors')
 keep=Path(temp)/'keep.txt';inventory=Path(temp)/'inventory.json'
 good=[{'name':'keep.txt','kind':'file','bytes':4},{'name':'denied.txt','kind':'file','bytes':6}]
 keep.write_bytes(b'KEEP');inventory.write_text(json.dumps(good))
 oracle['verify_error_files'](keep,inventory)
 for bad in [good[:1],good+[good[0]],[good[0],{**good[1],'bytes':0}]]:
  inventory.write_text(json.dumps(bad))
  try: oracle['verify_error_files'](keep,inventory)
  except AssertionError: pass
  else: raise AssertionError('error oracle accepted damaged native inventory')
 inventory.write_text(json.dumps(good));keep.write_bytes(b'REPLACE')
 try: oracle['verify_error_files'](keep,inventory)
 except AssertionError: pass
 else: raise AssertionError('error oracle accepted overwritten keep.txt')
`],{cwd:new URL('../../..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
