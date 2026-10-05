"""Exercise the real wrapper after a child saved a source but emitted bad permissions."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]
HELPER=ROOT/'scripts/node-acceptance/prepare-variant-source.py'

class SourcePreparationFailures(unittest.TestCase):
    def test_rejected_private_child_files_leave_negative_receipt_and_no_actor_export(self):
        for rejected in ('result.json','source-manifest.json'):
            with self.subTest(rejected=rejected), tempfile.TemporaryDirectory() as directory:
                work=Path(directory);ops=work/'operators';ops.mkdir()
                root=work/'.multica-node';payload=root/'current';payload.mkdir(parents=True)
                (payload/'cli-manifest.json').write_text(json.dumps({'metadata':{'sourceDirty':False,'sourceCommit':'1'*40,'channel':'test'}}))
                source=work/'docs/node-development/nodes/transform-crosstable/acceptance/data';source.mkdir(parents=True)
                (source/'variant-source.csv').write_bytes((ROOT/'docs/node-development/nodes/transform-crosstable/acceptance/data/variant-source.csv').read_bytes())
                (source.parent/'source-manifest.json').write_bytes((ROOT/'docs/node-development/nodes/transform-crosstable/acceptance/source-manifest.json').read_bytes())
                config=work/'config.json';config.write_text(json.dumps({'role':'worker','loginom':{'url':'http://test.invalid','username':'worker','password':'test','api_key':'test'},'provider_auth_file':str(work/'auth')}));config.chmod(0o600)
                (ops/'common.py').write_text('''import json,os
from pathlib import Path
def read_private(p):
 p=Path(p)
 if p.stat().st_mode&0o077:raise RuntimeError('PRIVATE_CONFIG_PERMISSIONS_INVALID')
 return json.loads(p.read_text())
def write_private(p,data):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data));p.chmod(0o600)
def managed_root(w,c):return w/'.multica-node',{'issue_id':'test','agent_id':'test','workspace_id':'test'}
def checked_path(p,r):
 assert p.is_relative_to(r)
 return p
def artifact_lock(r):return os.open(r/'lock',os.O_CREAT|os.O_RDWR,0o600)
def verify_candidate(w,p):return type('Result',(),{'returncode':0})()
def ops_identity():return {'commit':'test-only'}
''')
                (ops/'accept.py').write_text('def prepare_profile(*args):pass\n')
                (ops/'linux.py').write_text('''import json,os
from pathlib import Path
def run(command,**kw):
 if 'status' in command:kw['stdout'].write(b'{"state":"ready"}')
 elif str(command[1]).endswith('prepare-variant-source.mjs'):
  a=Path(kw['attempt']);result={'status':'PASS','cleanup':{'package_closed':True,'logged_out':True}}
  (a/'result.json').write_text(json.dumps(result));(a/'result.json').chmod(0o600)
  (a/'source-manifest.json').write_text('{}');(a/'source-manifest.json').chmod(0o600)
  (a/os.environ['TEST_REJECT_PRIVATE_FILE']).chmod(0o664)
 return 0
''')
                attempt=root/'attempts/check'
                result=subprocess.run(['python3',str(HELPER),'--worktree',str(work),'--config',str(config),'--out',str(attempt),'--operator-scripts',str(ops)],env={**os.environ,'TEST_REJECT_PRIVATE_FILE':rejected},capture_output=True,text=True)
                self.assertEqual(result.returncode,1,result.stdout+result.stderr)
                receipt=json.loads((attempt/'preparation.json').read_text())
                self.assertEqual(receipt['status'],'FAIL')
                self.assertEqual(receipt['error'],'PRIVATE_CONFIG_PERMISSIONS_INVALID')
                self.assertEqual((attempt/'preparation.json').stat().st_mode&0o777,0o600)
                self.assertFalse((source/'actor-source.json').exists())
                self.assertFalse((source.parent/'actor-source.json').exists())
                self.assertEqual((attempt/rejected).stat().st_mode&0o777,0o664)

if __name__=='__main__':unittest.main()
