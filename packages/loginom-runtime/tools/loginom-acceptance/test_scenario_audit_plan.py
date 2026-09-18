import copy
import unittest
from scenario_audit_plan import build_plan


class ResumeAuditTests(unittest.TestCase):
    def test_comparison_requires_matching_verified_profile_and_is_not_acceptance(self):
        request,evidence=self.fixture()
        model='deepseek/deepseek-v4.1-flash'
        request.update(phase='diagnostic',provider='openrouter',model=model)
        evidence['effective_models']=[dict(model=model)]
        evidence['effective_profile']=dict(status='VERIFIED',sessions=[dict(model=model,provider='openrouter')])
        self.assertFalse(build_plan(request,evidence)['acceptance_eligible'])
        for fault in ['unverified','foreign_provider','wrong_model','acceptance']:
            r,e=copy.deepcopy(request),copy.deepcopy(evidence)
            if fault=='unverified':e['effective_profile']['status']='UNVERIFIED'
            if fault=='foreign_provider':e['effective_profile']['sessions'][0]['provider']='other'
            if fault=='wrong_model':e['effective_models'][0]['model']='mimo-v2.5'
            if fault=='acceptance':r['phase']='acceptance'
            with self.assertRaises(ValueError):build_plan(r,e)

    def test_stopped_run_requires_explicit_non_acceptance_diagnostic_and_confirmed_save(self):
        request,evidence=self.fixture();evidence['process']['returncode']=-15
        with self.assertRaises(ValueError):build_plan(request,evidence)
        plan=build_plan(request,evidence,diagnostic_saved_only=True)
        self.assertFalse(plan['acceptance_eligible'])
        self.assertTrue(plan['diagnostic_saved_only'])
        evidence['tools'].pop()
        with self.assertRaisesRegex(ValueError,'save not confirmed'):
            build_plan(request,evidence,diagnostic_saved_only=True)

    def test_save_as_requires_verified_reopened_identity(self):
        request,evidence=self.fixture()
        receipt=evidence['tools'][-1]['result']
        receipt.update(action_key='package.save_as',phase='verified',output=dict(reopened=True,package_ref=dict(path=request['package'],active_identity=request['package'])))
        self.assertFalse(build_plan(request,evidence)['operator_reviewed'])
        for field,value in [('reopened',False),('package_ref',dict(path=request['package'],active_identity='/other'))]:
            invalid=copy.deepcopy(evidence)
            invalid['tools'][-1]['result']['output'][field]=value
            with self.assertRaisesRegex(ValueError,'save not confirmed'):build_plan(request,invalid)

    def test_read_refresh_preserves_original_configuration_and_requires_source(self):
        request,evidence=self.fixture()
        original=copy.deepcopy(evidence['tools'][1]['result'])
        original.update(operation_id='read',configuration=dict(status='not_requested'),cleanup_complete=True,execution=dict(status='completed'))
        evidence['calls'].append(dict(tool='dock_node_read',arguments=dict(operation_id='read',source_operation_id='import',read=dict(sample_rows=100))))
        evidence['tools'].insert(-1,dict(result=original))
        plan=build_plan(request,evidence)
        self.assertIs(plan['acceptance_eligible'],True)
        self.assertEqual(len(plan['model_operations_for_review']),1)
        self.assertEqual(plan['outputs'][0]['name'],'read-port0')
        self.assertFalse(plan['output_read_operations'][0]['configuration_changed'])
        for mutation in ('source','node','configuration','cleanup'):
            bad=copy.deepcopy(evidence)
            if mutation=='source':bad['calls'][-1]['arguments']['source_operation_id']='unknown'
            if mutation=='node':bad['tools'][-2]['result']['node']['node_id']='other'
            if mutation=='configuration':bad['tools'][-2]['result']['configuration']['status']='applied'
            if mutation=='cleanup':bad['tools'][-2]['result']['cleanup_complete']=False
            with self.assertRaises(ValueError):build_plan(request,bad)

    def test_first_read_without_preview_requires_original_mapping_proof(self):
        request,evidence=self.fixture()
        source=evidence['tools'][1]['result'];source['output']['ports']=[]
        source.update(cleanup_complete=True,execution=dict(status='completed'))
        field=dict(index=0,name='amount',label='Amount',type='real',source_name='amount',excluded=False)
        source['phases']=[dict(phase=p,receipt_id='import:'+p,status='verified') for p in ['output_mapping','finish']]
        source['configuration']=dict(status='applied',readback=dict(node=copy.deepcopy(source['node']),scope='observed_before_verified_finish',
            values_are='observed_ui_values',receipt_ids=['import:output_mapping','import:finish'],output_mapping=dict(port=0,fields=[field])))
        read=dict(operation_id='read',status='SUCCEEDED',node=copy.deepcopy(source['node']),configuration=dict(status='not_requested'),cleanup_complete=True,
            execution=dict(status='completed'),output=dict(ports=[dict(port=0,schema=[dict(name='amount',label='Amount',type='real')])]))
        evidence['tools'].insert(-1,dict(result=read))
        evidence['calls'].append(dict(tool='dock_node_read',arguments=dict(operation_id='read',source_operation_id='import')))
        self.assertEqual(build_plan(request,evidence)['outputs'][0]['name'],'read-port0')
        for fault in ['node','receipt','schema','port','excluded']:
            bad=copy.deepcopy(evidence);r=bad['tools'][1]['result']['configuration']['readback']
            if fault=='node':r['node']['node_id']='foreign'
            if fault=='receipt':r['receipt_ids'].pop()
            if fault=='schema':r['output_mapping']['fields'][0]['type']='string'
            if fault=='port':r['output_mapping']['port']=1
            if fault=='excluded':r['output_mapping']['fields'][0]['excluded']=True
            with self.assertRaises(ValueError):build_plan(request,bad)

    def fixture(self):
        request = dict(task=dict(number=47), run_id='run', package='/mimo/MiMo-test/scenario.lgp', runtime_source_pin=dict(client_revision='pin'))
        args = dict(operation_id='import', target=dict(kind='new', type='imports.text', label='Source'), parameters={}, inputs=[])
        evidence = dict(runtime_source_unchanged=True, process=dict(returncode=0, timed_out=False), effective_models=[dict(model='mimo-v2.5')],
                        calls=[dict(tool='dock_node_apply', arguments=args), dict(tool='dock_node_resume', arguments=dict(operation_id='import'))],
                        events=[dict(phase='node_target_checkpoint', recorded_at='now', operation_id='import', target_state=dict(baseline=dict(complete=True, document_id='doc', foreign_links=[], nodes=[], links=[])))],
                        tools=[dict(result=dict(prepared=True, knowledge=dict(session_manifest=dict(actionCatalogVersion='version', actionManifestDigest='hash')))),
                               dict(result=dict(operation_id='import', status='SUCCEEDED', node=dict(node_id='node', document_id='doc'), output=dict(ports=[dict(port=0, schema=[])]))),
                               dict(result=dict(action_key='package.save_checkpoint', status='SUCCEEDED', cleanup_complete=True, output=dict(package_ref=dict(path=request['package']), save_completed=True)))])
        return request, evidence

    def test_id_only_resume_preserves_the_original_audit_request(self):
        request, evidence = self.fixture()
        plan = build_plan(request, evidence)
        self.assertEqual(len(plan['model_operations_for_review']), 1)
        self.assertEqual(plan['expected_graph']['nodes'][0]['label'], 'Source')
        self.assertFalse(plan['operator_reviewed'])

    def test_orphan_resume_and_changed_full_request_are_rejected(self):
        request, evidence = self.fixture()
        orphan = copy.deepcopy(evidence)
        orphan['calls'].reverse()
        with self.assertRaisesRegex(ValueError, 'lacks an original'):
            build_plan(request, orphan)
        changed = copy.deepcopy(evidence['calls'][0])
        changed['tool'] = 'dock_node_resume'
        changed['arguments']['target']['label'] = 'Changed'
        evidence['calls'].append(changed)
        with self.assertRaisesRegex(ValueError, 'changed requests'):
            build_plan(request, evidence)


if __name__ == '__main__':
    unittest.main()
