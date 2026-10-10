import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('transcript-audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.receipt = {'operation_id': 'save', 'action_key': 'package.save_checkpoint', 'status': 'SUCCEEDED', 'output': {'package_ref': {'path': '/own/result.lgp'}, 'save_completed': True}}
        self.state = {'kind': 'dock_saved_package_state', 'save_operation_id': 'save', 'package_path': '/own/result.lgp'}
        self.verification = {'kind': 'dock_outcome_verification', 'operation_id': 'save', 'action_key': 'package.save_checkpoint'}

    def test_multiple_json_and_text_blocks(self):
        text = '\n\n'.join(map(json.dumps, [self.receipt, self.state, self.verification]))
        self.assertEqual(audit.unwrap(text), self.receipt)
        self.assertEqual(audit.unwrap([{'type': 'text', 'text': json.dumps(x)} for x in [self.receipt, self.state]]), self.receipt)

    def test_ambiguous_or_unbound_receipts_rejected(self):
        for tail in [self.receipt, {**self.state, 'save_operation_id': 'other'}, {**self.state, 'package_path': '/other/file'}, {**self.verification, 'action_key': 'other'}, {'kind': 'unknown'}]:
            with self.subTest(tail=tail), self.assertRaises(ValueError):
                audit.unwrap(json.dumps(self.receipt) + '\n' + json.dumps(tail))
        with self.assertRaises(ValueError):
            audit.unwrap('\n'.join(map(json.dumps, [self.receipt, self.state, self.state])))
        with self.assertRaises(ValueError):
            audit.unwrap(json.dumps(self.receipt) + '\n{')

    def test_annotations_do_not_promote_failed_save(self):
        receipt = {**self.receipt, 'status': 'NOT_APPLIED'}
        self.assertEqual(audit.unwrap(json.dumps(receipt) + '\n' + json.dumps(self.state))['status'], 'NOT_APPLIED')


class ChronologyTests(unittest.TestCase):
    def call(self, parameters=None, mappings=None, status='SUCCEEDED', exact=False):
        return {'input': {'parameters': parameters, 'mappings': mappings}, 'result': {'status': status, 'cleanup_complete': True, 'exact': exact}}

    def matches(self, calls):
        return audit.mode_sequence_matches(calls, 'add', lambda c: c['result'], lambda r, w: r['exact'], {})

    def test_label_repair_then_fresh_exact_execution(self):
        self.assertTrue(self.matches([self.call({'output_mode': 'add'}), self.call(mappings=[{'direction': 'output', 'port': 0, 'fields': [{'source': {'kind': 'configured_field', 'name': 'B_Replace'}, 'label': 'B Замена'}]}], exact=True)]))

    def test_changed_rules_mode_failed_apply_and_earlier_output_rejected(self):
        for calls in [
            [self.call(exact=True), self.call({'output_mode': 'add'})],
            [self.call({'output_mode': 'add'}), self.call({'rules': ['new']}, exact=True)],
            [self.call({'output_mode': 'add'}), self.call(mappings=[{'direction':'input'}], exact=True)],
            [self.call({'output_mode': 'add'}), self.call({'output_mode': 'replace'}, exact=True)],
            [self.call({'output_mode': 'add'}), self.call(status='AMBIGUOUS'), self.call(exact=True)],
        ]:
            with self.subTest(calls=calls):
                self.assertFalse(self.matches(calls))


if __name__ == '__main__':
    unittest.main()
