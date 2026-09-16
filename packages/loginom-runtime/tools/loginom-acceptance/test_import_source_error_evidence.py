import copy
import unittest
from node_procedure_evidence import digest
import test_import_done_evidence as done_fixture
from import_source_error_evidence import verify_import_source_error


class SourceErrorEvidenceTests(unittest.TestCase):
    def setUp(self):
        fixture = done_fixture.ImportDoneEvidenceTests(); fixture.setUp()
        self.events, self.request, self.body = fixture.events, fixture.request, fixture.body
        self.request['target']['kind'] = 'new'; self.request['finish'] = 'execute'
        start = next(i for i, e in enumerate(self.events) if e['phase'] == 'node_phase_prepared' and e['receipt']['phase'] == 'configure')
        self.events = self.events[:start+3]
        sample, completed = self.events[-2:]
        before = completed['outcome']['output']
        before['wizard']['root_ref']='wizard-root'
        before['wizard']['root_tid']='MF;TF-1;WizrdMCF'
        before['wizard'].setdefault('controls', {})
        ref = 'error-next'; before['ui']['elements'].append({'ref': ref, 'tid': 'MF;TF-1;WizrdMCF;btnNext', 'allowed_actions': ['wizard_step']})
        sample['outcome']['output'] = copy.deepcopy(before)
        self.message = 'Файл "'+self.request['parameters']['settings']['source']['source_path']+'" не найден'
        after = copy.deepcopy(before)
        after['wizard']['source_validation'] = dict(status='observed',root_ref=after['wizard']['root_ref'],field='file_name',field_ref='source-field',message=self.message)
        after['wizard']['controls']['btnError'] = dict(status='observed', enabled=True)
        self.step = completed['step']+1
        action = dict(verb='wizard_step',ref=ref,expected_stage='text_import_format')
        internal = 'done:n'+str(self.step)
        base = {k: completed[k] for k in ['session_id','runtime_revision','target','operation_id','internal_provenance']}
        base.update(step=self.step,internal_operation_id=internal)
        self.events.append(dict(base,phase='node_step_prepared',action=action,observation_sha256=digest(before),signature=digest([internal,action,before])))
        self.events.append(dict(base,phase='node_step_completed',outcome=dict(status='AMBIGUOUS',phase='observing',effect_possible=True,cleanup_complete=True,operation_id=internal,action_key='ui.act',error=dict(code='WIZARD_SOURCE_VALIDATION_FAILED',message=self.message),output=after,trace=[dict(event='ui_gesture_applied'),dict(event='wizard_source_validation_failed',message=self.message)])))
        self.result = dict(status='AMBIGUOUS',effect_possible=True,output=dict(node={'node_id':'node'},pending_phase='configure',package_saved=False,execution=dict(status='not_requested',execution_id=None),output=dict(status='not_refreshed'),error=dict(cause=dict(code='WIZARD_SOURCE_VALIDATION_FAILED',message=self.message))))
        self.replayed = copy.deepcopy(self.result)

    def audit(self):
        return verify_import_source_error(self.events,self.request,self.body,self.result,self.replayed)

    def test_bound_error_is_a_verified_negative(self):
        self.assertTrue(self.audit()['passed'], self.audit())

    def add_workflow(self):
        at = next(i for i,e in enumerate(self.events) if e['phase']=='node_phase_prepared' and e['receipt']['phase']=='target')
        value = dict(verified=True,status='SUCCEEDED',cleanup_complete=True,document_id=self.request['document_id'],workflow_ref=copy.deepcopy(self.request['workflow_ref']))
        self.events[at:at] = [dict(operation_id=self.request['operation_id'],phase='node_phase_prepared',receipt=dict(phase='workflow')),
            dict(operation_id=self.request['operation_id'],phase='node_phase_completed',receipt=dict(phase='workflow',status='verified',value=value))]
        return self.events[at+1]

    def test_current_workflow_phase_before_target(self):
        self.add_workflow()
        self.assertTrue(self.audit()['passed'],self.audit())

    def test_foreign_workflow_phase_rejected(self):
        self.add_workflow()['receipt']['value']['document_id']='foreign'
        self.assertFalse(self.audit()['passed'])

    def test_uncompleted_workflow_phase_rejected(self):
        receipt=self.add_workflow();self.events.remove(receipt)
        self.assertFalse(self.audit()['passed'])

    def test_corrupted_evidence_is_rejected(self):
        changes = [
            lambda s: s.events[-1]['outcome']['error'].update(code='WIZARD_STEP_NOT_CONFIRMED'),
            lambda s: s.events[-1]['outcome']['output']['wizard']['source_validation'].update(root_ref='foreign'),
            lambda s: s.events[-1]['outcome']['output']['prepared_node_context'].update(node_id='foreign'),
            lambda s: s.events[-1]['outcome']['output']['wizard']['import_source']['fields']['source_path'].update(value='/wrong.csv'),
            lambda s: s.events[-1]['outcome']['trace'].append(dict(event='ui_gesture_applied')),
            lambda s: s.events[-1]['outcome'].update(cleanup_complete=False),
            lambda s: s.result['output']['execution'].update(status='completed'),
            lambda s: s.result['output'].update(package_saved=True),
            lambda s: s.replayed.update(status='SUCCEEDED'),
            lambda s: s.events.append(copy.deepcopy(s.events[-1])),
            lambda s: setattr(s,'body',b'wrong'),
            lambda s: setattr(s,'events',[e for e in s.events if e['operation_id']!='upload']),
        ]
        for i, change in enumerate(changes):
            with self.subTest(i=i):
                self.setUp();change(self);self.assertFalse(self.audit()['passed'],i)


if __name__ == '__main__':
    unittest.main()
