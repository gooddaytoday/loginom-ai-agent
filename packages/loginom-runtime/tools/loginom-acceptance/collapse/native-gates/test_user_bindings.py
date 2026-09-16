import copy,json,os,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import collapse_node_acceptance as a
from evidence import PREFIX
class UserBindings(unittest.TestCase):
 def fixture(self):
  ref=dict(workflow_id='w',tab_tid='tab',prefix='prefix',navigation_path=[dict(tid='path',label='Name')])
  request=dict(operation_id='op',document_id='d',workflow_ref={'workflow_id':'w'},parameters={'x':1})
  call=dict(arguments=request,session_id='s',row=3)
  prepare=(dict(tool=PREFIX+'dock_prepare',session_id='s',row=1),dict(row=2,result=dict(prepared=True,workspace=dict(status='READY',document_id='d',workflow_ref=ref))))
  return call,dict(request,workflow_ref=ref),[prepare]
 def test_issued_workflow_expansion(self):
  c,p,ps=self.fixture();a.bind_node_request(p,c,ps)
 def test_foreign_stale_and_changed_parameters_rejected(self):
  for change in [lambda c,p,ps:ps[0][1].update(row=4),lambda c,p,ps:ps[0][0].update(session_id='foreign'),lambda c,p,ps:p.update(parameters={'x':2}),lambda c,p,ps:c['arguments'].update(document_id='other')]:
   c,p,ps=self.fixture();change(c,p,ps)
   with self.assertRaises(ValueError):a.bind_node_request(p,c,ps)
 def test_latest_save_continuation_required(self):
  c,p,ps=self.fixture();new={**p['workflow_ref'],'tab_tid':'new'};ps.append((dict(tool=PREFIX+'dock_action_run',session_id='s',row=2,arguments={'action_key':'package.save_checkpoint'}),dict(row=3,result=dict(status='SUCCEEDED',output=dict(workflow_continuations=[dict(document_id='d',workflow_ref=new)])))))
  c['row']=4
  with self.assertRaises(ValueError):a.bind_node_request(p,c,ps)
  a.bind_node_request(dict(p,workflow_ref=new),c,ps)
 def test_error_transport_forms_are_not_errorless_success(self):
  body={'status':'FAILED','action_key':'request.validate'}
  for result in [dict(isError=True,error=json.dumps(body)),dict(isError=True,error=body),dict(isError=True,content=[body]),dict(isError=True,content=[dict(type='text',text=json.dumps(body))])]:self.assertEqual(a.validation_error({'result':result}),body)
  with self.assertRaises(ValueError):a.validation_error({'result':{'content':[body]}})
@unittest.skipUnless(os.environ.get('COLLAPSE_USER_MCP_EVIDENCE'),'actual operator MCP evidence required')
class RealUserBindings(unittest.TestCase):
 def evidence(self):return json.loads(Path(os.environ['COLLAPSE_USER_MCP_EVIDENCE']).read_text())
 def test_actual_case_save_and_three_refusals(self):
  e=self.evidence();ps=a.pairs(e)
  a.native_case(e,ps,'node16-profile-final:mixed','mixed');a.saved_checkpoint(e,ps,'node16-profile-final:save')
  for k in ('empty','conflict','missing'):a.negative(e,ps,'node16-profile-final:negative-'+k,k)
 def test_foreign_save_path_and_wrong_empty_cause_rejected(self):
  e=self.evidence();next(c for c in e['calls'] if c['arguments'].get('operation_id')=='node16-profile-final:save')['arguments']['parameters']['path']='/foreign.lgp'
  with self.assertRaises(ValueError):a.saved_checkpoint(e,a.pairs(e),'node16-profile-final:save')
  e=self.evidence();ps=a.pairs(e);c,r=next((c,r) for c,r in ps if c['arguments'].get('operation_id')=='node16-profile-final:negative-empty')
  body=a.validation_error(r);body['error']['message']='Invalid parameters.parameters.information: array is too short'
  r['result']={'isError':True,'error':body}
  with self.assertRaises(ValueError):a.negative(e,ps,'node16-profile-final:negative-empty','empty')
if __name__=='__main__':unittest.main()
