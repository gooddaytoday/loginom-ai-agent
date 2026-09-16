"""Synthetic save-contract negatives; output checks are isolated, never acceptance evidence."""
import copy
import unittest
from unittest.mock import patch
from replacement_persistence_evidence import verify_persistence


class PersistenceStagesTests(unittest.TestCase):
    def setUp(self):
        self.path = '/test-2/packages/result.lgp'
        self.graph = dict(nodes=['Typed'], ports=[], links=[])
        self.flow = dict(tab_tid='tab1', prefix='flow1')
        self.newflow = dict(tab_tid='tab2', prefix='flow2')
        self.identity = dict(session_id='s', runtime_revision='r', manifest_sha256='m', target={'build': '7.4.2'})
        self.before = dict(operation_id='before', workflow_ref=self.flow, document_id='doc')
        node = dict(node_id='n', document_id='doc', workflow_id='new')
        self.after = dict(operation_id='after', workflow_ref=self.newflow, document_id='doc', target={'ref': node}, parameters={}, mappings=[], finish='execute')
        self.preparation = dict(status='READY', created_draft=False, package_ref=dict(path=self.path, persisted=True), document_id='doc', workflow_ref=self.newflow, session_id='s')
        self.cps = {'before': dict(node=dict(node, workflow_id='old'), execution={'execution_id':'e1'}), 'after': dict(node=node, execution={'execution_id':'e2'})}
        draft = dict(status='READY', created_draft=True, ownership_verified=True, session_id='s', document_id='doc', workflow_ref=self.flow, package_ref=dict(path=None, persisted=False, name='Package1'))
        self.events = [dict(self.identity, event='workspace_prepared', state=draft), dict(self.identity, operation_id='before', phase='node_checkpoint')]
        self.revisions = {'package.save_checkpoint':'2', 'package.save_as':'2'}
        for reopened, op, key in [(False, 'save1', 'package.save_checkpoint'), (True, 'save2', 'package.save_as')]:
            params = dict(path=self.path, conflict_policy='replace' if reopened else 'fail')
            cp = dict(path=self.path, graph=self.graph, workflow_ref=self.flow, package_identity=dict(path=self.path if reopened else '', name='Saved' if reopened else 'Package1'))
            names = (['save_requested','save_conflict_observed','overwrite_confirmed','save_flow_completed','saved_package_closed','package_open_command_ready','reopened_package_observed','postcondition_verified'] if reopened else ['save_requested','save_flow_completed','open_saved_package_observed','postcondition_verified'])
            trace = [dict(event=name) for name in names]
            for t in trace:
                if t['event']=='save_conflict_observed':t['path']=self.path
                if t['event'] in ['open_saved_package_observed','reopened_package_observed']:
                    t.update(actual_path=self.path, requested_path=self.path, path_matches=True, graph_matches=True, graph=self.graph)
                if t['event']=='postcondition_verified':t.update(graph=self.graph,package_path=self.path,reopened=reopened)
            outcome = dict(status='SUCCEEDED', operation_id=op, action_key=key, phase='verified', cleanup_complete=True, error=None, output=dict(package_ref=dict(kind='package',path=self.path,active_identity=self.path),reopened=reopened),trace=trace)
            for phase in ['prepared','completed']:
                self.events.append(copy.deepcopy(dict(self.identity, operation_id=op, action_key=key, action_revision='2', phase=phase, parameters=params, checkpoint=cp, **({'outcome':outcome} if phase=='completed' else {}))))
        self.events.append(dict(self.identity,operation_id='after',phase='node_apply_prepared'))

    def check(self):
        with patch('replacement_persistence_evidence.audit', return_value={'passed':True}), patch('replacement_persistence_evidence.checkpoint', side_effect=lambda es,op:self.cps[op]), patch('replacement_persistence_evidence.settings', return_value={}):
            return verify_persistence(self.events,self.before,self.after,{},self.graph,self.path,self.preparation,['save1','save2'],revisions=self.revisions)

    def mutate_rows(self, stage, callback):
        for e in self.events:
            if e.get('operation_id')==stage:callback(e)

    def reject(self):self.assertFalse(self.check()['passed'], self.check())
    def test_valid_draft_then_exact_overwrite(self):self.assertTrue(self.check()['passed'],self.check())
    def test_wrong_policy_each_stage(self):
        for stage, policy in [('save1','replace'),('save2','fail')]:
            with self.subTest(stage=stage):
                original=copy.deepcopy(self.events);self.mutate_rows(stage,lambda e:e['parameters'].update(conflict_policy=policy));self.reject();self.events=original
    def test_empty_or_foreign_second_path(self):
        for path in ['', '/foreign.lgp']:
            with self.subTest(path=path):
                original=copy.deepcopy(self.events);self.mutate_rows('save2',lambda e:e['checkpoint']['package_identity'].update(path=path));self.reject();self.events=original
    def test_prepared_completed_parameters_differ(self):
        self.events[3]['parameters']['conflict_policy']='replace';self.reject()
    def test_prepared_completed_checkpoint_differ(self):
        self.events[3]['checkpoint']['identity']='different';self.reject()
    def test_foreign_graph_each_stage(self):
        for stage in ['save1','save2']:
            original=copy.deepcopy(self.events);self.mutate_rows(stage,lambda e:e['checkpoint'].update(graph=dict(nodes=['Other'],ports=[],links=[])));self.reject();self.events=original
    def test_missing_each_native_trace_event(self):
        for index in [3,5]:
            original=copy.deepcopy(self.events)
            for pos in range(len(original[index]['outcome']['trace'])):
                with self.subTest(stage=index,event=pos):
                    self.events=copy.deepcopy(original);self.events[index]['outcome']['trace'].pop(pos);self.reject()
            self.events=original
    def test_reordered_each_adjacent_native_trace_event(self):
        for index in [3,5]:
            original=copy.deepcopy(self.events)
            for pos in range(len(original[index]['outcome']['trace'])-1):
                with self.subTest(stage=index,event=pos):
                    self.events=copy.deepcopy(original);trace=self.events[index]['outcome']['trace'];trace[pos],trace[pos+1]=trace[pos+1],trace[pos];self.reject()
            self.events=original
    def test_initial_draft_substitution(self):
        for field,value in [('name','Other'),('path','/foreign.lgp'),('persisted',True)]:
            original=copy.deepcopy(self.events);self.events[0]['state']['package_ref'][field]=value;self.reject();self.events=original
        self.mutate_rows('save1',lambda e:e['checkpoint']['package_identity'].update(name='Other'));self.reject()
    def test_draft_owner_or_identity_substitution(self):
        for field,value in [('ownership_verified',False),('created_draft',False),('session_id','foreign'),('document_id','foreign')]:
            original=copy.deepcopy(self.events);self.events[0]['state'][field]=value;self.reject();self.events=original
    def test_first_success_path_substitution(self):
        self.events[3]['outcome']['output']['package_ref']['path']='/foreign.lgp';self.reject()
    def test_second_workflow_substitution(self):
        self.mutate_rows('save2',lambda e:e['checkpoint'].update(workflow_ref=self.newflow));self.reject()
    def test_foreign_runtime_session_manifest_target(self):
        for field in self.identity:
            original=copy.deepcopy(self.events);self.mutate_rows('save2',lambda e:e.update({field:'foreign'}));self.reject();self.events=original
    def test_duplicate_or_reordered_receipts(self):
        original=copy.deepcopy(self.events);self.events.insert(3,copy.deepcopy(self.events[2]));self.reject()
        self.events=original;self.events[3],self.events[4]=self.events[4],self.events[3];self.reject()
    def test_overwrite_in_first_stage(self):
        self.events[3]['outcome']['trace'].insert(1,dict(event='overwrite_confirmed'));self.reject()
    def test_stale_execution(self):
        self.cps['after']['execution']['execution_id']='e1';self.reject()
    def test_reopen_settings_arguments(self):
        self.after['parameters']={'changed':True};self.reject()


if __name__=='__main__':unittest.main()
