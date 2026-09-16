import unittest,copy
from text_export_observer_evidence import verify_search_scroll
class SearchPolicyTests(unittest.TestCase):
 def test_movement_and_tampering(self):
  c={'origin':'http://logi-test-plan.bg.local','baseline':{'destination':'/test-2/a.csv'}}
  e=dict(ref='row',tid='MF;TF-1;FileStorageForm;colName_old',scroll=dict(ref='table',top=0,max_top=2000),allowed_actions=['scroll'],interaction=dict(state='point_observed'))
  s=dict(authenticated=True,origin=c['origin'],loginom_build='7.4.2',workflow_ref=dict(prefix='MF;TF-1',tab_tid='tab'),file_storage=dict(directory='/test-2'),dom_epoch=dict(document='doc'),observation_root=dict(ref='table',identity=dict(anchor_tid='MF;TF-1;FileStorageForm;pnlFileStorage;tbl')),ui=dict(elements=[e],dialogs=[],masks=[]))
  step=dict(kind='search_scroll',name='a.csv',snapshot=s,element=e,delta_y=1000)
  response=dict(status='SUCCEEDED',cleanup_complete=True,output=dict(gesture_applied=True,workflow_ref=s['workflow_ref'],file_storage=s['file_storage'],dom_epoch=s['dom_epoch']),trace=[dict(event='ui_scroll_applied',owner_ref='table',**{'from':0,'to':1000})])
  verify_search_scroll(step,response,c)
  for path,value in [('step.name','b.csv'),('step.delta_y',1001),('step.snapshot.file_storage.directory','/other'),('step.element.scroll.ref','foreign'),('response.trace.0.to',900),('response.trace.0.owner_ref','foreign'),('response.output.dom_epoch.document','other'),('response.cleanup_complete',False)]:
   f=dict(step=copy.deepcopy(step),response=copy.deepcopy(response));keys=path.split('.');target=f
   for k in keys[:-1]:target=target[int(k)] if isinstance(target,list) else target[k]
   target[keys[-1]]=value
   with self.subTest(path=path),self.assertRaises(AssertionError):verify_search_scroll(f['step'],f['response'],c)
