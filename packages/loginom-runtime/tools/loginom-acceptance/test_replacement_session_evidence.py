"""Synthetic component fixtures; never autonomous acceptance evidence."""
import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from replacement_session_evidence import verify_session_evidence,digest,geometry_check,skill_bundle_revision
from evidence import PREFIX
class SessionEvidenceTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);seed=self.root/'seed';seed.mkdir();(seed/'SKILL.md').write_bytes(b'skill');self.skill=skill_bundle_revision(seed)
  self.req=dict(loginom_url='https://loginom.test/app/?testable=true',runtime_source_pin=dict(client_revision='runtime',inputs={'client/lib/a.mjs':'source'}),dependencies=dict(node='24.19.0',playwright='pw',sdk='sdk',playwright_mcp='mcp',chromium_revision='1243',chromium_version='chrome'))
  self.pin=dict(manifest_sha256='manifest',catalog_version='candidate',readback_files={'actions.json':'actions','selectors.json':'selectors'},e2e_commit='e2e',compatibility={'loginom_build':'7.4.2'})
  state=dict(status='READY',session_id='working',operation_id='prepare',document_id='document',workflow_ref={'workflow_id':'workflow'})
  state['browser_geometry']=dict(version=1,source='prepare_same_browser_page',session_id='working',operation_id='prepare',document_id='document',workflow_ref=state['workflow_ref'],runtime_revision='runtime',manifest_sha256='manifest',viewport=None,observed_at='2026-09-13T08:00:00Z',observed=dict(document_id='document',origin='https://loginom.test/',pathname='/app/',visibility='visible',inner_width=1508,inner_height=862,outer_width=1508,outer_height=949,available_width=1512,available_height=949,screen_x=4,screen_y=33,available_left=0,available_top=33))
  event=dict(event='workspace_prepared',session_id='working',runtime_revision='runtime',manifest_sha256='manifest',state=state,recorded_at='2026-09-13T08:00:01Z')
  call=dict(session_id='hermes-caller',tool=PREFIX+'dock_prepare',tool_call_id='call',arguments={},row=1)
  reply=dict(session_id='hermes-caller',tool=PREFIX+'dock_prepare',tool_call_id='call',result=dict(prepared=True,sessionId='working',workspace=state),row=2)
  self.evidence=dict(events=[event],calls=[call],tools=[reply])
  for sid in ['working','precheck']:
   p=self.path(sid);p.mkdir(parents=True)
   self.write(p/'tools.json',[])
   meta=dict(client='0.1.0-dev.20260910.3',runtimeRelease=None,toolCatalogSha256=hashlib.sha256(b'[]').hexdigest(),sessionId=sid,agent='hermes',adapterRevision='0.1.0-rc.4-acceptance',mode='executor-replay',resultProfile='user-v1',loginomUrl=self.req['loginom_url'],clientRevision='runtime',actionManifestDigest='manifest',actionCatalogVersion='candidate',actionCatalogDigest='actions',selectorCatalogDigest='selectors',e2eCommit='e2e',compatibilityProfile=self.pin['compatibility'],capabilityAbi=1,executorRevision='1.2.0',catalogLifecycleStatus='candidate',acceptanceVerified=False,acceptanceDigest=None,browserViewport=None,browserWindowMode='maximized',node='24.19.0',playwright='pw',sdk='sdk',playwrightMcp='mcp',chromiumRevision='1243',chromiumVersion='chrome',profile=str(p/'browser-profile'),artifacts=str(p/'artifacts'),clientSourceManifest=[{'path':'./a.mjs','sha256':'source'}],workspaceReady=False,skillRevision=None)
   if sid=='working':
    skill=p/('skill-'+self.skill)/'SKILL.md';skill.parent.mkdir();skill.write_bytes(b'skill');meta.update(workspaceReady=True,skillRevision=self.skill,targetIdentity=self.pin['compatibility'],skillPath=str(skill),workspacePreparation={'state':state},workflowRef=state['workflow_ref']);(p/'execution-events.jsonl').write_text(json.dumps(event)+'\n')
   self.write(p/'session.json',meta)
  self.origin=dict(version=1,source='official_stdio_transport',session_id='precheck',pid=123,runtime_revision='runtime',manifest_sha256='manifest',initialized_client='loginom-acceptance-tool-precheck/1',closed=True,overflow=False,methods=['initialize','notifications/initialized','tools/list']);self.proof()
 def path(self,sid):return self.root/'private/dock-state/sessions'/sid
 def write(self,path,value):path.write_text(json.dumps(value))
 def proof(self):
  p=self.path('precheck');self.write(p/'mcp-origin.json',self.origin);self.write(self.root/'tool-precheck.json',dict(available=True,provenance=dict(version=1,session_id='precheck',pid=123,origin_sha256=digest(p/'mcp-origin.json'),metadata_sha256=digest(p/'session.json'))))
 def audit(self):return verify_session_evidence(self.root,self.req,self.evidence,self.pin,self.skill)
 def test_positive(self):self.assertTrue(self.audit()['passed'],self.audit())
 def test_unknown_session_directory(self):
  self.path('unknown').mkdir();self.assertFalse(self.audit()['passed'])
 def test_unknown_extra(self):
  (self.root/'tool-precheck.json').unlink();self.assertFalse(self.audit()['passed'])
 def test_foreign_active_precheck(self):
  p=self.path('precheck')/'session.json';m=json.loads(p.read_text());m['workspaceReady']=True;self.write(p,m);self.proof();self.assertFalse(self.audit()['passed'])
 def test_protocol_action_or_unknown_origin(self):
  for method in ['tools/call','other']:
   self.origin['methods'].append(method);self.proof();self.assertFalse(self.audit()['passed']);self.origin['methods'].pop()
  self.origin['initialized_client']='other';self.proof();self.assertFalse(self.audit()['passed'])
 def test_pid_substitution(self):
  p=self.root/'tool-precheck.json';v=json.loads(p.read_text());v['provenance']['pid']=456;self.write(p,v);self.assertFalse(self.audit()['passed'])
 def test_precheck_execution_events(self):
  (self.path('precheck')/'execution-events.jsonl').write_text('{}\n');self.assertFalse(self.audit()['passed'])
 def test_all_pins(self):
  p=self.path('working')/'session.json';original=json.loads(p.read_text())
  for key in ['client','toolCatalogSha256','clientRevision','actionManifestDigest','actionCatalogDigest','selectorCatalogDigest','e2eCommit','capabilityAbi','executorRevision','chromiumRevision','chromiumVersion','playwright','playwrightMcp','sdk','node','skillRevision','compatibilityProfile','profile','loginomUrl','browserViewport','browserWindowMode']:
   with self.subTest(key=key):
    m=copy.deepcopy(original);m[key]='wrong';self.write(p,m);self.assertFalse(self.audit()['passed'])
  self.write(p,original)
 def test_journal_session_substitution(self):
  self.evidence['events'][0]['session_id']='precheck';self.assertFalse(self.audit()['passed'])
 def test_journal_export_substitution(self):
  (self.path('working')/'execution-events.jsonl').write_text('{}\n');self.assertFalse(self.audit()['passed'])
 def test_foreign_public_caller(self):
  self.evidence['calls'][0]['session_id']='foreign';self.assertFalse(self.audit()['passed'])
 def test_metadata_session_substitution(self):
  p=self.path('working')/'session.json';m=json.loads(p.read_text());m['sessionId']='precheck';self.write(p,m);self.assertFalse(self.audit()['passed'])
 def test_geometry_negative(self):
  e=self.evidence['events'][0];state=e['state'];original=copy.deepcopy(state['browser_geometry'])
  mutations=[lambda r:r.update(session_id='other'),lambda r:r.update(viewport={'width':1280,'height':800}),lambda r:r.update(observed_at='2026-09-13T07:00:00Z'),lambda r:r['observed'].update(document_id='other'),lambda r:r['observed'].update(outer_width=1280),lambda r:r['observed'].update(inner_width=1280),lambda r:r['observed'].update(visibility='hidden'),lambda r:r['observed'].update(screen_x=999)]
  for mutation in mutations:
   state['browser_geometry']=copy.deepcopy(original);mutation(state['browser_geometry'])
   with self.assertRaises(ValueError):geometry_check(state,e,self.req)
  state.pop('browser_geometry')
  with self.assertRaises(KeyError):geometry_check(state,e,self.req)
if __name__=='__main__':unittest.main()
