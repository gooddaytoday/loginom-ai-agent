"""Synthetic MCP envelope mutations test validation semantics, never live acceptance."""
import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import collapse_node_acceptance as a
from evidence import PREFIX
class NegativeEvidence(unittest.TestCase):
 def pair(self,kind):
  f=lambda n:dict(kind='input_field',name=n)
  p={'information':[f('Id')],'transposed':[] if kind=='empty' else [f('Id')]}
  call=dict(tool=PREFIX+'dock_node_apply',arguments=dict(operation_id='r:negative-'+kind,parameters=p))
  message='Complete ordered collapse roles required' if kind=='empty' else 'Unknown, duplicate or conflicting collapse role'
  error=dict(status='FAILED',action_key='request.validate',phase='request_rejected',request_rejected=True,effect_possible=False,operation_id=None,trace=[],error=dict(code='REQUEST_REJECTED',message=message),output=dict(operation=dict(operation_id=None,state='idle',outcome=None,cleanup_confirmed=True,effect_state='none')))
  return call,dict(result=dict(isError=True,error=json.dumps(error)))
 def test_native_validation_shapes(self):
  for kind in ['empty','conflict']:
   c,r=self.pair(kind);self.assertTrue(a.negative({'events':[]},[(c,r)],c['arguments']['operation_id'],kind))
 def test_other_error_is_not_role_proof(self):
  for kind in ['empty','conflict']:
   c,r=self.pair(kind);err=json.loads(r['result']['error']);err['error']['message']='Invalid budgets';r['result']['error']=json.dumps(err)
   with self.assertRaisesRegex(ValueError,'Wrong validation cause'):a.negative({'events':[]},[(c,r)],c['arguments']['operation_id'],kind)
 def test_allocated_or_mutating_error_is_not_validation(self):
  for field,value in [('effect_possible',True),('operation_id','allocated'),('action_key','other')]:
   c,r=self.pair('conflict');err=json.loads(r['result']['error']);err[field]=value;r['result']['error']=json.dumps(err)
   with self.assertRaises(ValueError):a.negative({'events':[]},[(c,r)],c['arguments']['operation_id'],'conflict')
if __name__=='__main__':unittest.main()
