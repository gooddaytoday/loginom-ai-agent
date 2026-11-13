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
`],{cwd:new URL('../../..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
