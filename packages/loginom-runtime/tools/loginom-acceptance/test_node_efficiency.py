import copy
import unittest
from node_efficiency import node_efficiency


class NodeEfficiencyTests(unittest.TestCase):
    def setUp(self):
        self.evidence = dict(process=dict(usage=dict(input_tokens=100, output_tokens=20, total_tokens=120,
            cache_read_tokens=80, reasoning_tokens=5, api_calls=2)), calls=[{'tool': 'dock_node_apply'}, {'tool': 'dock_node_wait'}],
            events=[dict(operation_id='node', phase='node_phase_prepared', receipt=dict(phase='configure', receipt_id='node:configure'), recorded_at='2026-09-08T14:00:00.000Z'),
                    dict(operation_id='node', phase='node_phase_completed', receipt=dict(phase='configure', receipt_id='node:configure'), recorded_at='2026-09-08T17:00:01.250+03:00')])

    def test_actual_intervals_and_calls_without_double_counting_cache(self):
        result = node_efficiency(self.evidence)
        self.assertTrue(result['usage_complete']); self.assertTrue(result['phases_complete'])
        self.assertEqual(result['usage_counts']['total_tokens'], 120)
        self.assertEqual(result['public_calls'], 2)
        self.assertEqual(result['node_phase_intervals'][0]['duration_ms'], 1250)

    def test_missing_boolean_negative_and_text_tokens_are_unknown(self):
        for value in (None, True, -1, '12', 1.5):
            self.evidence['process']['usage']['input_tokens'] = value
            result = node_efficiency(self.evidence)
            self.assertFalse(result['usage_complete']); self.assertIsNone(result['usage_counts']['input_tokens'])
        self.evidence['process']['usage']['input_tokens'] = 0
        self.assertTrue(node_efficiency(self.evidence)['usage_complete'])

    def test_missing_duplicate_reversed_and_naive_intervals_fail_measurement(self):
        for mode in ('missing', 'duplicate', 'reversed', 'naive'):
            e = copy.deepcopy(self.evidence)
            if mode == 'missing': e['events'].pop()
            if mode == 'duplicate': e['events'].append(copy.deepcopy(e['events'][-1]))
            if mode == 'reversed': e['events'][-1]['recorded_at'] = '2026-09-08T13:00:00Z'
            if mode == 'naive': e['events'][-1]['recorded_at'] = '2026-09-08T14:00:01'
            result = node_efficiency(e)
            self.assertFalse(result['phases_complete']); self.assertIsNone(result['node_phase_intervals'][0]['duration_ms'])

    def test_operator_run_does_not_invent_model_usage(self):
        self.evidence.pop('process')
        result = node_efficiency(self.evidence)
        self.assertFalse(result['usage_complete']); self.assertIsNone(result['model_api_calls'])
        self.assertTrue(result['phases_complete'])

    def test_outer_auditor_recomputes_measurement_and_rejects_missing_or_changed_report(self):
        from node_apply_acceptance import audit
        request = dict(run_id='20260908-172400-1234abcd', storage_directory='/user/dock-p3')
        self.evidence['efficiency'] = node_efficiency(self.evidence)
        # Other goal gates intentionally fail in this small measurement fixture.
        self.assertTrue(audit(request, self.evidence, '', b'')['checks']['efficiency']['passed'])
        self.evidence['efficiency']['public_calls'] = 0
        self.assertFalse(audit(request, self.evidence, '', b'')['checks']['efficiency']['passed'])
        self.evidence.pop('efficiency')
        self.assertFalse(audit(request, self.evidence, '', b'')['checks']['efficiency']['passed'])

    def test_export_retains_only_typed_usage_counters_in_exact_report_paths(self):
        from evidence import clean
        self.evidence['efficiency'] = node_efficiency(self.evidence)
        exported = clean(self.evidence, ['private-credential'])
        self.assertEqual(exported['efficiency'], self.evidence['efficiency'])
        self.assertEqual(exported['process']['usage']['input_tokens'], 100)
        self.assertEqual(clean({'input_tokens': 100}, [])['input_tokens'], '[redacted]')
        for unsafe in ('private-credential', True, {'access_token': 'private-credential'}, ['private-credential']):
            e = {'process': {'usage': {'input_tokens': unsafe, 'access_token': 'private-credential'}}}
            safe = clean(e, ['private-credential'])
            self.assertEqual(safe['process']['usage']['input_tokens'], '[redacted]')
            self.assertEqual(safe['process']['usage']['access_token'], '[redacted]')


if __name__ == '__main__':
    unittest.main()
