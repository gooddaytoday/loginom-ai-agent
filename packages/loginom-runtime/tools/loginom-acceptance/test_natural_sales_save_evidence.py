import copy
import json
import unittest
from natural_sales_save_evidence import verify_checkpoint_schedule
import test_saved_import_evidence as fixtures


class NaturalSaveEvidenceTests(unittest.TestCase):
    def setUp(self):
        final = fixtures.SavedPackageTransitionTests(); final.setUp()
        middle = fixtures.IntermediateSavedPackageTests(); middle.setUp()
        self.seed = copy.deepcopy(final.seed)
        self.seed['target'].update(kind='new', type='imports.text')
        self.seed['inputs'] = []
        self.requests = [self.seed]
        self.events = [dict(phase='node_apply_prepared', request=self.seed), copy.deepcopy(final.events[0])]
        self.path = final.path
        for i in range(4):
            pair = copy.deepcopy((final if i == 3 else middle).events[1:3])
            for e in pair:
                e['operation_id'] = 'save-'+str(i)
                e['action_revision'] = '2'
                e['parameters']['conflict_policy'] = 'fail' if i == 0 else 'replace'
                e['checkpoint']['package_identity']['path'] = '' if i == 0 else self.path
                if 'outcome' in e:
                    e['outcome']['operation_id'] = e['operation_id']
                    if i:
                        e['outcome']['trace'][1:1] = [dict(event='save_conflict_observed', path=self.path), dict(event='overwrite_confirmed')]
            self.events.extend(pair)
        self.events = json.loads(json.dumps(self.events))
        self.revisions = {'package.save_checkpoint': '2', 'package.save_as': '2'}

    def audit(self):
        return verify_checkpoint_schedule(self.events, self.requests, ['/user/dock-p3'], self.revisions)

    def test_owned_same_path_including_final_overwrite(self):
        result = self.audit()
        self.assertTrue(result['passed'], result)
        self.assertEqual((result['saves'], result['boundaries']), (4, 1))

    def test_user_policy_accepts_one_final_checkpoint_without_reopen(self):
        events = copy.deepcopy(self.events[:4])
        events[-1]['outcome']['action_revision'] = '2'
        result = verify_checkpoint_schedule(events, self.requests, ['/user/dock-p3'], self.revisions, policy='user')
        self.assertTrue(result['passed'], result)
        self.assertEqual(result['saves'], 1)
        self.assertFalse(verify_checkpoint_schedule(self.events, self.requests, ['/user/dock-p3'], self.revisions, policy='user')['passed'])
        events[-1]['outcome']['output']['reopened'] = True
        self.assertFalse(verify_checkpoint_schedule(events, self.requests, ['/user/dock-p3'], self.revisions, policy='user')['passed'])

    def test_user_policy_preserves_explicitly_requested_reopening(self):
        events = copy.deepcopy(self.events[:2] + self.events[-2:])
        events[-1]['outcome']['action_revision'] = '2'
        for event in events[2:]:
            event['parameters']['conflict_policy'] = 'fail'
            event['checkpoint']['package_identity']['path'] = ''
            if 'outcome' in event:
                event['outcome']['trace'] = [t for t in event['outcome']['trace'] if t.get('event') not in ('save_conflict_observed', 'overwrite_confirmed')]
        result = verify_checkpoint_schedule(events, self.requests, ['/user/dock-p3'], self.revisions, policy='user', reopen_requested=True)
        self.assertTrue(result['passed'], result)
        self.assertFalse(verify_checkpoint_schedule(events, self.requests, ['/user/dock-p3'], self.revisions, policy='user')['passed'])

    def add_declined_conflict(self):
        pair = copy.deepcopy(self.events[2:4]); path = '/user/dock-p3/existing.lgp'
        for e in pair:
            e['operation_id'] = 'declined-name'; e['parameters']['path'] = path; e['checkpoint']['path'] = path
        pair[1]['outcome'] = dict(status='NOT_APPLIED', action_key='package.save_checkpoint', action_revision='2',
            operation_id='declined-name', phase='applying', effect_possible=True, cleanup_complete=True, error=None,
            output=dict(path=path, conflict=True), trace=[
                dict(event='action_started', capability='package.save_checkpoint.v1', mode='apply'),
                dict(event='preconditions_verified', active_tab=pair[0]['checkpoint']['workflow_ref']['prefix']),
                dict(event='save_requested', path=path), dict(event='save_conflict_observed', path=path),
                dict(event='conflict_rejected'), dict(event='cleanup_completed', resource='transient_dialog')])
        self.events[2:2] = pair

    def test_declined_existing_name_does_not_count_as_persistence(self):
        self.add_declined_conflict(); result = self.audit()
        self.assertTrue(result['passed'], result)
        self.assertEqual(result['saves'], 4)
        self.assertEqual(result['declined_conflicts'], ['declined-name'])
        del self.events[4:6]
        self.assertFalse(self.audit()['passed'])

    def test_declined_conflict_requires_bound_receipts_and_complete_cancellation(self):
        mutations = [
            lambda es: es[3]['outcome'].update(cleanup_complete=False),
            lambda es: es[3]['outcome']['trace'].insert(4, dict(event='overwrite_confirmed')),
            lambda es: es[3]['outcome']['trace'].pop(),
            lambda es: es[3]['outcome']['trace'][3].update(path='/foreign.lgp'),
            lambda es: es[3]['outcome']['output'].update(reopened=True),
            lambda es: es[3]['outcome'].update(action_revision='unverified'),
            lambda es: es[3].update(session_id='foreign'),
            lambda es: es[2]['parameters'].update(conflict_policy='replace'),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                self.setUp(); self.add_declined_conflict(); mutate(self.events)
                self.assertFalse(self.audit()['passed'])

    def test_missing_or_duplicate_receipts_and_wrong_sequence(self):
        original = copy.deepcopy(self.events)
        for index in range(2, len(original)):
            for duplicate in (False, True):
                with self.subTest(index=index, duplicate=duplicate):
                    self.events = copy.deepcopy(original)
                    if duplicate: self.events.insert(index, copy.deepcopy(self.events[index]))
                    else: self.events.pop(index)
                    self.assertFalse(self.audit()['passed'])

    def test_wrong_path_graph_revision_cleanup_and_trace_rejected(self):
        mutations = [
            lambda es: es[2]['parameters'].update(conflict_policy='replace'),
            lambda es: es[3]['outcome'].update(cleanup_complete=False),
            lambda es: es[3]['outcome']['trace'].reverse(),
            lambda es: es[4]['checkpoint']['package_identity'].update(path='/foreign.lgp'),
            lambda es: es[5]['outcome']['trace'][1].update(path='/foreign.lgp'),
            lambda es: es[5]['outcome']['trace'].pop(2),
            lambda es: es[5].update(runtime_revision='other'),
            lambda es: es[6]['checkpoint']['graph']['nodes'].append('unknown'),
            lambda es: es[7].update(action_revision='1'),
            lambda es: es[9]['outcome']['output'].update(reopened=False),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                self.setUp(); mutate(self.events)
                self.assertFalse(self.audit()['passed'])
        self.setUp(); self.revisions.clear(); self.assertFalse(self.audit()['passed'])
        self.setUp(); self.assertFalse(verify_checkpoint_schedule(self.events, self.requests, ['/other'], self.revisions)['passed'])

    def test_save_after_next_node_does_not_cover_import_boundary(self):
        node = dict(node_id='calculated', document_id='doc', workflow_id='flow1')
        request = dict(operation_id='calc', workflow_ref=self.seed['workflow_ref'], target=dict(kind='new', type='transform.calculator', label='Calc'),
                       inputs=[dict(source=self.events[1]['result']['node'], input=0, output=0)])
        checkpoint = dict(self.events[1], operation_id='calc', result=dict(node=node))
        self.requests.append(request)
        self.events[2:2] = [dict(phase='node_apply_prepared', request=request), checkpoint]
        graph = dict(nodes=['Calc', 'Import'], ports=[dict(node_label='Calc', tids=['Calc;Input_Data[0]', 'Calc;Input_Var[0]', 'Calc;Output_Data[0]']),
                     dict(node_label='Import', tids=['Import;Input_Connection[0]', 'Import;Input_Var[0]', 'Import;Output_Data[0]'])],
                     links=['Import|Output_Data[0]|Calc|Input_Data[0]'])
        for e in self.events[4:]:
            e['checkpoint']['graph'] = copy.deepcopy(graph)
            for t in e.get('outcome', {}).get('trace', []):
                if 'graph' in t: t['graph'] = copy.deepcopy(graph)
        result = self.audit()
        self.assertFalse(result['passed'])
        self.assertEqual(result['failures'], ['missing_boundary_save:seed'])


if __name__ == '__main__': unittest.main()
