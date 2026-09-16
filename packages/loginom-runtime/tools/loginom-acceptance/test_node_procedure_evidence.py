import copy
import json
from pathlib import Path
import unittest
from node_procedure_evidence import verify_text_import_roundtrip

FIXTURE = Path(__file__).resolve().parents[2] / 'client/test/fixtures/node-import-journal.json'


class NodeProcedureEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text())
        self.events = self.fixture['events']
        self.expected = self.fixture['expected']

    def verify(self):
        return verify_text_import_roundtrip(self.events, self.fixture['operation_id'], self.expected)

    def test_native_projection_passes_only_its_declared_local_obligations(self):
        result = self.verify()
        self.assertTrue(result['passed'], result)
        for key in ('journal_authentication_verified', 'hermes_acceptance_verified', 'package_persistence_verified', 'execution_verified'):
            self.assertFalse(result[key])

    def test_read_root_rediscovery_requires_a_strict_no_effect_refusal(self):
        first = next(r for r in self.events if r['phase'] == 'node_observation_sample')
        step = first['step']
        refresh = copy.deepcopy(first)
        refresh.update(phase='node_observation_root_refreshed', sample=0, refresh=1,
            outcome=dict(status='NOT_APPLIED', action_key='workspace.observe', phase='observing',
                         error=dict(code='UI_ROOT_STALE'), effect_possible=False, cleanup_complete=True))
        for row in self.events:
            if row.get('step') == step and row.get('phase') == 'node_observation_sample':
                row['sample'] += 1
        self.events.insert(self.events.index(first), refresh)
        self.assertTrue(self.verify()['passed'])
        for key, value in [('effect_possible', True), ('cleanup_complete', False), ('status', 'AMBIGUOUS')]:
            original = refresh['outcome'][key]
            refresh['outcome'][key] = value
            self.assertIn('unsafe_observation_root_refresh', self.verify()['failures'])
            refresh['outcome'][key] = original

    def test_wrong_expected_source_schema_and_format_are_rejected(self):
        for section, name, value in [('source', 'source_path', '/user/wrong.csv'), ('format', 'decimal_separator', ',')]:
            with self.subTest(section=section):
                previous = self.expected[section][name]
                self.expected[section][name] = value
                self.assertFalse(self.verify()['passed'])
                self.expected[section][name] = previous
        self.expected['columns'][3]['type'] = 'integer'
        self.assertIn('column_values', self.verify()['failures'])

    def test_lost_completed_receipt_cannot_pass(self):
        row = next(r for r in self.events if r['phase'] == 'node_step_completed')
        self.events.remove(row)
        self.assertFalse(self.verify()['passed'])

    def test_same_looking_foreign_document_cannot_pass(self):
        row = next(r for r in self.events if r['phase'] == 'node_observation_completed')
        row['outcome']['output']['dom_epoch']['document'] = 'different'
        self.assertIn('document_context_mismatch', self.verify()['failures'])

    def test_a_success_summary_cannot_replace_reopen(self):
        self.events = [r for r in self.events if r.get('action', {}).get('verb') != 'open_wizard']
        self.events.append({'operation_id': self.fixture['operation_id'], 'settings_readback_verified': True})
        self.assertIn('save_open_save_sequence', self.verify()['failures'])

    def test_unfinished_cleanup_and_foreign_receipt_fail(self):
        row = next(r for r in self.events if r['phase'] == 'node_step_completed')
        row['outcome']['cleanup_complete'] = False
        row['outcome']['operation_id'] = 'another-operation'
        result = self.verify()
        self.assertIn('incomplete_mutation', result['failures'])
        self.assertIn('receipt_identity_mismatch', result['failures'])

    def test_duplicate_step_and_changed_session_fail(self):
        self.events.insert(1, copy.deepcopy(self.events[0]))
        self.events[-1]['session_id'] = 'other-session'
        result = self.verify()
        self.assertIn('sample_sequence', result['failures'])
        self.assertIn('journal_session_mismatch', result['failures'])

    def test_readiness_requires_four_satisfied_samples_before_mutation(self):
        for row in self.events:
            if row.get('phase') in ('node_observation_sample', 'node_observation_completed'):
                row['readiness'] = {'condition': 'explicit test condition', 'satisfied': True,
                                    'timeout_ms': 15000, 'elapsed_ms': 600}
        self.assertTrue(self.verify()['passed'])
        row = next(r for r in self.events if r.get('phase') == 'node_observation_sample')
        row['readiness']['satisfied'] = False
        self.assertIn('readiness_not_confirmed', self.verify()['failures'])

    def test_semantic_policy_requires_readiness_and_target_identity(self):
        for row in self.events:
            if row.get('phase') in ('node_observation_sample', 'node_observation_completed'):
                row['readiness'] = {'policy': 'semantic_condition_v2', 'required_samples': 2,
                    'condition': 'target incarnation', 'satisfied': True, 'identity_sha256': 'a'*64,
                    'timeout_ms': 15000, 'elapsed_ms': 600}
        self.assertTrue(self.verify()['passed'])
        last = next(r for r in self.events if r.get('phase') == 'node_observation_completed')
        last['readiness']['identity_sha256'] = 'b'*64
        self.assertIn('target_identity_not_stable', self.verify()['failures'])


if __name__ == '__main__':
    unittest.main()

class NodeProcedureRefreshEvidenceTests(unittest.TestCase):
    def setUp(self):
        from node_procedure_evidence import digest
        import hashlib
        self.fixture = json.loads(FIXTURE.read_text())
        old = self.fixture['events']
        operation_id = self.fixture['operation_id']
        prepared = copy.deepcopy(next(e for e in old if e.get('phase') == 'node_step_prepared'))
        completed = copy.deepcopy(next(e for e in old if e.get('phase') == 'node_step_completed'))
        completed['outcome'].update(status='NOT_APPLIED', phase='preconditions', effect_possible=False,
            cleanup_complete=True, error={'code': 'UI_EPOCH_CHANGED'}, trace=[])
        auth = {k: prepared[k] for k in ('operation_id', 'session_id', 'runtime_revision', 'internal_provenance', 'step', 'internal_operation_id')}
        auth.update(phase='node_step_refresh_authorized', rejected_operation_id=prepared['internal_operation_id'], retry=1,
            condition='same field', effect_possible=False, binding_sha256='0'*64,
            intent_sha256=hashlib.sha256(json.dumps({k:v for k,v in prepared['action'].items() if k!='ref'},
                ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest())
        if 'target' in prepared:
            auth['target'] = prepared['target']
        first_reads = [copy.deepcopy(e) for e in old if e.get('step') == 1]
        for e in first_reads:
            for element in e.get('outcome', {}).get('output', {}).get('ui', {}).get('elements', []):
                if element.get('ref') == prepared['action']['ref']:
                    element.update(tid='source-field', identity={'anchor_tid':'source-field'}, label='Source')
        duplicate = copy.deepcopy(first_reads)
        for e in duplicate:
            e['step'] = 3
            e['internal_operation_id'] = f'{operation_id}:n3'
        rest = [copy.deepcopy(e) for e in old if e.get('step', 0) >= 2]
        for e in rest:
            e['step'] += 2
            e['internal_operation_id'] = f"{operation_id}:n{e['step']}"
            if e['phase'] == 'node_step_completed':
                e['outcome']['operation_id'] = e['internal_operation_id']
        self.events = first_reads + [prepared, completed, auth] + duplicate + rest
        state = None
        for e in self.events:
            if e['phase'] == 'node_observation_completed':
                state = e['outcome']['output']
            if e['phase'] == 'node_step_prepared':
                e['observation_sha256'] = digest(state)
                e['signature'] = digest([e['internal_operation_id'], e['action'], state])

    def verify(self):
        return verify_text_import_roundtrip(self.events, self.fixture['operation_id'], self.fixture['expected'])

    def test_strict_bound_refresh_preserves_roundtrip_audit(self):
        self.assertTrue(self.verify()['passed'], self.verify())

    def test_detached_root_refresh_requires_pre_gesture_no_effect_evidence(self):
        e = next(e for e in self.events if e['phase'] == 'node_step_completed')
        e['outcome'].update(phase='observing',error={'code':'UI_ROOT_STALE'})
        self.assertTrue(self.verify()['passed'],self.verify())
        e['outcome']['trace']=[{'event':'ui_gesture_applied'}]
        self.assertFalse(self.verify()['passed'])

    def test_unknown_effect_cannot_be_reclassified_as_a_refusal(self):
        e = next(e for e in self.events if e['phase'] == 'node_step_completed')
        e['outcome']['effect_possible'] = True
        self.assertFalse(self.verify()['passed'])

    def test_missing_refresh_authorization_is_rejected(self):
        self.events = [e for e in self.events if e['phase'] != 'node_step_refresh_authorized']
        self.assertFalse(self.verify()['passed'])

    def test_changed_retry_intent_is_rejected(self):
        e = next(e for e in self.events if e['phase'] == 'node_step_prepared' and e['step'] == 4)
        e['action']['text'] = '/user/another.csv'
        self.assertIn('unsafe_local_refresh', self.verify()['failures'])

    def test_changed_target_binding_is_rejected(self):
        ref = next(e['action']['ref'] for e in self.events if e['phase']=='node_step_prepared')
        for e in self.events:
            if e['step'] == 3:
                for element in e.get('outcome', {}).get('output', {}).get('ui', {}).get('elements', []):
                    if element.get('ref') == ref:
                        element['identity']['anchor_tid'] = 'foreign'
        self.assertFalse(self.verify()['passed'])

    def test_refusal_without_a_finished_retry_remains_incomplete(self):
        self.events = self.events[:next(i for i,e in enumerate(self.events) if e['phase']=='node_step_refresh_authorized')+1]
        self.assertFalse(self.verify()['passed'])

class ProcessGridRefreshBindingTests(unittest.TestCase):
    def test_grid_rows_may_load_but_native_grid_and_node_must_stay_identical(self):
        from node_procedure_evidence import refresh_control_binding
        node=dict(verified=True,document_id='doc',workflow_id='flow',node_id='node')
        state=dict(prepared_node_context=node,node_processes=dict(verified=True,root_id='root',node_context=node))
        control=dict(tid='ConsoleForm;ProgressForm;trpProgress;grd;tbl',identity=dict(anchor_tid='grid'),label='one row',process_grid=dict(panel_ref='panel',grid_id='grid'))
        action=dict(verb='right_click')
        baseline=refresh_control_binding(state,action,control)
        control['label']='two rows'
        self.assertEqual(baseline,refresh_control_binding(state,action,control))
        for change in ('grid','panel','root','node','unverified','verb','tid'):
            s=copy.deepcopy(state);c=copy.deepcopy(control);a=copy.deepcopy(action)
            if change=='grid':c['process_grid']['grid_id']='other'
            if change=='panel':c['process_grid']['panel_ref']='other'
            if change=='root':s['node_processes']['root_id']='other'
            if change=='node':s['prepared_node_context']=dict(node,node_id='other')
            if change=='unverified':s['node_processes']['verified']=False
            if change=='verb':a['verb']='click'
            if change=='tid':c['tid']='OtherGrid'
            self.assertNotEqual(baseline,refresh_control_binding(s,a,c),change)

class OutputColumnDialogTests(unittest.TestCase):
    def test_only_exact_bound_editor_is_accepted(self):
        from copy import deepcopy
        from node_procedure_evidence import bound_output_column_dialog
        selected=dict(status='observed',selected=True,name='Amount',row_ref='row')
        state=dict(wizard=dict(stage='output_mapping',output_columns=dict(fields=[selected]),column_parameters=dict(
            status='observed',portal_bound=True,root_tid='EditColumnDefForm',root_ref='editor',selected_column=selected,
            fields={k:dict(status='observed',truncated=False) for k in ['name','label','type_label','data_kind','usage']})),
            ui=dict(dialogs=[dict(ref='editor',identity=dict(anchor_tid='EditColumnDefForm'))]))
        self.assertTrue(bound_output_column_dialog(state))
        changes=[lambda s:s['wizard']['column_parameters'].update(portal_bound=False),
            lambda s:s['ui']['dialogs'][0].update(ref='other'),lambda s:s['ui']['dialogs'].append(dict(ref='other')),
            lambda s:s['wizard']['output_columns'].update(fields=[]),
            lambda s:s['wizard']['column_parameters']['fields']['name'].update(truncated=True)]
        for change in changes:
            candidate=deepcopy(state);change(candidate);self.assertFalse(bound_output_column_dialog(candidate))

class ReformDialogTests(unittest.TestCase):
    def test_global_editor_requires_exact_owner_selected_row_and_complete_fields(self):
        from copy import deepcopy
        from node_procedure_evidence import bound_reform_dialog
        row=dict(status='observed',selected=True,name='Amount',record_id='r1')
        state=dict(prepared_node_context=dict(verified=True,surface='wizard',tid='Wizard'),
            wizard=dict(stage='field_parameters',root_tid='Wizard',reform_columns=dict(fields=[row]),reform_parameters=dict(
                status='observed',portal_bound=True,root_tid='EditReformColumnDefForm',root_ref='editor',selected_column=row,
                fields={k:dict(status='observed',truncated=False,value=False if k=='excluded' else 'x')
                        for k in ['name','label','type_label','data_kind','usage','caching','excluded']})),
            ui=dict(dialogs=[dict(ref='editor',identity=dict(anchor_tid='EditReformColumnDefForm'))],masks=[]))
        self.assertTrue(bound_reform_dialog(state))
        for change in [lambda s:s['prepared_node_context'].update(tid='Other'),lambda s:s['wizard']['reform_parameters'].update(portal_bound=False),
            lambda s:s['wizard']['reform_columns'].update(fields=[]),lambda s:s['ui']['masks'].append({}),
            lambda s:s['ui']['dialogs'].append({}),lambda s:s['wizard']['reform_parameters']['fields']['caching'].update(truncated=True),
            lambda s:s['wizard']['reform_parameters']['fields']['excluded'].update(value='false')]:
            other=deepcopy(state);change(other);self.assertFalse(bound_reform_dialog(other))

class PreparedSelectionRefreshTests(unittest.TestCase):
    def test_body_and_label_rebind_only_within_same_native_node(self):
        from node_procedure_evidence import refresh_control_binding
        node=dict(verified=True,surface='graph',document_id='d',workflow_id='w',node_id='n',tid='MF;TF-1;Graph;Node')
        state=dict(prepared_node_context=node)
        def control(part):
            tid=node['tid']+(';Label;Label' if part=='label' else '')
            return dict(tid=tid,identity=dict(anchor_tid=tid,path=[]),graph_node=dict(part=part))
        base=refresh_control_binding(state,dict(verb='click'),control('body'))
        self.assertEqual(base,refresh_control_binding(state,dict(verb='click'),control('label')))
        for mutate in [lambda s,c:s['prepared_node_context'].update(node_id='other'),
                       lambda s,c:c.update(tid='other'),lambda s,c:c['graph_node'].update(part='settings'),
                       lambda s,c:c['identity'].update(path=[0]),lambda s,c:s['prepared_node_context'].update(verified=False)]:
            s=copy.deepcopy(state);c=control('label');mutate(s,c)
            self.assertNotEqual(base,refresh_control_binding(s,dict(verb='click'),c))
