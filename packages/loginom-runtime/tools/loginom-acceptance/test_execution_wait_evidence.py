import copy
import unittest
from execution_wait_evidence import verify_execution_wait_pauses
from import_limits import import_step_budget, import_operation_step_budget


class ExecutionWaitEvidenceTests(unittest.TestCase):
    def fixture(self):
        node = dict(document_id='doc', workflow_id='flow', node_id='node')
        context = dict(node, verified=True, surface='graph')
        surface = dict(dom_epoch=dict(document='dom', revision=1), prepared_node_context=context, wizard=dict(status='absent'),
            node_processes=dict(verified=True, inventory_complete=True, show_completed=True, node_context=context, root_id='root',
                processes=[dict(parent_id=None, process_id='1', record_id='record', state='running', error=False,
                    progress_state=dict(verified=True, state='running', terminal=False))]),
            node_outputs=dict(verified=True, node_context=context, ports=[dict(index=0, port_guid='port', active=False)]))
        finish = dict(verified=True, execution_id='doc:root:1', continuation_surface=surface,
            execution_group=dict(node=node, execution_id='doc:root:1', root_id='root', group_id='1', group_record_id='record'))
        pending = dict(phase='execute', receipt_id='op:execute', deadline=5000, before_node=node, effect_possible=False)
        checkpoint = dict(pending, execution_id='doc:root:1', read_only=True, cleanup_complete=True)
        after = copy.deepcopy(surface); after['dom_epoch']['revision']=4
        after['node_processes']['processes'][0]['state']='completed';after['node_outputs']['ports'][0]['active']=True
        rows = [dict(phase='node_phase_completed', receipt=dict(phase='finish', value=finish)),
                dict(phase='node_phase_prepared', receipt=pending),
                dict(phase='node_observation_interrupted', condition='new node execution completed'),
                dict(phase='node_phase_paused', receipt=checkpoint), dict(phase='node_apply_resume_prepared'),
                dict(phase='node_continuation_checked', verified=True, boundary='execute_wait', surface=after),
                dict(phase='node_phase_prepared', receipt=copy.deepcopy(pending))]
        return [dict(operation_id='op', **row) for row in rows]

    def test_progress_change_retains_launch(self):
        result=verify_execution_wait_pauses(self.fixture(), {'operation_id':'op'})
        self.assertTrue(result['passed'],result); self.assertEqual(result['pauses'],1)

    def test_unknown_effect_and_changed_identity_cannot_pass(self):
        changes = [lambda e:e[3]['receipt'].update(read_only=False),
            lambda e:e[3]['receipt'].update(execution_id='other'),
            lambda e:e[2].update(phase='node_step_prepared'),
            lambda e:e[4].update(phase='missing_resume'),
            lambda e:e[5].update(verified=False),
            lambda e:e[5]['surface']['dom_epoch'].update(document='new'),
            lambda e:e[5]['surface']['node_outputs']['ports'][0].update(active=False),
            lambda e:e[5]['surface']['node_processes']['processes'][0].update(record_id='reused'),
            lambda e:e[5]['surface']['node_processes']['processes'].append(dict(parent_id=None,process_id='2',record_id='new')),
            lambda e:e[6]['receipt'].update(deadline=6000),
            lambda e:e[3]['receipt'].update(deadline=None)]
        for change in changes:
            with self.subTest(change=change):
                events=self.fixture();change(events)
                self.assertFalse(verify_execution_wait_pauses(events,{'operation_id':'op'})['passed'])

    def test_schema_bound_is_shared_by_original_and_empty_existing_patch(self):
        full=dict(target=dict(kind='new',type='imports.text'),parameters=dict(settings=dict(columns=[{}]*1000)),mappings=[])
        existing=dict(target=dict(kind='existing',type='imports.text'),parameters=dict(settings={}),mappings=[])
        self.assertEqual(import_step_budget(full),import_step_budget(existing))
        self.assertGreater(import_step_budget(full),5000)
        events=[dict(operation_id='op',phase='node_apply_prepared',request=full)]
        self.assertEqual(import_operation_step_budget(events,'op'),import_step_budget(full))
        self.assertEqual(import_operation_step_budget([],'standalone'),2048)
        full['parameters']['settings']['columns'].append({})
        with self.assertRaises(ValueError):import_step_budget(full)
