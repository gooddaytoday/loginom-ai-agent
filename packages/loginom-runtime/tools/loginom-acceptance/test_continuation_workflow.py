import copy
import unittest
from import_continuation_evidence import verified_phase_order


class ContinuationWorkflowTests(unittest.TestCase):
    def setUp(self):
        flow=dict(workflow_id='flow',tab_tid='tab')
        self.request=dict(operation_id='op',document_id='doc',workflow_ref=flow)
        value=dict(status='SUCCEEDED',verified=True,cleanup_complete=True,effect_possible=False,
            document_id='doc',workflow_ref=flow,trace=[dict(event=event,document_id='doc',workflow_ref=flow,tab_tid='tab',active=True)
                for event in ['prepared_workflow_observed','prepared_workflow_active']])
        self.events=[dict(operation_id='op',phase='node_phase_prepared',receipt=dict(phase='workflow',receipt_id='op:workflow')),
            dict(operation_id='op',phase='node_phase_completed',receipt=dict(phase='workflow',receipt_id='op:workflow',status='verified',effect_possible=False,value=value))]

    def test_legacy_and_verified_current_order(self):
        base=['source','target','input_mapping','open','configure'];errors=[]
        self.assertEqual(verified_phase_order([],self.request,base,errors),base)
        self.assertEqual(verified_phase_order(self.events,self.request,base,errors),['source','workflow',*base[1:]])
        self.assertEqual(errors,[])

    def test_phase_name_alone_cannot_attest_workflow(self):
        for name in ['foreign_document','unverified','missing_end','wrong_tab','duplicate_end']:
            with self.subTest(name=name):
                rows=copy.deepcopy(self.events);value=rows[-1]['receipt']['value']
                if name=='foreign_document':value['document_id']='foreign'
                elif name=='unverified':value['verified']=False
                elif name=='missing_end':rows.pop()
                elif name=='wrong_tab':value['trace'][-1]['tab_tid']='foreign'
                else:rows.append(copy.deepcopy(rows[-1]))
                errors=[];verified_phase_order(rows,self.request,['source','target'],errors)
                self.assertTrue(errors)


if __name__=='__main__':unittest.main()
