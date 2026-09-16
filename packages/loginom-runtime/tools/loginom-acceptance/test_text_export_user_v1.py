import copy,unittest
from user_result_evidence import project_node,normalize_user_evidence
from evidence import PREFIX
class ExpectedRejectProjectionTests(unittest.TestCase):
    def evidence(self):
        error={'code':'NODE_APPLY_STOPPED','message':'Export destination exists; reject policy preserved it'}
        outcome={'status':'FAILED','cleanup_complete':True,'error':error,'output':{'node':{'document_id':'d','workflow_id':'w','node_id':'n'},'output':{'ports':[]},'warnings':[]}}
        snapshot={'operation_id':'reject','state':'settled','attempt':1,'outcome':outcome,'error':None}
        common=dict(session_id='s',tool_call_id='call',tool=PREFIX+'dock_node_apply')
        return dict(calls=[dict(**common,row=1,arguments={'operation_id':'reject','workflow_ref':{'workflow_id':'w','prefix':'p'}})],tools=[dict(**common,row=2,result=copy.deepcopy(project_node(snapshot)))],events=[{'phase':'node_phase_refused','operation_id':'reject','receipt':{'verification':'text_export_conflict_rejected','cleanup_complete':True}},{'phase':'completed','operation_id':'reject','action_key':'node.apply','outcome':outcome}])
    def test_expected_native_refusal_projects_without_mutating_wire(self):
        e=self.evidence();old=copy.deepcopy(e);n,r=normalize_user_evidence(e);self.assertTrue(r['passed'],r);self.assertEqual(e,old);self.assertEqual(n['tools'][0]['result']['outcome'],e['events'][1]['outcome'])
    def test_unknown_errors_unproven_refusal_execution_and_tampered_error_fail(self):
        variants=[lambda e:e['events'].pop(0),lambda e:e['events'].append({'operation_id':'reject','phase':'node_execution_prepared'}),lambda e:e['tools'][0]['result']['error'].update(code='OTHER'),lambda e:e['tools'][0]['result']['error'].update(message='forged'),lambda e:e['events'][0]['receipt'].update(cleanup_complete=False)]
        for change in variants:
            e=self.evidence();change(e);self.assertFalse(normalize_user_evidence(e)[1]['passed'])
