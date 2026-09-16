import copy
import unittest
from hermes_auth_guard import POLICY
from node_apply_acceptance import audit, model_completed


class CompleteNodeAuditTests(unittest.TestCase):
    def setUp(self):
        self.request = dict(model_profile='chatgpt-sol', provider='openai-codex', model='gpt-5.6-sol',
                            reasoning_effort='low', fallback_allowed=False, auth_policy=POLICY)
        self.evidence = dict(reasoning_effort='low', auth_connection_unchanged=True,
            auth_guard=dict(policy=POLICY, installed=True, blocked_attempts=0),
            process=dict(returncode=0, timed_out=False, usage=dict(provider='openai-codex', model='gpt-5.6-sol',
                         completed=True, failed=False, api_calls=4)))

    def test_terminal_model_requires_completed_work_not_just_zero_exit(self):
        self.assertTrue(model_completed(self.request, self.evidence))
        for key, value in [('completed', False), ('completed', None), ('failed', True), ('api_calls', 0), ('api_calls', True)]:
            with self.subTest(key=key, value=value):
                changed = copy.deepcopy(self.evidence)
                changed['process']['usage'][key] = value
                self.assertFalse(model_completed(self.request, changed))

    def test_old_profile_fallback_or_changed_auth_is_rejected(self):
        for key, value in [('model_profile', 'chatgpt-luna'), ('fallback_allowed', True), ('model', 'other')]:
            changed = dict(self.request, **{key: value})
            self.assertFalse(model_completed(changed, self.evidence))
        self.evidence['auth_guard']['blocked_attempts'] = 1
        self.assertFalse(model_completed(self.request, self.evidence))

    def test_missing_evidence_never_passes_or_completes_subplan(self):
        result = audit({}, {}, '', b'')
        self.assertFalse(result['passed'])
        self.assertFalse(result['subplan_complete'])
        self.assertIn('malformed_evidence', result['checks'])


if __name__ == '__main__':
    unittest.main()
