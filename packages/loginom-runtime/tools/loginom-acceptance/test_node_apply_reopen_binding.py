import copy
import unittest
from evidence import PREFIX
from node_apply_reopen_binding import unchanged_patch, verify_reopen_binding


class ReopenBindingTests(unittest.TestCase):
    def setUp(self):
        self.path = '/user/dock-p3/final.lgp'
        baseline = dict(source=dict(encoding='UTF-8'), format=dict(null_marker='\\N'),
                        columns=[dict(name='Id', label='Id', type='integer')])
        self.seed = dict(document_id='doc', workflow_ref=dict(workflow_id='old', prefix='old', tab_tid='old'),
                         parameters=dict(source=dict(artifact_id='artifact'), settings=baseline))
        flow = dict(workflow_id='new', prefix='new', tab_tid='new')
        self.request = dict(operation_id='again', document_id='doc', workflow_ref=flow,
                            target=dict(kind='existing'), parameters=dict(source=dict(artifact_id='artifact'),
                            settings=dict(columns=[dict(name='Id', label='Id')])) )
        state = dict(operation_id='prepare-final', session_id='dock', document_id='doc', workflow_ref=flow,
                     status='READY', phase='exact_workflow_ready', authenticated=True, created_draft=False,
                     target_verified=True, reason=None, package_ref=dict(path=self.path, persisted=True))
        self.evidence = dict(events=[dict(operation_id='save', phase='completed', session_id='dock', runtime_revision='pin'),
                            dict(event='workspace_prepared', state=state, session_id='dock', runtime_revision='pin'),
                            dict(operation_id='again', phase='node_apply_prepared', request=self.request)],
            calls=[dict(tool=PREFIX+'dock_prepare', tool_call_id='prep-call', session_id='caller', row=5,
                        arguments=dict(operation_id='prepare-final', intent='open_package', package_path=self.path)),
                   dict(tool=PREFIX+'dock_node_apply', tool_call_id='apply-call', session_id='caller', row=7, arguments=self.request)],
            tools=[dict(tool=PREFIX+'dock_prepare', tool_call_id='prep-call', session_id='caller', row=6,
                        result=dict(prepared=True, sessionId='dock', workspace=state))])
        self.evidence = copy.deepcopy(self.evidence)

    def audit(self):
        return verify_reopen_binding(self.evidence, self.seed, self.request, 'save', self.path)

    def test_real_event_and_public_pair_bind_without_claiming_persistence(self):
        result = self.audit()
        self.assertTrue(result['passed'], result)
        self.assertFalse(result['settings_persistence_verified'])

    def test_synthetic_operator_event_is_not_a_real_prepare(self):
        self.evidence['events'][1].pop('event')
        self.evidence['events'][1]['phase'] = 'saved_package_prepared'
        self.assertFalse(self.audit()['passed'])

    def test_mapping_reapplication_cannot_prove_saved_mapping(self):
        mapping = [dict(direction='output', port=0, autosync=False, fields=[])]
        self.seed['mappings'] = copy.deepcopy(mapping)
        self.request['mappings'] = copy.deepcopy(mapping)
        self.evidence['events'][2]['request'] = copy.deepcopy(self.request)
        self.evidence['calls'][1]['arguments'] = copy.deepcopy(self.request)
        self.assertIn('reopen_mapping_reapplication', self.audit()['failures'])
        self.request['mappings'] = []
        self.request['parameters']['settings'] = {}
        self.evidence['events'][2]['request'] = copy.deepcopy(self.request)
        self.evidence['calls'][1]['arguments'] = copy.deepcopy(self.request)
        self.assertTrue(self.audit()['passed'])

    def test_wrong_public_and_journal_bindings_fail(self):
        changes = [lambda e: e['calls'][0]['arguments'].update(package_path='/other.lgp'),
                   lambda e: e['calls'][0].update(session_id='other'),
                   lambda e: e['tools'][0].update(tool_call_id='other'),
                   lambda e: e['tools'][0].update(row=8),
                   lambda e: e['events'][1].update(runtime_revision='other'),
                   lambda e: e['events'][1]['state'].update(created_draft=True)]
        original = copy.deepcopy(self.evidence)
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                self.evidence = copy.deepcopy(original); change(self.evidence)
                self.assertFalse(self.audit()['passed'])

    def test_noop_may_repeat_any_unchanged_settings_but_cannot_repair_persistence(self):
        baseline = self.seed['parameters']['settings']
        for patch in ({}, baseline, dict(columns=[dict(name='Id', type='integer')])):
            self.assertTrue(unchanged_patch(baseline, patch))
        for patch in (dict(format=dict(null_marker='NULL')), dict(columns=[dict(name='Id', type='real')]),
                      dict(columns=[dict(name='Id'), dict(name='Id')]), dict(columns=[dict(name='Other')])):
            self.assertFalse(unchanged_patch(baseline, patch))


if __name__ == '__main__':
    unittest.main()

class ReformReopenBindingTests(unittest.TestCase):
    setUp = ReopenBindingTests.setUp
    def test_reform_reopen_cannot_reapply_a_change(self):
        self.seed['parameters']={'changes':[{'field':{'kind':'input_field','name':'X'},'type':'real'}]}
        self.request['parameters']={'changes':[]}
        def audit():
            self.evidence['events'][2]['request']=copy.deepcopy(self.request)
            self.evidence['calls'][1]['arguments']=copy.deepcopy(self.request)
            return verify_reopen_binding(self.evidence,self.seed,self.request,'save',self.path,reform=True)
        self.assertTrue(audit()['passed'])
        self.request['parameters']=copy.deepcopy(self.seed['parameters'])
        self.assertIn('reopen_unchanged_request',audit()['failures'])
