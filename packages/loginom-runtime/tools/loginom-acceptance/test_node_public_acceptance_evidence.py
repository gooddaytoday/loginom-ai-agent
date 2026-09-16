import copy
import unittest
from evidence import PREFIX
from node_public_acceptance_evidence import verify_public_nodes_and_saves, verify_public_delivery


class PublicNodeAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.request = dict(operation_id='import', finish='execute')
        outcome = dict(operation_id='import', status='SUCCEEDED', cleanup_complete=True, output=dict(rows=6))
        save_args = dict(operation_id='save', action_key='package.save_as', parameters=dict(path='/user/final.lgp'))
        saved = dict(operation_id='save', status='SUCCEEDED', cleanup_complete=True)
        self.evidence = dict(calls=[], tools=[], events=[
            dict(operation_id='import', phase='node_apply_prepared', request=self.request),
            dict(operation_id='import', phase='completed', outcome=outcome),
            dict(phase='completed', **save_args, outcome=saved)])
        def pair(name, args, result):
            index = len(self.evidence['calls']); key = 'call'+str(index)
            self.evidence['calls'].append(dict(tool=PREFIX+name, arguments=args, row=index*2+1, session_id='caller', tool_call_id=key))
            self.evidence['tools'].append(dict(tool=PREFIX+name, result=result, row=index*2+2, session_id='caller', tool_call_id=key))
        pair('dock_node_apply', self.request, dict(operation_id='import', state='running', attempt=1, outcome=None))
        pair('dock_node_wait', dict(operation_id='import', timeout_ms=1000),
             dict(operation_id='import', state='settled', attempt=1, outcome=outcome))
        pair('dock_action_run', save_args, saved)
        self.evidence = copy.deepcopy(self.evidence)

    def audit(self):
        return verify_public_nodes_and_saves(self.evidence, {'import': self.request}, ['save'])

    def test_running_wait_and_save_bind_to_original_journal(self):
        self.assertTrue(self.audit()['passed'], self.audit())
        self.assertFalse(self.audit()['hermes_acceptance_verified'])

    def test_immediate_completion_does_not_require_an_unnecessary_wait(self):
        self.evidence['tools'][0]['result'] = self.evidence['tools'][1]['result']
        self.evidence['calls'].pop(1); self.evidence['tools'].pop(1)
        self.assertTrue(self.audit()['passed'], self.audit())

    def test_missing_or_duplicate_pairs_and_wrong_receipts_are_rejected(self):
        mutations = [
            lambda e: e['tools'].pop(0),
            lambda e: e['tools'].append(copy.deepcopy(e['tools'][0])),
            lambda e: e['calls'].append(copy.deepcopy(e['calls'][0])),
            lambda e: e['tools'][1].update(session_id='foreign'),
            lambda e: e['tools'][1].update(tool=PREFIX+'dock_node_status'),
            lambda e: e['tools'][1]['result'].update(attempt=2),
            lambda e: e['tools'][1]['result'].update(state='running', outcome=None),
            lambda e: e['tools'][1]['result'].update(outcome=dict(status='SUCCEEDED')),
            lambda e: e['events'].append(copy.deepcopy(e['events'][1])),
            lambda e: e['calls'][1]['arguments'].update(operation_id='replacement'),
            lambda e: e['calls'][0]['arguments'].update(finish='done'),
            lambda e: e['calls'][2]['arguments']['parameters'].update(path='/other.lgp'),
            lambda e: e['tools'][2].update(result=dict(status='AMBIGUOUS')),
            lambda e: e['calls'][1].update(row=1),
        ]
        original = copy.deepcopy(self.evidence)
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                # JSON evidence has no shared objects with expected requests.
                import json
                self.evidence = json.loads(json.dumps(original))
                mutate(self.evidence)
                self.assertFalse(self.audit()['passed'])

    def test_corrected_same_id_requires_strict_preallocation_refusal_before_start(self):
        import json
        for c in self.evidence['calls']:c['row']+=2
        for r in self.evidence['tools']:r['row']+=2
        error=dict(status='FAILED',action_key='request.validate',operation_id=None,phase='request_rejected',effect_possible=False,request_rejected=True,trace=[],error=dict(code='REQUEST_REJECTED'),output=dict(operation=dict(operation_id=None,state='idle',outcome=None,cleanup_confirmed=True,effect_state='none')))
        call=dict(tool=PREFIX+'dock_node_apply',arguments=dict(operation_id='import',invalid=True),row=1,session_id='caller',tool_call_id='refused')
        reply=dict(tool=call['tool'],row=2,session_id='caller',tool_call_id='refused',result=dict(isError=True,error=json.dumps(error)))
        self.evidence['calls'].insert(0,call);self.evidence['tools'].insert(0,reply)
        def check():return verify_public_nodes_and_saves(self.evidence,{'import':self.request},['save'],allow_validation_refusals=True)
        self.assertTrue(check()['passed'],check())
        for fault in ['late','effect','allocated','duplicate_declaration']:
            before=copy.deepcopy(self.evidence)
            if fault=='late':call['row']=9;reply['row']=10
            if fault=='effect':changed=copy.deepcopy(error);changed['effect_possible']=True;reply['result']['error']=json.dumps(changed)
            if fault=='allocated':changed=copy.deepcopy(error);changed['output']['operation']['state']='running';reply['result']['error']=json.dumps(changed)
            if fault=='duplicate_declaration':self.evidence['events'].append(copy.deepcopy(self.evidence['events'][0]))
            with self.subTest(fault=fault):self.assertFalse(check()['passed'])
            self.evidence=before;call=self.evidence['calls'][0];reply=self.evidence['tools'][0]

    def test_validation_refusal_is_optional_and_requires_no_allocated_effect(self):
        import json
        error=dict(status='FAILED',action_key='request.validate',operation_id=None,phase='request_rejected',
            effect_possible=False,request_rejected=True,trace=[],error=dict(code='REQUEST_REJECTED'),
            output=dict(operation=dict(operation_id=None,state='idle',outcome=None,cleanup_confirmed=True,effect_state='none')))
        call=dict(tool=PREFIX+'dock_node_apply',arguments=dict(operation_id='bad'),row=9,session_id='caller',tool_call_id='rejected')
        reply=dict(tool=call['tool'],row=10,session_id='caller',tool_call_id='rejected',result=dict(isError=True,error=json.dumps(error)+'Read the current state before continuing.'))
        self.evidence['calls'].append(call);self.evidence['tools'].append(reply)
        def audit():return verify_public_nodes_and_saves(self.evidence,{'import':self.request},['save'],allow_validation_refusals=True)
        self.assertFalse(self.audit()['passed'])
        self.assertTrue(audit()['passed'],audit());self.assertEqual(audit()['validation_refusals'],['bad'])
        for mutate in [lambda e:e.update(effect_possible=True),lambda e:e.update(status='AMBIGUOUS'),
                lambda e:e.update(request_rejected=False),lambda e:e.update(operation_id='bad'),
                lambda e:e.update(trace=[dict(verb='execute')]),
                lambda e:e['output']['operation'].update(state='running'),
                lambda e:e['output']['operation'].update(cleanup_confirmed=False),
                lambda e:e['output']['operation'].update(effect_state='unknown')]:
            changed=copy.deepcopy(error);mutate(changed);reply['result']['error']=json.dumps(changed)
            self.assertFalse(audit()['passed'])
        reply['result']['error']=json.dumps(error)
        self.evidence['events'].append(dict(operation_id='bad',phase='prepared'))
        self.assertFalse(audit()['passed'])
        self.evidence['events'].pop();reply['result']['error']='unknown failure'
        self.assertFalse(audit()['passed'])
        reply['result']['error']=json.dumps(error);reply['session_id']='foreign'
        self.assertFalse(audit()['passed'])


if __name__ == '__main__':
    unittest.main()


class PublicDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.node = dict(operation_id='import', parameters=dict(source=dict(artifact_id='artifact',
            upload_operation_id='delivery:upload', bytes=230, sha256='digest'), settings=dict(source=dict(source_path='/user/sales.csv'))))
        self.prepared = dict(input_artifacts=[dict(artifact_id='artifact', bytes=230, sha256='digest',
                              upload=dict(grant_id='grant', destination='/user/sales.csv'))])
        result = dict(status='SUCCEEDED', destination='/user/sales.csv', bytes=230, sha256='digest')
        snapshot = dict(operation_id='delivery', upload_operation_id='delivery:upload', state='settled', phase='completed', outcome=result)
        self.evidence = dict(calls=[dict(tool=PREFIX+'dock_artifact_deliver', row=1, session_id='caller', tool_call_id='d',
            arguments=dict(operation_id='delivery', artifact_id='artifact', upload_grant_id='grant', budget_ms=1000)),
            dict(tool=PREFIX+'dock_node_apply', row=3, session_id='caller', tool_call_id='n', arguments=self.node)],
            tools=[dict(tool=PREFIX+'dock_artifact_deliver', row=2, session_id='caller', tool_call_id='d', result=snapshot),
                   dict(tool=PREFIX+'dock_node_apply', row=4, session_id='caller', tool_call_id='n', result={})],
            events=[dict(operation_id='delivery', phase='artifact_delivery_completed', result=result),
                    dict(operation_id='import', phase='node_apply_prepared')])
        import json
        self.evidence = json.loads(json.dumps(self.evidence))

    def audit(self):
        return verify_public_delivery(self.evidence, self.node, self.prepared)

    def test_one_delivery_requires_no_replay(self):
        self.assertTrue(self.audit()['passed'], self.audit())

    def test_optional_source_metadata_binds_to_prepared_artifact_and_final_receipt(self):
        for request in (self.node, self.evidence['calls'][1]['arguments']):
            for key in ('bytes', 'sha256'): request['parameters']['source'].pop(key)
        self.assertTrue(self.audit()['passed'], self.audit())
        self.prepared['input_artifacts'][0]['sha256']='other'
        self.assertIn('public_delivery_artifact_bytes', self.audit()['failures'])
        self.prepared['input_artifacts'][0]['sha256']='digest'
        for request in (self.node, self.evidence['calls'][1]['arguments']):
            request['parameters']['source']['bytes']=999
        self.assertIn('public_delivery_grant_binding', self.audit()['failures'])

    def test_changed_grant_receipt_identity_and_order_fail(self):
        mutations = [lambda e: e['calls'][0]['arguments'].update(upload_grant_id='other'),
                     lambda e: e['tools'][0]['result'].update(upload_operation_id='replacement'),
                     lambda e: e['tools'][0]['result']['outcome'].update(destination='/other.csv'),
                     lambda e: e['events'].reverse(),
                     lambda e: e['tools'][0].update(row=5)]
        original = copy.deepcopy(self.evidence)
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                self.evidence = copy.deepcopy(original); mutate(self.evidence)
                self.assertFalse(self.audit()['passed'])
