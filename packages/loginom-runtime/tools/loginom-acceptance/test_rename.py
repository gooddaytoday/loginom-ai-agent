"""Synthetic rename recovery proof; never live acceptance evidence."""
import copy
import unittest
import audit
from test_lost_receipt import lost_fixture


def fixture():
    request, data, prompt = lost_fixture()
    request['fault_injection'] = 'rename'
    actual = copy.deepcopy(data['operator_fault_receipt']['actual_browser_reply'])
    actual.update(status='AMBIGUOUS', trace=[{'event': event} for event in
                  ['mouse_released', 'component_dragged', 'operator_fault_injected']])
    data['tools'][1]['result'] = actual
    fault = data['operator_fault_receipt']
    fault.update(variant='rename', fault='rename_interrupted_after_real_node_drag',
                 actual_browser_reply=actual, injected_code_sha256='d' * 64)
    resolved = data['tools'][2]
    data['events'][1].update(phase='completed', outcome=copy.deepcopy(actual))
    data['events'].insert(2, {**copy.deepcopy(data['events'][1]), 'phase': 'reconciled',
                             'outcome': copy.deepcopy(resolved['result']['output']['outcome'])})
    for t in data['calls'] + data['tools']:
        if t['row'] > 4:
            t['row'] += 2
    common = {'tool': audit.PREFIX + 'dock_ui_action', 'tool_call_id': 'repair', 'session_id': 'hermes-fixture'}
    data['calls'].append({**common, 'row': 5, 'arguments': {'recovery_operation_id': 'source-op'}})
    data['tools'].append({**common, 'row': 6, 'result': {'status': 'SUCCEEDED', 'action_key': 'ui.act'}})
    return request, data, prompt


class RenameTest(unittest.TestCase):
    def test_actual_failure_bound_repair_and_reconciliation(self):
        report = audit.audit(*fixture())
        self.assertTrue(report['all_assertions_passed'], report)

    def test_bound_ui_reconciliation_can_replace_redundant_inspect(self):
        request,data,prompt=fixture()
        t=data['tools'][2];c=data['calls'][2]
        recovery=copy.deepcopy(t['result']['output'])
        t['tool']=c['tool']=audit.PREFIX+'dock_ui_action'
        c['arguments']={'recovery_operation_id':'source-op'}
        t['result']={'status':'SUCCEEDED','action_key':'ui.act','output':{'recovery':recovery}}
        self.assertTrue(audit.audit(request,data,prompt)['all_assertions_passed'])
        c['arguments']['recovery_operation_id']='other'
        self.assertFalse(audit.audit(request,data,prompt)['all_assertions_passed'])

    def test_missing_reconciliation_does_not_skip_saved_graph_checks(self):
        request, data, prompt = fixture()
        data['calls'][1]['arguments']['parameters']['expected_label'] = 'Источник'
        data['tools'][2]['result']['output']['state'] = 'pending'
        report = audit.audit(request, data, prompt)
        checks = {c['name']: c['passed'] for c in report['assertions']}
        self.assertFalse(report['all_assertions_passed'])
        self.assertFalse(checks['rename_result_verified_after_ui_repair'])
        self.assertTrue(checks['exact_goal_graph_before_and_after'])
        self.assertNotIn('evidence_structure_and_required_proofs', checks)

    def test_missing_fabricated_and_unbound_proof_fail(self):
        for mutate in [
            lambda d: d['operator_fault_receipt'].update(receipt_fabricated=True),
            lambda d: d['operator_fault_receipt']['actual_browser_reply'].update(cleanup_complete=False),
            lambda d: d['events'].pop(2),
            lambda d: d['calls'][-1]['arguments'].update(recovery_operation_id='other'),
            lambda d: d['operator_fault_receipt']['actual_browser_reply']['trace'].reverse(),
        ]:
            with self.subTest(mutate=mutate):
                request, data, prompt = fixture()
                mutate(data)
                self.assertFalse(audit.audit(request, data, prompt)['all_assertions_passed'])


if __name__ == '__main__':
    unittest.main()
