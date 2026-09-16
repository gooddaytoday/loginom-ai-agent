import copy
import json
from pathlib import Path
import unittest
from import_fields_evidence import verify_text_import_fields
from node_procedure_evidence import digest


class ImportFieldsEvidenceTests(unittest.TestCase):
    def setUp(self):
        fixture = json.loads((Path(__file__).resolve().parents[2] / 'client/test/fixtures/node-import-journal.json').read_text())
        expected = self.expected = copy.deepcopy(fixture['expected'])
        stop = next(e['step'] for e in fixture['events'] if e.get('action', {}).get('verb') == 'finish_wizard')
        states = [e['outcome']['output'] for e in fixture['events'] if e['phase'] == 'node_observation_completed' and e['step'] < stop]
        source = copy.deepcopy([s for s in states if s['wizard']['stage'] == 'text_import_file'][-1])
        formatted = copy.deepcopy([s for s in states if s['wizard']['stage'] == 'text_import_format'][-1])
        expected['columns'] = [dict(expected['columns'][0], name=f'Field{i}', label=f'Field{i}') for i in range(12)]
        self.events = []
        base = {k: fixture['events'][0][k] for k in ('session_id', 'runtime_revision', 'target', 'operation_id', 'internal_provenance')}
        self.op = base['operation_id']
        def entry(phase, step, **extra):
            return {**copy.deepcopy(base), 'phase': phase, 'step': step, 'internal_operation_id': f'{self.op}:n{step}', **extra}
        def observe(step, state):
            ready = {'policy': 'semantic_condition_v2', 'required_samples': 1, 'condition': 'test page', 'satisfied': True, 'elapsed_ms': 1, 'timeout_ms': 15000}
            value = {'status': 'SUCCEEDED', 'output': copy.deepcopy(state)}
            self.events.extend([entry('node_observation_sample', step, sample=0, outcome=value, readiness=ready),
                                entry('node_observation_completed', step, outcome=copy.deepcopy(value), readiness=ready)])
        source['ui']['elements'].append({'ref': 'ui-test-source', 'allowed_actions': ['fill']})
        observe(1, source)
        action = {'verb': 'fill', 'ref': 'ui-test-source', 'text': expected['source']['source_path']}
        self.events.extend([entry('node_step_prepared', 2, action=action, observation_sha256=digest(source), signature=digest([f'{self.op}:n2', action, source])),
                            entry('node_step_completed', 2, outcome={'status': 'SUCCEEDED', 'operation_id': f'{self.op}:n2', 'action_key': 'ui.act', 'cleanup_complete': True})])
        for step, offset in [(3, 0), (4, 8)]:
            page = copy.deepcopy(formatted)
            page['wizard']['import_columns'] = {'fields': [dict(c, status='observed', index=offset+i) for i, c in enumerate(expected['columns'][offset:offset+8])],
                'page': {'status': 'complete_definition_page', 'schema_id': 'schema-one', 'offset': offset, 'limit': 8, 'returned': min(8,12-offset), 'total_columns': 12, 'next_offset': 8 if offset == 0 else None}}
            observe(step, page)

    def verify(self):
        return verify_text_import_fields(self.events, self.op, self.expected)

    def change_last(self, change):
        for event in self.events:
            if event['step'] == 4:
                change(event['outcome']['output'])

    def test_complete_pages_pass_without_claiming_saved_or_executed(self):
        result = self.verify()
        self.assertTrue(result['passed'], result)
        self.assertEqual(result['columns_verified'], 12)
        self.assertFalse(result['settings_saved_verified'])
        self.assertFalse(result['execution_verified'])

    def test_missing_final_page_cannot_accept_eight_column_prefix(self):
        self.events = [e for e in self.events if e['step'] != 4]
        self.assertIn('complete_definition_sweep_missing', self.verify()['failures'])

    def test_mixed_schemas_cannot_be_combined(self):
        self.change_last(lambda s: s['wizard']['import_columns']['page'].update(schema_id='different'))
        self.assertIn('definition_identity_changed', self.verify()['failures'])

    def test_last_offscreen_field_must_match(self):
        self.change_last(lambda s: s['wizard']['import_columns']['fields'][-1].update(type='string'))
        self.assertIn('definition_values', self.verify()['failures'])

    def test_changed_format_on_last_page_fails(self):
        self.change_last(lambda s: s['wizard']['settings']['fields']['delimiter'].update(value='wrong'))
        self.assertIn('format_delimiter', self.verify()['failures'])

    def test_source_binding_is_not_an_applied_property(self):
        self.expected['columns'][0]['source_name'] = 'Field0'
        self.assertTrue(self.verify()['passed'])
        self.expected['columns'][0]['source_name'] = 'NeverObserved'
        self.assertIn('rename_source_identity_missing', self.verify()['failures'])

    def test_exclusion_requires_the_actual_configured_checkbox(self):
        self.expected['columns'][-1]['used'] = False
        self.assertIn('definition_values', self.verify()['failures'])
        self.change_last(lambda s: s['wizard']['import_columns']['fields'][-1].update(used=False))
        self.assertTrue(self.verify()['passed'])

    def test_success_summary_does_not_replace_missing_receipt(self):
        self.events = [e for e in self.events if e['phase'] != 'node_step_completed']
        self.events.append({'operation_id': self.op, 'status': 'SUCCEEDED'})
        self.assertFalse(self.verify()['passed'])


if __name__ == '__main__':
    unittest.main()
