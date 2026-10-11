"""Positive receipt binding doubles are NOT native evidence."""
import copy
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import cli_evidence as ce


class CliEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        root = Path(cls.directory.name)
        subprocess.run([os.environ.get('NODE_BINARY', 'node'), str(Path(__file__).with_name('cli_receipt_double.mjs')), str(root)], check=True)
        cls.fixture_events = [json.loads(l) for l in (root/'execution-events.jsonl').read_text().splitlines()]
        cls.fixture_request = json.loads((root/'request.json').read_text())
        cls.pins = json.loads((root/'pins.json').read_text())
        cls.expected = json.loads((root/'expected.json').read_text())
        cls.source = (root/'source.csv').read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def setUp(self):
        self.events = copy.deepcopy(self.fixture_events)
        self.request = copy.deepcopy(self.fixture_request)

    def binding(self, **changes):
        args = dict(events=self.events, request=self.request, pins=self.pins,
                    source_operation_id='source-import', source_bytes=self.source)
        args.update(changes)
        return ce.verify_bindings(**args)

    def audit(self):
        return ce.audit(self.events, self.request, self.pins, 'source-import', self.source,
                        self.expected, evidence_kind='offline_double')

    def checkpoint(self):
        return next(e['result'] for e in self.events if e.get('operation_id') == 'grouping' and e.get('phase') == 'node_checkpoint')

    def sync_read(self):
        next(e['receipt'] for e in self.events if e.get('operation_id') == 'grouping'
             and e.get('phase') == 'node_phase_completed' and e['receipt']['phase'] == 'read')['value'] = copy.deepcopy(self.checkpoint()['output'])

    def test_actual_product_serialization_binds_receipts_only(self):
        result = self.binding()
        self.assertTrue(result['passed'], result)
        self.assertEqual(result['status'], 'BINDING_ONLY')
        # Real CLI shell/journal + synthetic drivers contain no native samples.
        result = self.audit()
        self.assertFalse(result['passed'], result)
        self.assertEqual(result['status'], 'NOT_VERIFIED')
        self.assertEqual(result['native_acceptance'], 'NOT_VERIFIED')
        self.assertEqual(set(result['raw_audits']), {'source', 'configuration', 'output'})

    def test_positive_composition_double_is_explicit_and_requires_every_auditor(self):
        with patch.object(ce, 'verify_text_import_output', return_value=dict(passed=True, failures=[])) as source, \
             patch.object(ce, 'verify_grouping_configuration', return_value=dict(passed=True, failures=[])) as config, \
             patch.object(ce, 'verify_grouping_output', return_value=dict(passed=True, failures=[])) as output:
            result = self.audit()
            self.assertTrue(result['passed'], result)
            self.assertEqual(result['evidence_kind'], 'offline_double')
            self.assertEqual(result['native_acceptance'], 'NOT_VERIFIED')
            self.assertEqual(source.call_args.args[2], self.source)
            self.assertEqual(config.call_args.args[1], self.request)
            self.assertEqual(output.call_args.args[2], self.expected['columns'])
            for helper in (source, config, output):
                helper.return_value = dict(passed=False, failures=['missing_native'])
                self.assertFalse(self.audit()['passed'])
                helper.return_value = dict(passed=True, failures=[])

    def test_foreign_node_or_input_cannot_pass(self):
        self.checkpoint()['node']['node_id'] = 'foreign'
        self.assertFalse(self.binding()['passed'])
        self.setUp()
        self.request['inputs'][0]['source']['node_id'] = 'foreign'
        self.assertFalse(self.binding()['passed'])

    def test_stale_execution_and_incomplete_read_cannot_pass(self):
        for field, value in [('execution_id', 'old'), ('sample_complete', False), ('sample_rows', 0), ('fresh', False)]:
            self.setUp()
            self.checkpoint()['output']['ports'][0][field] = value
            self.sync_read()
            self.assertFalse(self.binding()['passed'], field)
        self.setUp()
        self.checkpoint()['execution']['execution_id'] = 'old'
        self.assertFalse(self.binding()['passed'])

    def test_source_bytes_or_source_receipt_substitution_cannot_pass(self):
        self.assertIn('original_source_bytes', self.binding(source_bytes=self.source+b'\n')['failures'])
        upstream = next(e for e in self.events if e.get('phase') == 'node_apply_prepared')
        upstream['request']['parameters']['source']['sha256'] = '0'*64
        self.assertFalse(self.binding()['passed'])

    def test_missing_grouping_and_foreign_transfer_are_not_verified(self):
        result = self.binding(events=[e for e in self.events if e.get('operation_id') != 'grouping'])
        self.assertEqual(result['status'], 'NOT_VERIFIED')
        self.assertIn('journal_operation_missing', result['failures'])
        self.events.append(dict(self.pins, operation_id='double-upload', phase='completed', session_id='foreign'))
        self.assertIn('source_transfer_journal_identity', self.binding()['failures'])

    def test_pins_request_phase_order_and_graph_are_bound(self):
        for kind in ['pins', 'request', 'phase', 'graph']:
            self.setUp()
            if kind == 'pins': self.events[-1]['manifest_sha256'] = 'foreign'
            if kind == 'request': self.request['parameters']['measures'].pop()
            if kind == 'phase': self.events.pop(-2)
            if kind == 'graph':
                next(e['target_state']['final_graph'] for e in self.events if e.get('phase') == 'node_target_checkpoint')['links'] = []
            self.assertFalse(self.binding()['passed'], kind)

    def test_schema_identity_and_complete_output_schema(self):
        self.checkpoint()['output']['ports'][0]['schema'][0]['label'] = 'Foreign label'
        self.sync_read()
        self.assertIn('complete_output_schema', self.audit()['failures'])
        self.setUp()
        next(e['receipt']['value']['native_mapping'] for e in self.events
             if e.get('operation_id') == 'grouping' and e.get('phase') == 'node_phase_completed'
             and e['receipt']['phase'] == 'input_mapping')['source_fields'][0]['name'] = 'Foreign'
        self.assertFalse(self.binding()['passed'])


if __name__ == '__main__':
    unittest.main()
