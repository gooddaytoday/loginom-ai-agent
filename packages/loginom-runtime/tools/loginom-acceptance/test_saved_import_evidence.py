import copy
import unittest
from saved_import_evidence import verify_saved_package_transition


class SavedPackageTransitionTests(unittest.TestCase):
    def setUp(self):
        self.path = '/user/dock-p3/new.lgp'
        self.parameters = dict(path=self.path, conflict_policy='fail')
        old = dict(tab_tid='tab1', prefix='TF1', workflow_id='flow1')
        new = dict(tab_tid='tab2', prefix='TF2', workflow_id='flow2')
        source = dict(artifact_id='artifact', upload_operation_id='upload', sha256='hash', bytes=12)
        self.seed = dict(operation_id='seed', document_id='doc', workflow_ref=old,
                         target=dict(label='Import'), parameters=dict(source=source,
                         settings=dict(columns=[dict(name='Id', label='Id')])) )
        node = dict(document_id='doc', workflow_id='flow1', node_id='native-guid')
        self.request = dict(operation_id='reopened', document_id='doc', workflow_ref=new,
                            target=dict(ref=dict(node, workflow_id='flow2')),
                            parameters=dict(source=source, settings=dict(columns=[dict(name='Id', label='Id')])))
        graph = dict(nodes=['Import'], ports=[dict(node_label='Import', tids=[
            'Import;Input_Connection[0]', 'Import;Input_Var[0]', 'Import;Output_Data[0]'])], links=[])
        checkpoint = dict(path=self.path, workflow_ref=dict(tab_tid='tab1', prefix='TF1'),
                          package_identity=dict(path=''), graph=graph)
        def event(op, phase, **kwargs):
            return dict(operation_id=op, phase=phase, session_id='session', runtime_revision='pin',
                        target=dict(origin='http://loginom', loginom_build='7.4.2'), **kwargs)
        trace = [dict(event='save_requested', path=self.path), dict(event='saved_package_closed'),
                 dict(event='package_open_command_ready'), dict(event='reopened_package_observed',
                 requested_path=self.path, actual_path=self.path, path_matches=True, graph_matches=True, graph=graph),
                 dict(event='postcondition_verified', reopened=True, package_path=self.path, graph=graph)]
        outcome = dict(status='SUCCEEDED', phase='verified', cleanup_complete=True, error=None,
                       operation_id='save', action_key='package.save_as', output=dict(reopened=True,
                       package_ref=dict(kind='package', path=self.path, active_identity=self.path)), trace=trace)
        save = dict(action_key='package.save_as', action_revision='1', parameters=self.parameters, checkpoint=checkpoint)
        prep = dict(status='READY', phase='exact_workflow_ready', created_draft=False, effect_possible=False,
                    target_verified=True, package_ref=dict(path=self.path, persisted=True), document_id='doc',
                    workflow_ref=new, session_id='session', operation_id='prepare')
        self.events = [event('seed', 'node_checkpoint', result=dict(node=node)),
                       event('save', 'prepared', **save), event('save', 'completed', outcome=outcome, **save),
                       event('prepare', 'saved_package_prepared', save_operation_id='save',
                             requested_path=self.path, preparation=prep),
                       event('reopened', 'prepared', action_key='node.apply', parameters=self.request),
                       event('reopened', 'node_apply_prepared', request=self.request)]
        # No incidental shared dict references in a real JSON journal.
        self.events = copy.deepcopy(self.events)
        import json
        self.events = json.loads(json.dumps(self.events))

    def audit(self):
        return verify_saved_package_transition(self.events, self.seed, self.request, 'save', self.parameters)

    def test_exact_transition_passes_without_claiming_settings_or_output(self):
        result = self.audit()
        self.assertTrue(result['passed'], result)
        self.assertNotIn('package_persistence_verified', result)
        self.assertFalse(result['journal_authentication_verified'])

    def test_reapplying_mapping_cannot_prove_mapping_persistence(self):
        self.request['mappings']=[dict(direction='output',port=0,autosync=False)]
        self.events[-1]['request']=copy.deepcopy(self.request)
        self.assertIn('reopened_noop_patch_required',self.audit()['failures'])

    def test_missing_duplicate_or_reordered_receipts_fail(self):
        for index in range(len(self.events)):
            for variant in ('missing', 'duplicate'):
                with self.subTest(index=index, variant=variant):
                    self.setUp()
                    if variant == 'missing': self.events.pop(index)
                    else: self.events.insert(index, copy.deepcopy(self.events[index]))
                    # Top-level no-effect preflight is optional to this verifier.
                    if index == 4: continue
                    self.assertFalse(self.audit()['passed'])
        self.setUp(); self.events[1], self.events[2] = self.events[2], self.events[1]
        self.assertIn('save_reopen_order', self.audit()['failures'])

    def test_changed_identity_path_graph_runtime_and_settings_fail(self):
        changes = [
            lambda s: s.events[2]['outcome'].update(status='AMBIGUOUS'),
            lambda s: s.events[2]['outcome'].update(cleanup_complete=False),
            lambda s: s.events[2]['outcome']['output']['package_ref'].update(path='/other.lgp'),
            lambda s: s.events[2]['outcome']['trace'][3].update(actual_path='/other.lgp'),
            lambda s: s.events[2]['outcome']['trace'][3].update(graph=dict(nodes=[], ports=[], links=[])),
            lambda s: s.events[1]['checkpoint']['graph'].update(nodes=['Other']),
            lambda s: s.events[3]['preparation']['package_ref'].update(persisted=False),
            lambda s: s.events[3]['preparation'].update(created_draft=True),
            lambda s: s.events[3].update(runtime_revision='other-pin'),
            lambda s: s.events[3].update(session_id='other-session'),
            lambda s: s.request['target']['ref'].update(node_id='other-guid'),
            lambda s: s.request.update(workflow_ref=s.seed['workflow_ref']),
            lambda s: s.request['parameters']['settings']['columns'][0].update(label='Changed'),
            lambda s: s.events.insert(3, dict(operation_id='other', phase='prepared')),
            lambda s: s.events[2]['outcome']['trace'].append(dict(event='overwrite_confirmed')),
            lambda s: s.parameters.update(conflict_policy='replace'),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                self.setUp(); change(self); self.assertFalse(self.audit()['passed'])


if __name__ == '__main__':
    unittest.main()

class IntermediateSavedPackageTests(unittest.TestCase):
    def setUp(self):
        base=SavedPackageTransitionTests();base.setUp()
        self.events,self.seed,self.request,self.parameters=base.events,base.seed,base.request,base.parameters
        path=base.path
        for e in self.events[1:3]:e['action_key']='package.save_checkpoint'
        outcome=self.events[2]['outcome'];outcome['action_key']='package.save_checkpoint'
        outcome['output'].update(reopened=False,workflow_preserved=True,save_completed=True,persisted_content_verified=False)
        graph=self.events[1]['checkpoint']['graph'];old=self.seed['workflow_ref'];new=self.request['workflow_ref']
        flow={k:old[k] for k in ('prefix','tab_tid')}
        outcome['trace']=[dict(event='save_requested',path=path),dict(event='save_flow_completed',path=path),
            dict(event='open_saved_package_observed',requested_path=path,actual_path=path,workflow_ref=flow,
                 workflow_matches=True,path_matches=True,graph_matches=True,graph=graph),
            dict(event='postcondition_verified',proof='awaited_save_flow_same_open_workflow',package_path=path,
                 graph=graph,workflow_ref=flow,reopened=False,persisted_content_verified=False)]
        metadata={k:self.events[0][k] for k in ('session_id','runtime_revision','target')}
        qa=dict(status='SUCCEEDED',path=path,old_workflow_ref=old,closed=True,reopened=True,save_performed=False,
                trace=[dict(event='qa_menu_opened'),dict(event='qa_close_clicked'),
                       dict(event='qa_saved_package_closed',workflow_ref=old),dict(event='qa_menu_opened'),
                       dict(event='qa_open_clicked'),dict(event='qa_open_confirmed',path=path),
                       dict(event='qa_reopened_path_observed',path=path)])
        fresh=dict(status='NOT_APPLIED',phase='prepared',effect_possible=False,cleanup_complete=True,
                   checkpoint=dict(path=path,package_identity=dict(path=path),graph=graph,
                                   workflow_ref={k:new[k] for k in ('prefix','tab_tid')}))
        self.events[3:3]=[dict(metadata,operation_id='qa',phase='checkpoint_reopen_qa',save_operation_id='save',qa=qa),
                          dict(metadata,operation_id='check',phase='reopened_package_checkpoint',save_operation_id='save',checkpoint=fresh)]
        import json
        self.events=json.loads(json.dumps(self.events))

    def audit(self):
        return verify_saved_package_transition(self.events,self.seed,self.request,'save',self.parameters,checkpoint_mode=True)

    def test_separate_no_resave_reopen_is_required(self):
        self.assertTrue(self.audit()['passed'],self.audit())
        self.events.pop(3)
        self.assertFalse(self.audit()['passed'])

    def test_save_as_contract_cannot_accept_checkpoint_receipt(self):
        self.assertFalse(verify_saved_package_transition(self.events,self.seed,self.request,'save',self.parameters)['passed'])

    def test_qa_resave_wrong_graph_or_changed_open_workflow_fails(self):
        changes=[
            lambda s:s.events[3]['qa'].update(save_performed=True),
            lambda s:s.events[3]['qa']['trace'].insert(0,dict(event='save_requested')),
            lambda s:s.events[4]['checkpoint']['checkpoint']['graph'].update(nodes=[]),
            lambda s:s.events[4]['checkpoint'].update(effect_possible=True),
            lambda s:s.events[4]['checkpoint']['checkpoint']['package_identity'].update(path='/other.lgp'),
            lambda s:s.events[3].update(runtime_revision='other'),
            lambda s:s.events[2]['outcome']['trace'][2].update(workflow_matches=False),
            lambda s:s.events[2]['outcome']['trace'].append(dict(event='saved_package_closed')),
            lambda s:s.events[2]['outcome']['output'].update(persisted_content_verified=True),
            lambda s:s.events[3]['qa']['trace'].pop(2),
        ]
        for index,change in enumerate(changes):
            with self.subTest(index=index):
                self.setUp();change(self);self.assertFalse(self.audit()['passed'])
