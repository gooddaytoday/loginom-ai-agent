"""Synthetic geometry proof; not live evidence."""
import copy
import unittest
import audit
from test_lost_receipt import lost_fixture


def fixture():
    request,data,prompt=lost_fixture();request['fault_injection']='position'
    geometry={'svg':{'x':100,'y':100}}
    before={'event':'operator_fault_before','expected_geometry':geometry,'graph':{'nodes':[]},
            'expected_point':{'x':100,'y':100},'actual_drop_point':{'x':124,'y':100}}
    shifted={'event':'operator_fault_injected','expected_geometry':geometry,'actual_svg':{'x':124,'y':100},
             'graph':{'nodes':[{'label':'Источник'}],'links':[]}}
    actual=copy.deepcopy(data['operator_fault_receipt']['actual_browser_reply'])
    actual.update(status='AMBIGUOUS',error={'message':'Created node position differs'},trace=[before,shifted])
    data['tools'][1]['result']=actual
    data['calls'][1]['arguments']['parameters']['expected_label']='Источник'
    data['operator_fault_receipt'].update(variant='position',fault='shifted_node_drop_position',
        actual_browser_reply=actual,injected_code_sha256='d'*64)
    data['events'][0]['checkpoint']={'geometry':geometry,'graph':{'nodes':[]}}
    data['events'][1].update(phase='completed',outcome=actual)
    data['events'].append({**data['events'][1],'phase':'reconciled',
                           'outcome':copy.deepcopy(data['tools'][2]['result']['output']['outcome'])})
    return request,data,prompt

class PositionTest(unittest.TestCase):
    def test_reconciled_position(self):
        report=audit.audit(*fixture());self.assertTrue(report['all_assertions_passed'],report)
    def test_wrong_shift_fabrication_missing_resolution_fail(self):
        for mutate in [lambda d:d['operator_fault_receipt'].update(receipt_fabricated=True),
                       lambda d:d['operator_fault_receipt']['actual_browser_reply']['trace'][1]['actual_svg'].update(x=125),
                       lambda d:d['events'].pop(),
                       lambda d:d['calls'].append(copy.deepcopy(d['calls'][1]))]:
            request,data,prompt=fixture();mutate(data)
            self.assertFalse(audit.audit(request,data,prompt)['all_assertions_passed'])
if __name__=='__main__':unittest.main()
