import copy
import unittest
from import_execution_evidence import verify_execution_observations


class ExecutionEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.node = dict(verified=True, document_id='doc', workflow_id='flow', node_id='node')
        def row(id, parent=None):
            return dict(process_id=id, record_id='r'+id, parent_id=parent, state='completed',
                        error=False, children_loaded=True, rendered=True, selected=parent is not None)
        def state(rows):
            return dict(node_processes=dict(verified=True, inventory_complete=True, show_completed=True,
                                           root_id='root', node_context=copy.deepcopy(self.node), processes=rows))
        self.observations = [(1,state([])),(3,state([row('1'),row('1.1','1')])),(5,state([row('1'),row('1.1','1')]))]
        self.observations[1][1]['ui'] = dict(elements=[dict(ref='ui-go',process_menu=dict(action='mniShowNodeToProcess',process=dict(record_id='r1.1')))])
        self.observations[2][1]['node_outputs'] = dict(verified=True,node_selected=True,surface='graph',node_context=copy.deepcopy(self.node))
        self.mutations = [(2,dict(verb='execute_wizard'),dict(trace=[dict(event='wizard_execute_graph_verified',launch_gesture_verified=True,execution_completed=False)])),
                          (4,dict(verb='show_process_node',ref='ui-go'),{})]

    def audit(self):
        return verify_execution_observations(self.observations,self.mutations,self.node)

    def test_graph_launch_requires_selected_native_node_and_exact_gesture(self):
        s=self.observations[0][1]
        s.update(wizard=dict(status='absent'),prepared_node_context=self.node,
            node_outputs=dict(node_selected=True),ui=dict(elements=[dict(ref='launch',graph_execution=dict(node_id='node',source='native_selected_graph_node'))]))
        outcome=dict(status='SUCCEEDED',cleanup_complete=True,output=dict(gesture_applied=True),trace=[
            dict(event='ui_preconditions_verified',verb='execute_graph_node',refs=['launch']),
            dict(event='ui_gesture_applied',verb='execute_graph_node')])
        self.mutations[0]=(2,dict(verb='execute_graph_node',ref='launch'),outcome)
        audit=lambda:verify_execution_observations(self.observations,self.mutations,self.node,launch_mode='graph')
        self.assertTrue(audit()['passed'])
        self.assertFalse(self.audit()['passed'])
        s['ui']['elements'][0]['graph_execution']['node_id']='foreign'
        self.assertFalse(audit()['passed'])
        s['ui']['elements'][0]['graph_execution']['node_id']='node'
        outcome['trace'].pop()
        self.assertFalse(audit()['passed'])

    def test_complete_chain(self):
        r=self.audit();self.assertTrue(r['passed'],r);self.assertEqual(r['execution_id'],'doc:root:1')

    def test_stale_or_foreign_or_incomplete_evidence(self):
        original=copy.deepcopy(self.observations)
        changes=[lambda s:s['node_processes'].update(root_id='other'),
                 lambda s:s['node_processes'].update(show_completed=False),
                 lambda s:s['node_processes']['processes'][1].update(state='pending_or_failed'),
                 lambda s:s['node_processes']['processes'][1].update(error=True),
                 lambda s:s['node_processes']['processes'][1].update(selected=False),
                 lambda s:s['node_processes']['processes'][1].update(record_id='foreign'),
                 lambda s:s['node_outputs'].update(node_selected=False),
                 lambda s:s['node_outputs']['node_context'].update(node_id='foreign')]
        for change in changes:
            self.observations=copy.deepcopy(original);change(self.observations[-1][1]);self.assertFalse(self.audit()['passed'])

    def test_wrong_menu_cannot_claim_owner(self):
        self.observations[1][1]['ui']['elements'][0]['process_menu']['process']['record_id']='other'
        self.assertIn('owner_menu_binding',self.audit()['failures'])

    def test_missing_baseline(self):
        self.observations.pop(0);self.assertFalse(self.audit()['passed'])

    def test_two_launch_gestures(self):
        self.mutations.append(copy.deepcopy(self.mutations[0]));self.assertFalse(self.audit()['passed'])

    def test_concurrent_new_groups(self):
        self.observations[1][1]['node_processes']['processes'].append(dict(process_id='2',record_id='r2',parent_id=None))
        self.assertIn('ambiguous_new_execution',self.audit()['failures'])

    def test_pending_history_before_first_new_group_is_allowed(self):
        self.observations.insert(1,(2.5,copy.deepcopy(self.observations[0][1])))
        self.assertTrue(self.audit()['passed'])

    def test_disappearing_identified_group_is_rejected(self):
        self.observations.insert(2,(3.5,copy.deepcopy(self.observations[0][1])))
        self.assertFalse(self.audit()['passed'])

    def test_no_effect_summary_does_not_prove_launch(self):
        self.mutations[0][2]['trace'][0]['launch_gesture_verified']=False;self.assertFalse(self.audit()['passed'])


if __name__ == '__main__':
    unittest.main()

class ProcessScrollEvidenceTests(unittest.TestCase):
    def test_bound_scroll_and_corrupted_owner_or_movement(self):
        from copy import deepcopy
        from import_execution_evidence import verify_process_scroll_observations
        owner=dict(tid='ConsoleForm;ProgressForm;trpProgress;treepanel;tree',ref='scroll',process_grid=dict(grid_id='tree'),
                   scroll=dict(ref='scroll',top=0,max_top=87),allowed_actions=['scroll'])
        before=dict(ui=dict(elements=[owner]),node_processes=dict(root_id='root'))
        after=deepcopy(before);after['ui']['elements'][0]['scroll']['top']=87
        observations=[(1,before),(3,after)]
        mutations=[(2,dict(verb='scroll',ref='scroll',delta_y=87),dict(trace=[dict(event='ui_scroll_applied',owner_ref='scroll',**{'from':0,'to':87})]))]
        self.assertEqual(verify_process_scroll_observations(observations,mutations),[])
        for case in ('owner','delta','history','after','receipt','foreign_grid'):
            os,ms=deepcopy(observations),deepcopy(mutations)
            if case=='owner':os[0][1]['ui']['elements'][0]['scroll']['ref']='other'
            if case=='delta':ms[0][1]['delta_y']=1001
            if case=='history':os[1][1]['node_processes']['root_id']='other'
            if case=='after':os[1][1]['ui']['elements'][0]['scroll']['top']=0
            if case=='receipt':ms[0][2]['trace'][0]['to']=0
            if case=='foreign_grid':os[0][1]['ui']['elements'][0]['tid']='OtherGrid'
            self.assertTrue(verify_process_scroll_observations(os,ms),case)
