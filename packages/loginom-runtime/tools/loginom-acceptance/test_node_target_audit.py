import unittest
from copy import deepcopy
from node_target_audit import audit,TYPES,EDGES
class AuditTest(unittest.TestCase):
 def fixture(self):return {'build':'7.4.2','nodes':[dict(id=k,label=k,tid=k,type='bg-vendor-icon-'+v,position=dict(x=i*200,y=0,width=56,height=76)) for i,(k,v) in enumerate(TYPES.items())],'system_nodes':[{'id':'system'}],'links':EDGES,'window':{'width':1508,'height':862}}
 def test_exact_graph(self):self.assertTrue(audit(self.fixture())['passed'])
 def test_wrong_output(self):
  g=self.fixture();g['links']=[s.replace('Output_Data-1','Output_Data-0') for s in g['links']];self.assertFalse(audit(g)['passed'])
 def test_native_service_slot(self):
  g=self.fixture();g['links']=[s.replace('Union|Input_Data-3','Union|Input_Data-2') for s in g['links']];self.assertFalse(audit(g)['passed'])
 def test_duplicate_or_extra(self):
  g=self.fixture();g['nodes'].append(deepcopy(g['nodes'][0]));self.assertFalse(audit(g)['passed'])
if __name__=='__main__':unittest.main()
