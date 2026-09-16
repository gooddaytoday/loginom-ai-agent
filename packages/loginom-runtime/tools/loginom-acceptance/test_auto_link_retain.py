"""Synthetic retain proof rejects recreated or unproven automatic edges."""
import copy
import unittest
from unittest.mock import patch
import audit

class RetainTest(unittest.TestCase):
    def fixture(self):
        outcome={'action_key':'node.add','operation_id':'add','status':'SUCCEEDED','output':{
            'auto_created_links':['MF;TF-1;Graph;Источник|Output_Data-0|Объединение|Input_Data-0'],'goal_verified':False}}
        return {'tools':[{'tool':audit.PREFIX+'dock_action_run','row':2,'result':outcome},
                         {'tool':audit.PREFIX+'dock_workspace_observe','row':4,'result':{'output':{}}}],
                'calls':[], 'events':[{'phase':'completed','operation_id':'add','outcome':copy.deepcopy(outcome)}]}
    def verify(self,data):
        checks=[]
        with patch.object(audit,'snapshot_graph',return_value={'links':['Источник|Output_Data[0]|Объединение|Input_Data[0]']}):
            audit.auto_link_proof('auto-link-retain',data,lambda name,ok:checks.append(bool(ok)))
        return all(checks)
    def test_retained_edge(self):self.assertTrue(self.verify(self.fixture()))
    def test_recreate_or_missing_journal_fails(self):
        data=self.fixture();data['calls']=[{'row':3,'tool':audit.PREFIX+'dock_action_run','arguments':{'action_key':'link.create'}}]
        self.assertFalse(self.verify(data))
        data=self.fixture();data['events']=[];self.assertFalse(self.verify(data))

if __name__=='__main__':unittest.main()
