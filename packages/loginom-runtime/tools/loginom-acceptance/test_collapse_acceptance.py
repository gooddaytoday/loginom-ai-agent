import copy,json,sqlite3,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import collapse_acceptance as a
import collapse_node_acceptance as outer
import run
from evidence import export_history,PREFIX

class CollapseAdmissionTest(unittest.TestCase):
 def test_preflight_before_credentials_or_process(self):
  with tempfile.TemporaryDirectory() as d,patch.object(run,'connection',side_effect=AssertionError('credentials')),patch.object(run.subprocess,'run',side_effect=AssertionError('process')):
   args=SimpleNamespace(goal=a.GOAL_ID,run=False,output=Path(d)/'preflight.json')
   self.assertEqual(run.execute(args),0);r=json.loads(args.output.read_text());self.assertFalse(r['ready']);self.assertEqual(r['readonly_producer'],'collapse_native_sessions_v1')
   self.assertIn('all-null',r['gates']);self.assertIn('candidate-stage-and-readback',r['gates'])
 def test_run_blocked_before_auth_even_with_claimed_closed_gates(self):
  with patch.object(a,'frozen',return_value={'gates':{'resource':'PASS'}}),patch.object(run,'connection',side_effect=AssertionError('credentials')),patch.object(run.subprocess,'Popen',side_effect=AssertionError('model')):
   with self.assertRaisesRegex(ValueError,'Collapse admission blocked'):run.execute(SimpleNamespace(goal=a.GOAL_ID,run=True))
 def test_explicit_user_profile_is_required(self):
  a.require_user_profile({'hermes_profile':{'version':1,'result_profile':'user-v1','mode':'executor-replay'}})
  for profile in [None,{},dict(version=1,result_profile='diagnostic',mode='executor-replay'),dict(version=1,result_profile='user-v1',mode='classic')]:
   with self.assertRaisesRegex(ValueError,'user-v1'):a.require_user_profile({'hermes_profile':profile})
 def test_authorized_collapse_budget_only(self):
  args=SimpleNamespace(goal=a.GOAL_ID,run=True,timeout=7200,max_turns=140,manifest_uri=a.CANDIDATE_URI,manifest_sha256=a.CANDIDATE_SHA,model_profile='chatgpt-sol',storage_directory='/test-1/node16-20260913-a56c2488',loginom_user='test-1')
  run.validate_inputs(args)
  for change in [dict(timeout=7201),dict(max_turns=141),dict(goal='basic-graph')]:
   invalid=SimpleNamespace(**{**vars(args),**change})
   with self.assertRaisesRegex(ValueError,'Invalid acceptance budget'):run.validate_inputs(invalid)
 def test_exact_candidate_admitted_and_wrong_profile_blocked(self):
  args=SimpleNamespace(manifest_uri=a.CANDIDATE_URI,manifest_sha256=a.CANDIDATE_SHA,model_profile='chatgpt-sol')
  with patch.object(a,'current_slot',return_value={'slot_id':a.SLOT}),patch.object(a,'runtime_pin',return_value={'client_revision':a.RUNTIME}),patch.object(a,'verified_candidate',return_value={'manifest_sha256':a.CANDIDATE_SHA}):self.assertTrue(a.admission(args)['ready'])
  args.model_profile='xiaomi-mimo';self.assertFalse(a.admission(args)['ready'])
 def test_reassigned_slot_blocks_launch(self):
  args=SimpleNamespace(manifest_uri=a.CANDIDATE_URI,manifest_sha256=a.CANDIDATE_SHA)
  with patch.object(a,'current_slot',side_effect=ValueError('another node owns slot')):
   self.assertFalse(a.admission(args)['ready'])
 def test_missing_real_rehearsal_cannot_admit(self):
  args=SimpleNamespace(manifest_uri=a.CANDIDATE_URI,manifest_sha256=a.CANDIDATE_SHA)
  with patch.object(a,'verified_candidate',side_effect=ValueError('missing raw preparation')):
   self.assertFalse(a.admission(args)['ready'])
 def test_admitted_prompt_executes_frozen_requirements_now(self):
  text=a.prompt('/test-1/node16-new/run.lgp','/test-1/node16-new','20260913-170000-abcdef12')
  self.assertIn('Допуск оператора уже выдан',text);self.assertNotIn('не запускать до допуска',text)
  self.assertIn('При неоднозначной операции',text);a.frozen()
 def test_fixture_admission_exact_fresh_names(self):
  ds=a.fixtures('20260913-170000-abcdef12','/test-1/node16-new');self.assertEqual(len(ds),5)
  self.assertTrue(all(x['name'].startswith('Dock-collapse-20260913-170000-abcdef12-') for x in ds))
  for artifact,path in zip(ds,a.fixture_paths()):self.assertEqual(artifact['sha256'],a.sha(path));self.assertEqual(artifact['bytes'],path.stat().st_size)
  for bad in ['old','../20260913-170000-abcdef12','20260913-170000-abcdef12/evil']:
   with self.assertRaises(ValueError):a.fixtures(bad,'/test-1/node16-new')
 def test_raw_export_is_opt_in_and_redacted(self):
  with tempfile.TemporaryDirectory() as d:
   h=Path(d);db=sqlite3.connect(h/'state.db');db.execute('CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,tool_calls TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT)')
   tool=PREFIX+'dock_node_status';c=[{'id':'c','function':{'name':tool,'arguments':json.dumps({'operation_id':'x'})}}]
   db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?)',(1,'s','assistant',json.dumps(c),None,None,None));db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?)',(2,'s','tool',None,'c',tool,json.dumps({'operation_id':'x','password':'value-secret'})));db.commit();db.close()
   self.assertNotIn('raw_content',export_history(h,['value-secret'])[1][0])
   e=export_history(h,['value-secret'],retain_raw_tools=True)[1][0];self.assertIn('raw_content',e);self.assertNotIn('value-secret',e['raw_content'])
 def test_missing_full_evidence_and_prepared_case_claims_refused(self):
  for e in [{},{'run_id':'foreign'},{'run_id':'20260913-170000-abcdef12','cases':{k:{'status':'CASE_PASS'} for k in outer.EXPECTED}}, {'calls':[],'tools':[],'events':[]}]:
   r=outer.audit({'run_id':'20260913-170000-abcdef12'},e,'prepared',None)
   self.assertFalse(r['passed']);self.assertFalse(r['subplan_complete'])
 def test_no_forged_readonly_receipt_can_admit_missing_producer(self):
  good=dict(kind='collapse_readonly_source_v1',run_id='r',document_id='new',path='/test-1/a.csv',sha256='a'*64,bytes=12,before_any_write=True,write_operations=[],raw_observation_refs=['raw'],download_artifact_sha256='a'*64,producer_id='claimed-PASS')
  for key,value in [('producer_id',None),('document_id','old'),('sha256','b'*64),('before_any_write',False),('raw_observation_refs',[])]:
   bad={**good,key:value}
   with self.assertRaises(ValueError):outer.readonly_receipt(bad,run_id='r',document_id='new',path='/test-1/a.csv',digest='a'*64,size=12)
 def test_raw_reply_missing_mismatched_and_event_substitution(self):
  call=dict(session_id='s',tool_call_id='c',row=1,tool=PREFIX+'dock_node_apply',arguments={'operation_id':'o'})
  reply=dict(session_id='s',tool_call_id='c',row=2,tool=call['tool'],result={'status':'SUCCEEDED'},raw_content='{"status":"SUCCEEDED"}')
  e={'calls':[call],'tools':[reply],'events':[]};self.assertEqual(len(outer.pairs(e)),1)
  for change in [lambda x:x['tools'][0].pop('raw_content'),lambda x:x['tools'][0].update(raw_content='{"status":"FAILED"}'),lambda x:x['tools'][0].update(tool_call_id='foreign'),lambda x:x['tools'][0].update(row=0)]:
   bad=copy.deepcopy(e);change(bad)
   with self.assertRaises(ValueError):outer.pairs(bad)
  with self.assertRaises(ValueError):outer.node(e,outer.pairs(e),'o')
  with self.assertRaises(ValueError):outer.node({**e,'events':[{'operation_id':'o','phase':'node_apply_prepared','request':{'operation_id':'different'}}]},outer.pairs(e),'o')
 def test_persistence_requires_new_session_and_all_cases(self):
  for independent in [None,{},dict(run_id='foreign',origin='independent_codex_session'),dict(run_id='r',origin='prepared_kit')]:
   with self.assertRaises((ValueError,KeyError)):outer.persistence({'run_id':'r'},{},independent,{})
if __name__=='__main__':unittest.main()
