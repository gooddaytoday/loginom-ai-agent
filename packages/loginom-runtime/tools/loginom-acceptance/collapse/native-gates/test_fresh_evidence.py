"""Tamper real, explicitly supplied operator evidence; no synthetic PASS fixture."""
import json,os,shutil,tempfile,unittest
from pathlib import Path
from verify_reopened import check as current_fresh
from verify_loss import check as current_loss

# Explicit historical runtime is limited to diagnostic tests. Model auditor uses
# the default current-runtime check and cannot supply this override.
def fresh(p):return current_fresh(p,expected_runtime=os.environ.get('COLLAPSE_DIAGNOSTIC_RUNTIME'))
def loss(p):return current_loss(p,expected_runtime=os.environ.get('COLLAPSE_DIAGNOSTIC_RUNTIME'))

class FreshEvidence(unittest.TestCase):
 def setUp(self):
  source=os.environ.get('COLLAPSE_FRESH_SESSION')
  if not source:self.skipTest('explicit fresh native evidence required')
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.p=Path(self.tmp.name);source=Path(source)
  names=['session.json','preparation.json','readonly-first.json','readonly-specification.json','graph-before.json','graph-after.json','graph-raw-refs.json','browser-5.json','browser-6.json','public-api.jsonl','execution-events.jsonl','reopened-import.json']
  names+=list(json.loads((source/'graph-raw-refs.json').read_text()).values())
  for name in set(names):shutil.copyfile(source/name,self.p/name)
  shutil.copytree(source/'readonly-downloads',self.p/'readonly-downloads')
 def change(self,name,fn):
  path=self.p/name;x=json.loads(path.read_text());fn(x);path.write_text(json.dumps(x))
 def test_real_fresh_case(self):self.assertEqual(fresh(self.p)['status'],'FRESH_NATIVE_CASE_PASS')
 def test_raw_graph_substitution(self):
  self.change('graph-after.json',lambda x:x['nodes'][0].update(id='foreign'))
  with self.assertRaises(ValueError):fresh(self.p)
 def test_old_runtime(self):
  self.change('session.json',lambda x:x.update(clientRevision='old'))
  with self.assertRaises(ValueError):fresh(self.p)
 def test_unsupervised_order(self):
  self.change('session.json',lambda x:x.update(automaticReadonlyReopen=False))
  with self.assertRaises(ValueError):fresh(self.p)
 def test_public_write_before_downloads(self):
  p=self.p/'public-api.jsonl';rows=[json.loads(s) for s in p.read_text().splitlines()];next(r for r in rows if r['phase']=='request')['before']=3;p.write_text('\n'.join(map(json.dumps,rows)))
  with self.assertRaises(ValueError):fresh(self.p)
 def test_projected_public_reply(self):
  p=self.p/'public-api.jsonl';rows=[json.loads(s) for s in p.read_text().splitlines()]
  for r in rows:
   if r['phase']=='response' and r['reply'].get('structuredContent',{}).get('result_version')=='user-v1' and any(q.get('id')==r['id'] and q.get('request',{}).get('name','').startswith('dock_node_') for q in rows):
    r['reply']['structuredContent']['result_version']='fake';r['reply']['content'][0]['text']=json.dumps(r['reply']['structuredContent']);break
  p.write_text('\n'.join(map(json.dumps,rows)))
  with self.assertRaises(ValueError):fresh(self.p)
 def test_missing_native_event(self):
  p=self.p/'execution-events.jsonl';rows=[json.loads(s) for s in p.read_text().splitlines()];p.write_text('\n'.join(json.dumps(r) for r in rows if r['phase']!='collapse_native_full_completed'))
  with self.assertRaises(ValueError):fresh(self.p)

class LossEvidence(unittest.TestCase):
 def setUp(self):
  source=os.environ.get('COLLAPSE_LOSS_SESSION')
  if not source:self.skipTest('explicit post-gesture evidence required')
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.p=Path(self.tmp.name);source=Path(source)
  seq=json.loads((source/'gates-loss.json').read_text())['dropped'][0]['browser_sequence']
  for name in ['session.json','obligation-done-after-source.json','obligation-close.json','gates-loss.json','gates-loss-replay.json','gates-loss-native.json','obligation-close-readback.json','public-api.jsonl',f'browser-{seq}.json',f'browser-{seq+1}.json']:shutil.copyfile(source/name,self.p/name)
 def change(self,name,fn):
  p=self.p/name;x=json.loads(p.read_text());fn(x);p.write_text(json.dumps(x))
 def test_real_loss(self):self.assertEqual(loss(self.p)['status'],'POST_GESTURE_LOSS_PASS')
 def test_outcome_promotion(self):
  self.change('gates-loss.json',lambda x:x['outcome'].update(status='SUCCEEDED'))
  with self.assertRaises(ValueError):loss(self.p)
 def test_replay_browser_work(self):
  self.change('gates-loss-replay.json',lambda x:x.update(after_resume=x['after_resume']+1))
  with self.assertRaises(ValueError):loss(self.p)
 def test_native_state_substitution(self):
  self.change('gates-loss-native.json',lambda x:x.update(skip=True))
  with self.assertRaises(ValueError):loss(self.p)
 def test_missing_public_resume(self):
  p=self.p/'public-api.jsonl';rows=[json.loads(s) for s in p.read_text().splitlines()];p.write_text('\n'.join(json.dumps(r) for r in rows if r.get('request',{}).get('name')!='dock_node_resume'))
  with self.assertRaises(ValueError):loss(self.p)

if __name__=='__main__':unittest.main()
