import copy
import unittest
from save_conflict_evidence import verify_save_refusal_receipt

class SaveRefusalTests(unittest.TestCase):
    def setUp(self):
        self.path='/user/dock-p3/existing.lgp'
        self.outcome=dict(status='NOT_APPLIED',cleanup_complete=True,error=None,output=dict(path=self.path,conflict=True),
            trace=[dict(event='save_requested',path=self.path),dict(event='save_conflict_observed',path=self.path,
                    message='"'+self.path+'" уже существует. Вы хотите заменить его?'),dict(event='conflict_rejected'),
                   dict(event='cleanup_completed',resource='transient_dialog')])
    def audit(self):return verify_save_refusal_receipt(self.outcome,self.path)
    def test_exact_refusal_receipt_passes_without_claiming_file_bytes(self):
        self.assertTrue(self.audit()['passed']);self.assertFalse(self.audit()['file_bytes_verified'])
    def test_path_question_effect_and_cleanup_substitutions_fail(self):
        changes=[lambda o:o.update(status='AMBIGUOUS'),lambda o:o.update(cleanup_complete=False),
            lambda o:o['output'].update(path='/other.lgp'),lambda o:o['trace'][1].update(path='/other.lgp'),
            lambda o:o['trace'][1].update(message='Файл существует'),lambda o:o['trace'].pop(2),
            lambda o:o['trace'].append(copy.deepcopy(o['trace'][2])),lambda o:o['trace'].reverse(),
            lambda o:o['trace'][-1].update(resource='mouse'),lambda o:o['trace'].append(dict(event='overwrite_confirmed')),
            lambda o:o['trace'].append(dict(event='save_flow_completed')),lambda o:o['trace'].append(dict(event='saved_package_closed'))]
        for index,change in enumerate(changes):
            with self.subTest(index=index):
                self.setUp();change(self.outcome);self.assertFalse(self.audit()['passed'])

if __name__=='__main__':unittest.main()
