"""Captured original cross-issue reconciliation, offline HTTP/process/FS only."""
import copy,hashlib,http.server,json,os,subprocess,sys,tempfile,threading,unittest,uuid
from pathlib import Path

FIXTURE=Path(__file__).with_name('test-fixtures')/'source-task'

class ResolverTest(unittest.TestCase):
 def exercise(self, mode='cross68', target='68'):
  metadata=json.loads((FIXTURE/'cli-readback.json').read_text());sender=copy.deepcopy(metadata['source_task'][0])
  rec=json.loads((FIXTURE/('f53-receiving'+target+'-receipt.json')).read_text());message=(FIXTURE/('f53-receiving'+target+'.md')).read_text()
  text=f"[@Исполнитель](mention://agent/{rec['agent']})\nHandoff-ID: {rec['key']}\nSource-SHA: f53e71623b4d77aa53873702ef6b61cefcc5c095\nAction: owned-send-f53-receiving{target}\n\n{message}"
  self.assertEqual(hashlib.sha256(text.encode()).hexdigest(),rec['fingerprint'])
  comment=copy.deepcopy(next(c for c in metadata['comments'] if c['id']==rec['comment']));comment['content']=text
  if mode=='explicit':
   message=text
   wrapper=f"[@Исполнитель](mention://agent/{rec['agent']})\nHandoff-ID: {rec['key']}\nSource-SHA: f53e71623b4d77aa53873702ef6b61cefcc5c095\nAction: owned-send-f53-receiving{target}\n\n{message}"
   rec['fingerprint']=hashlib.sha256(wrapper.encode()).hexdigest() # separate labelled explicit-adoption wrapper
  if mode=='legacy':
   message=f"[@Исполнитель](mention://agent/{rec['agent']})\n\n"+message+"\n\nArtifact-handoff: "+json.dumps([{'handoff':rec['key'],'sha':'f53e71623b4d77aa53873702ef6b61cefcc5c095'}])
   comment['content']=message
   wrapper=f"[@Исполнитель](mention://agent/{rec['agent']})\nHandoff-ID: {rec['key']}\nSource-SHA: f53e71623b4d77aa53873702ef6b61cefcc5c095\nAction: owned-send-f53-receiving{target}\n\n{message}"
   rec['fingerprint']=hashlib.sha256(wrapper.encode()).hexdigest() # separate labelled prepared fixture, original captured files untouched
  receiver=copy.deepcopy(next(r for r in metadata['receiving_runs'] if r['trigger_comment_id']==comment['id']))
  workspace='dcf616e7-66eb-470a-9b04-6462f220cf3b';sender['workspace_id']=workspace
  source=[sender];pages=None
  if mode=='same':sender['issue_id']=rec['issue']
  if mode=='foreign-author':sender['agent_id']=receiver['agent_id']
  if mode=='foreign-workspace':sender['workspace_id']='11111111-1111-4111-8111-111111111111'
  if mode=='missing':source=[]
  if mode=='duplicate':source.append(copy.deepcopy(sender))
  if mode=='incomplete':del sender['issue_id']
  if mode=='foreign-comment':comment['issue_id']='11111111-1111-4111-8111-111111111111'
  if mode=='wrong-receiver':receiver['trigger_comment_id']='11111111-1111-4111-8111-111111111111'
  if mode=='wrong-fingerprint':rec['fingerprint']='0'*64
  if mode.startswith('page'):
   first=[dict(sender,id=str(uuid.UUID(int=i+1)),created_at='2026-01-01T00:00:00Z') for i in range(200)]
   if mode=='page-incomplete':del first[-1]['created_at']
   second=[sender]
   if mode=='page-duplicate':first[0]=dict(sender,created_at='2026-01-01T00:00:00Z')
   pages=[first,second]
  posts=[];calls=[];lookups=[]
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    calls.append(self.path)
    if self.path==f"/api/issues/{rec['issue']}/comments":value=[comment]
    elif self.path==f"/api/issues/{rec['issue']}/task-runs":value=[receiver]
    elif self.path.startswith(f"/api/agents/{metadata['source_task'][0]['agent_id']}/tasks?limit=200"):
     lookups.append(self.path);value=pages[1 if '&before=' in self.path else 0] if pages else source
    else:self.send_error(404);return
    data=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
   def do_POST(self):posts.append(self.path);self.send_error(409)
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever);thread.start()
  try:
   with tempfile.TemporaryDirectory() as raw:
    root=Path(raw);receipt=root/'receipt.json';receipt.write_text(json.dumps(rec));msg=root/'message.md';msg.write_text(message)
    wrapper='''import sys,os,importlib.util
helper,bridge,issue,agent,message,receipt,target,existing=sys.argv[1:]
sys.path.insert(0,os.path.dirname(helper));spec=importlib.util.spec_from_file_location('candidate',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);original=m.request
m.request=lambda base,headers,route,payload=None,**kwargs:original(bridge,headers,route,payload,**kwargs)
sys.argv=[helper,'--issue',issue,'--agent',agent,'--sha','f53e71623b4d77aa53873702ef6b61cefcc5c095','--scope','owned-send-f53-receiving'+target,'--message',message,'--receipt',receipt]
if existing:sys.argv+=['--existing-comment',existing]
sys.exit(m.main())
'''
    env=dict(os.environ,MULTICA_SERVER_URL='https://mas.kartamyshev.dev',MULTICA_TOKEN='offline-only',MULTICA_WORKSPACE_ID=workspace);env.pop('MULTICA_TASK_ID',None)
    result=subprocess.run([sys.executable,'-c',wrapper,str(Path(__file__).with_name('handoff.py').resolve()),f'http://127.0.0.1:{server.server_port}',rec['issue'],rec['agent'],str(msg),str(receipt),target,comment['id'] if mode in ['legacy','explicit'] else ''],capture_output=True,text=True,env=env,timeout=30)
    record=json.loads(receipt.read_text());self.assertFalse(posts);self.assertEqual(record['fingerprint'],rec['fingerprint'])
    return result,record,lookups,metadata['source_task'][0]['issue_id']
  finally:server.shutdown();server.server_close();thread.join()
 def test_captured_cross68(self):
  result,record,lookups,source_issue=self.exercise();self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(record['state'],'assigned');self.assertEqual(record['source_issue'],source_issue);self.assertTrue(lookups)
 def test_captured_cross72(self):
  result,record,_,source_issue=self.exercise(target='72');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(record['source_issue'],source_issue);self.assertEqual(record['state'],'assigned')
 def test_same_issue(self):
  result,record,_,_=self.exercise('same');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(record['state'],'assigned')
 def test_explicit_canonical_adoption(self):
  result,record,_,_=self.exercise('explicit');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(record['state'],'assigned')
 def test_explicit_legacy_adoption(self):
  result,record,_,_=self.exercise('legacy');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(record['state'],'assigned')
 def test_source_guards(self):
  for mode in ['foreign-author','foreign-workspace','missing','duplicate','incomplete','foreign-comment','wrong-fingerprint','wrong-receiver']:
   with self.subTest(mode=mode):
    result,record,_,_=self.exercise(mode);self.assertNotEqual(result.returncode,0);self.assertNotEqual(record['state'],'assigned')
 def test_complete_pagination(self):
  result,record,lookups,_=self.exercise('page');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(record['state'],'assigned');self.assertTrue(any('&before=' in p for p in lookups))
 def test_duplicate_and_incomplete_later_pages(self):
  for mode in ['page-duplicate','page-incomplete']:
   with self.subTest(mode=mode):
    result,record,_,_=self.exercise(mode);self.assertNotEqual(result.returncode,0);self.assertNotEqual(record['state'],'assigned')

if __name__=='__main__':unittest.main()
