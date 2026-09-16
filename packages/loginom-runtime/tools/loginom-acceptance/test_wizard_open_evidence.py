import copy
import unittest
from wizard_open_evidence import verify_wizard_open_sequence


class WizardOpenEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.node = {'document_id': 'doc', 'workflow_id': 'flow', 'node_id': 'node'}
        graph = {**self.node, 'verified': True, 'surface': 'graph', 'tid': 'MF;TF-1;Graph;Import'}
        path = [{'tid': 'flow', 'label': 'Scenario'}]
        opening = {'node': {'node_label': 'Import'}, 'workflow_path': path}
        owner = {'status': 'observed', 'node': {'tid': 'flow>Import'},
                 'path': path + [{'tid': 'flow>Import', 'label': 'Import'}, {'tid': 'flow>Import>Settings', 'label': 'Settings'}]}
        before = {'prepared_node_context': graph, 'ui': {'elements': [
            {'ref': 'settings', 'tid': graph['tid']+';Setting', 'wizard_open': opening}]}}
        question = {'loginom_build': '7.4.2', 'prepared_node_context': graph,
                    'wizard': {'status': 'absent'}, 'wizard_pending_owner': owner,
                    'node_wizard_confirmation': {'kind': 'deactivation', 'node': self.node,
                                                 'graph_tid': graph['tid'], 'opening': opening},
                    'ui': {'masks': [{'kind': 'modal_background', 'target_tid': 'MF;TF-1', 'dialog_ref': None}],
                           'dialogs': [{'ref': 'dialog', 'title': 'Loginom 7.4.2', 'text':
                                'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет'}],
                           'elements': [{'ref': k, 'tid': 'msgbox;tlb;'+k, 'label': v,
                                         'signature': {'dialog_ref': 'dialog'}, 'allowed_actions': ['click']}
                                        for k, v in [('yes', 'Да'), ('no', 'Да, больше не спрашивать'), ('cancel', 'Нет')]]}}
        final = {'prepared_node_context': {**graph, 'surface': 'wizard'},
                 'wizard': {'status': 'observed', 'owner_context': owner}}
        self.sequence = copy.deepcopy({'failures': [], 'observations': [(1, before), (3, question), (5, final)],
            'mutations': [(2, {'verb': 'begin_wizard', 'ref': 'settings'}, {'trace': [{'event': 'wizard_deactivation_question_observed'}]}),
                          (4, {'verb': 'confirm_wizard_deactivation', 'ref': 'yes'}, {'trace': [{'event': 'wizard_open_verified'}]})]})

    def verify(self):
        return verify_wizard_open_sequence(self.sequence, self.node, expect_deactivation=True)

    def test_exact_bound_question_opens_without_execution_claim(self):
        result = self.verify()
        self.assertTrue(result['passed'], result)
        self.assertFalse(result['execution_verified'])

    def test_suppress_future_questions_is_not_the_same_answer(self):
        self.sequence['mutations'][1][1]['ref'] = 'no'
        self.assertIn('deactivation_answer_owner', self.verify()['failures'])

    def test_foreign_pending_owner_and_mask_fail(self):
        q = self.sequence['observations'][1][1]
        q['wizard_pending_owner']['node']['tid'] = 'flow>Other'
        q['ui']['masks'][0]['target_tid'] = 'MF;TF-2'
        self.assertIn('deactivation_answer_owner', self.verify()['failures'])

    def test_missing_new_open_receipt_fails(self):
        self.sequence['mutations'][1][2]['trace'] = []
        self.assertIn('deactivation_open_receipt_missing', self.verify()['failures'])

    def test_final_foreign_native_node_fails(self):
        self.sequence['observations'][-1][1]['prepared_node_context']['node_id'] = 'foreign'
        self.assertIn('prepared_node_changed', self.verify()['failures'])

    def test_no_confirmation_branch_requires_direct_open_proof(self):
        self.sequence['observations'].pop(1)
        self.sequence['mutations'].pop()
        self.sequence['mutations'][0][2]['trace'] = [{'event': 'wizard_open_verified'}]
        result = verify_wizard_open_sequence(self.sequence, self.node, expect_deactivation=False)
        self.assertTrue(result['passed'], result)


if __name__ == '__main__':
    unittest.main()
