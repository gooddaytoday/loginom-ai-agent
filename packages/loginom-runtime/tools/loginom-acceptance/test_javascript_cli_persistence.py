"""Actual compactor/advice functions and SQLite; native receipts are test data.

No model/browser/persistence run is represented by these binding-only fixtures.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
from javascript_cli_evidence import verify_cli_delivery
from javascript_cli_persistence import verify_cli_last_save,verify_save_trace
import test_javascript_cli_nodes


PRODUCER = '''
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {compactActionResult}=await import(pathToFileURL(process.argv[1]+'/user-results.mjs'));
const {savedPackageStateAdvice}=await import(pathToFileURL(process.argv[1]+'/package-persistence.mjs'));
const input=JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify({reply:compactActionResult(input.outcome),advice:savedPackageStateAdvice(input.state,input.outcome)}));
'''


class JavascriptCliPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.nodes = test_javascript_cli_nodes.JavascriptCliNodeTests(methodName='runTest')
        self.nodes.setUp()
        self.addCleanup(self.nodes.doCleanups)
        self.expected = self.nodes.expected | dict(account='jsteach')
        connection = self.nodes.fixture.connection
        assistant = json.loads(connection.execute('select data from message where id=?',('assistant',)).fetchone()[0])
        assistant['time']['completed'] = 2000
        connection.execute('update message set data=? where id=?',(json.dumps(assistant),'assistant'))
        self.path = '/jsteach/allocated-task/JavaScript-unique.lgp'
        self.revisions = dict.fromkeys(('package.save_checkpoint','package.save_as'),'1')
        self.stages = []
        self.append_save()

    def append_save(self,op='save',modified=False,reopened=False,policy='fail'):
        header = {k:self.nodes.native[-1][k] for k in ('session_id','runtime_revision','manifest_sha256','target')}
        flow = {k:self.nodes.flow[k] for k in ('tab_tid','prefix')}
        graph = dict(nodes=['Script'],ports=[dict(node_label='Script',tids=['Script;Input_Data[0]','Script;Output_Data[0]'])],links=[])
        parameters = dict(path=self.path,conflict_policy=policy)
        checkpoint = dict(path=self.path,workflow_ref=flow,identity='Script',graph=graph,
            package_identity=dict(path=self.path if self.stages else '',name='Package'))
        key = 'package.save_as' if reopened else 'package.save_checkpoint'
        trace = [dict(event='save_requested',path=self.path,at_ms=1)]
        if policy == 'replace':
            trace += [dict(event='save_conflict_observed',path=self.path,at_ms=2),dict(event='overwrite_confirmed',at_ms=3)]
        trace.append(dict(event='save_flow_completed',path=self.path,at_ms=4))
        if reopened:trace += [dict(event='saved_package_closed',at_ms=5),dict(event='package_open_command_ready',at_ms=6)]
        observed = dict(event='reopened_package_observed' if reopened else 'open_saved_package_observed',at_ms=7,
            requested_path=self.path,actual_path=self.path,path_matches=True,graph_matches=True,graph=copy.deepcopy(graph))
        output = dict(package_ref=dict(kind='package',path=self.path,active_identity=self.path),reopened=reopened)
        if not reopened:
            observed.update(workflow_ref=flow,workflow_matches=True)
            continuations = [dict(document_id='document',workflow_ref=copy.deepcopy(self.nodes.flow),previous_workflow_ref=copy.deepcopy(self.nodes.flow))]
            trace.append(observed)
            trace.append(dict(event='save_continuations_observed',continuations=continuations,at_ms=8))
            trace.append(dict(event='postcondition_verified',proof='awaited_save_flow_same_open_workflow',at_ms=9,
                package_path=self.path,workflow_ref=flow,graph=copy.deepcopy(graph),reopened=False,persisted_content_verified=False))
            output.update(workflow_preserved=True,save_completed=True,persisted_content_verified=False,workflow_continuations=continuations)
        if reopened:
            trace.append(observed)
            trace.append(dict(event='postcondition_verified',at_ms=9,package_path=self.path,graph=copy.deepcopy(graph),reopened=True))
        outcome = dict(operation_id=op,action_key=key,action_revision='1',status='SUCCEEDED',phase='verified',effect_possible=True,
            cleanup_complete=True,error=None,output=output,trace=trace)
        state = dict(version=1,session_id='runtime-session',document_id='document',account='jsteach',package_path=self.path,
            modified=modified,observation='after_confirmed_save',read_only=True,persisted_content_verified=False)
        node = os.environ.get('LOGINOM_NODE') or shutil.which('node')
        self.assertIsNotNone(node)
        result = subprocess.run([node,'--input-type=module','-e',PRODUCER,str(Path(__file__).resolve().parents[2]/'client/lib')],
            input=json.dumps(dict(outcome=outcome,state=state)),text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        generated = json.loads(result.stdout)
        start = {**copy.deepcopy(header),**dict(operation_id=op,action_key=key,action_revision='1',parameters=parameters,checkpoint=checkpoint,phase='prepared')}
        end = copy.deepcopy(start) | dict(phase='completed',outcome=outcome)
        dirty = {**copy.deepcopy(header),**dict(operation_id=op,phase='saved_package_state_observed',state=state,advice=generated['advice'])}
        part = copy.deepcopy(self.nodes.apply)
        part.update(id=op,callID=op+'-call',tool='loginom_dock_action_run')
        part['state'].update(input=dict(operation_id=op,action_key=key,parameters=copy.deepcopy(parameters)),
            output=json.dumps(generated['reply'])+'\n\n'+json.dumps(generated['advice']),
            time=dict(start=1300+100*len(self.stages),end=1350+100*len(self.stages)))
        self.nodes.native.extend([start,end,dirty])
        self.nodes.fixture.events.append(dict(type='tool_use',timestamp=part['state']['time']['end']+1,sessionID='own-session',part=part))
        self.stages.append(dict(start=start,end=end,dirty=dirty,part=part,reply=generated['reply']))

    def audit(self):
        self.nodes.synchronize()
        fixture = self.nodes.fixture
        transport = verify_cli_delivery(fixture.events,fixture.projection(),fixture.expected,
            submitted_at=1000,deadline_at=1801000,directory=fixture.directory)
        self.assertTrue(transport['passed'],transport)
        return verify_cli_last_save(fixture.events,self.nodes.native,'js',self.path,self.revisions,self.expected)

    def assert_refused(self,reason):
        result = self.audit()
        self.assertFalse(result['passed'],result)
        self.assertIn(reason,result['failures'])

    def rewrite_reply(self,stage=None):
        stage = stage or self.stages[-1]
        stage['part']['state']['output'] = json.dumps(stage['reply'])+'\n\n'+json.dumps(stage['dirty']['advice'])

    def test_one_actual_checkpoint_and_clean_advice_pass_only_partial_scope(self):
        proof = self.audit()
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['save_operation_id'],'save')
        for key in ('native_guid_graph_verified','settings_persistence_verified','cold_persistence_verified','process_cleanup_verified','cli_acceptance_verified'):
            self.assertIs(proof[key],False)

    def test_dirty_save_then_new_same_owned_checkpoint_pass(self):
        # Rebuild through actual advice producer, preserving the source receipts.
        self.nodes.native = self.nodes.native[:4]
        self.nodes.fixture.events = self.nodes.fixture.events[:2]
        self.stages = []
        self.append_save(modified=True)
        self.append_save(op='final',policy='replace')
        self.assertTrue(self.audit()['passed'],self.audit())

    def test_save_as_not_required_but_matching_reopen_receipt_supported(self):
        self.nodes.native = self.nodes.native[:4]
        self.nodes.fixture.events = self.nodes.fixture.events[:2]
        self.stages = []
        self.append_save(reopened=True)
        self.assertTrue(self.audit()['passed'],self.audit())

    def test_final_dirty_or_missing_observation_refuse(self):
        original = copy.deepcopy(self.nodes.native)
        stage = self.stages[0]
        stage['dirty']['state']['modified'] = True
        stage['dirty']['advice']['modified'] = True
        stage['dirty']['advice']['next_step'] = dict(tool='dock_action_run',arguments=dict(action_key='package.save_checkpoint',parameters=dict(path=self.path,conflict_policy='replace')),instruction='Use NEW operation_id')
        self.rewrite_reply()
        self.assert_refused('cli_save_final_dirty_or_unavailable')
        self.nodes.native = original[:-1]
        self.assert_refused('cli_save_native_receipt_order_or_pin')

    def test_unknown_or_falsely_persisted_public_advice_refuse(self):
        original = self.stages[0]['part']['state']['output']
        for case in ('unavailable','no-advice','persistence','extra-text','extra-block'):
            stage = self.stages[0]
            stage['part']['state']['output'] = original
            if case == 'unavailable':stage['part']['state']['output'] = json.dumps(stage['reply'])+'\n\n'+json.dumps(dict(kind='dock_saved_package_state',modified=None,state='unavailable'))
            if case == 'no-advice':stage['part']['state']['output'] = json.dumps(stage['reply'])
            if case == 'persistence':
                advice = copy.deepcopy(stage['dirty']['advice']) | dict(persisted_content_verified=True)
                stage['part']['state']['output'] = json.dumps(stage['reply'])+'\n\n'+json.dumps(advice)
            if case == 'extra-text':stage['part']['state']['output'] += '\n\nnot a JSON receipt'
            if case == 'extra-block':stage['part']['state']['output'] += '\n\n{}'
            with self.subTest(case=case):self.assertFalse(self.audit()['passed'])

    def test_external_path_account_and_catalog_pins_refuse(self):
        path = self.path
        for changed in ('/test-4/foreign.lgp','/jsteach/../escape.lgp','/jsteach/a\\b.lgp','/jsteach/a//x.lgp'):
            self.path = changed
            with self.subTest(path=changed):self.assert_refused('cli_save_external_path_catalog_pin')
        self.path = path
        self.revisions['package.save_checkpoint'] = 'unverified-revision'
        self.assert_refused('cli_save_native_contract_binding')

    def test_native_runtime_pin_order_duplicate_or_unknown_operation_refuse(self):
        original = copy.deepcopy(self.nodes.native)
        for case in ('runtime','target','order','duplicate','unknown'):
            self.nodes.native = copy.deepcopy(original)
            if case == 'runtime':self.nodes.native[-1]['runtime_revision'] = '0'*64
            if case == 'target':self.nodes.native[-1]['target']['profile_id'] = 'foreign'
            if case == 'order':self.nodes.native[-2],self.nodes.native[-3] = self.nodes.native[-3],self.nodes.native[-2]
            if case == 'duplicate':self.nodes.native.append(copy.deepcopy(self.nodes.native[4]))
            if case == 'unknown':self.nodes.native.append(copy.deepcopy(self.nodes.native[5]) | dict(operation_id='unknown'))
            with self.subTest(case=case):self.assertFalse(self.audit()['passed'])

    def test_public_args_receipt_continuation_or_claims_change_refuse(self):
        original = copy.deepcopy(self.stages[0])
        for case in ('path','key','extra-arg','reopened','complete','persisted','continuation','workflow','bool'):
            stage = self.stages[0]
            stage['part']['state']['input'] = copy.deepcopy(original['part']['state']['input'])
            stage['reply'] = copy.deepcopy(original['reply'])
            if case == 'path':stage['part']['state']['input']['parameters']['path'] = '/jsteach/foreign.lgp'
            if case == 'key':stage['part']['state']['input']['action_key'] = 'package.save_as'
            if case == 'extra-arg':stage['part']['state']['input']['budget_ms'] = 1
            if case == 'reopened':stage['reply']['output']['reopened'] = True
            if case == 'complete':stage['reply']['output']['save_completed'] = False
            if case == 'persisted':stage['reply']['output']['persisted_content_verified'] = True
            if case == 'continuation':stage['reply']['output']['workflow_continuations'][0]['document_id'] = 'foreign'
            if case == 'workflow':stage['reply']['output']['workflow_continuations'][0]['workflow_ref']['prefix'] = 'foreign'
            if case == 'bool':stage['reply']['cleanup_complete'] = 1
            self.rewrite_reply()
            with self.subTest(case=case):self.assertFalse(self.audit()['passed'])

    def test_dirty_native_identity_and_typed_boolean_refuse(self):
        original = copy.deepcopy(self.stages[0]['dirty'])
        for case in ('session','document','account','path','number','version','read_only','persistence','observed'):
            stage = self.stages[0]
            stage['dirty'].clear();stage['dirty'].update(copy.deepcopy(original))
            state = stage['dirty']['state']
            field = dict(session='session_id',document='document_id',account='account',path='package_path',number='modified',version='version',read_only='read_only',persistence='persisted_content_verified',observed='observation')[case]
            state[field] = 0 if case == 'number' else True if case in ('version','persistence') else False if case == 'read_only' else 'foreign'
            with self.subTest(case=case):self.assert_refused('cli_save_dirty_state_binding')

    def test_replace_foreign_unsaved_path_never_authorized(self):
        stage = self.stages[0]
        for parameters in (stage['start']['parameters'],stage['end']['parameters'],stage['part']['state']['input']['parameters']):parameters['conflict_policy'] = 'replace'
        self.assert_refused('cli_save_native_path_ownership')

    def test_trace_path_graph_flags_order_time_or_missing_evidence_refuse(self):
        original = copy.deepcopy(self.stages[0]['end']['outcome']['trace'])
        for case in ('path','graph','matches','order','time','boolean-time','missing','fake-reopen'):
            trace = copy.deepcopy(original)
            if case == 'path':trace[2]['actual_path'] = '/jsteach/foreign.lgp'
            if case == 'graph':trace[2]['graph']['nodes'] = ['Other']
            if case == 'matches':trace[2]['path_matches'] = 1
            if case == 'order':trace[0],trace[1] = trace[1],trace[0]
            if case == 'time':trace[2]['at_ms'] = 0
            if case == 'boolean-time':trace[0]['at_ms'] = True
            if case == 'missing':trace.pop()
            if case == 'fake-reopen':trace.append(dict(event='saved_package_closed',at_ms=10))
            self.stages[0]['end']['outcome']['trace'] = trace
            with self.subTest(case=case):self.assertFalse(self.audit()['passed'])

    def test_mutation_after_last_save_or_new_js_before_save_refuse(self):
        later = copy.deepcopy(self.nodes.native[1])
        later['operation_id'] = 'later'
        later['request']['operation_id'] = 'later'
        self.nodes.native.append(later)
        self.assert_refused('cli_save_later_mutation_requires_checkpoint')
        self.nodes.native.pop()
        self.nodes.native.insert(4,later)
        self.assert_refused('cli_save_later_javascript_source')

    def test_identical_delivery_and_same_id_retry_no_new_native_save(self):
        event = self.nodes.fixture.events[-1]
        self.nodes.fixture.events.append(copy.deepcopy(event))
        self.assertTrue(self.audit()['passed'],self.audit())
        retry = copy.deepcopy(event)
        retry['part'].update(id='retry',callID='retry-call')
        retry['part']['state']['time'] = dict(start=1360,end=1370)
        retry['timestamp'] = 1371
        self.nodes.fixture.events.append(retry)
        self.nodes.native.append(copy.deepcopy(self.stages[0]['dirty']))
        self.assertTrue(self.audit()['passed'],self.audit())
        self.nodes.native.append(copy.deepcopy(self.stages[0]['start']))
        self.assert_refused('cli_save_operation_coverage')

    def test_public_verification_optional_but_when_delivered_must_bind(self):
        stage = self.stages[0]
        verification = dict(kind='dock_outcome_verification',operation_id='save',domain_effect=dict(state='verified',kind='save'))
        row = {k:stage['dirty'][k] for k in ('session_id','runtime_revision','manifest_sha256','target')}
        row.update(operation_id='save',phase='verification_delivered',verification=verification)
        self.nodes.native.append(row)
        stage['part']['state']['output'] += '\n\n'+json.dumps(verification)
        self.assertTrue(self.audit()['passed'],self.audit())
        row['verification'] = verification | dict(operation_id='foreign')
        self.assert_refused('cli_save_public_verification_binding')

    def test_coherent_rendered_graph_change_does_not_claim_guid_persistence(self):
        stage = self.stages[0]
        for checkpoint in (stage['start']['checkpoint'],stage['end']['checkpoint']):checkpoint['graph']['links'] = ['rendered-only-link']
        for row in stage['end']['outcome']['trace']:
            if 'graph' in row:row['graph']['links'] = ['rendered-only-link']
        proof = self.audit()
        self.assertTrue(proof['passed'],proof)
        self.assertIs(proof['native_guid_graph_verified'],False)

    def test_save_publicly_predating_js_completion_refuse(self):
        self.stages[0]['part']['state']['time'] = dict(start=1250,end=1350)
        self.assert_refused('cli_save_public_source_order')

    def test_dirty_observation_after_next_save_admission_refuse(self):
        self.append_save(op='final',policy='replace')
        first_dirty = self.nodes.native.pop(6)
        self.nodes.native.insert(7,first_dirty)
        self.assert_refused('cli_save_native_stage_overlap')

    def test_coherently_changed_native_continuation_identity_refuse(self):
        outcome = self.stages[0]['end']['outcome']
        outcome['output']['workflow_continuations'][0]['previous_workflow_ref']['workflow_id'] = 'foreign'
        self.assert_refused('cli_save_native_continuations')

    def test_immutable_headed_checkpoint_trace_without_invented_dirty_receipt(self):
        capture = os.environ.get('LOGINOM_JS_SAVE_CAPTURE')
        if not capture:self.skipTest('Private immutable headed capture not configured')
        data = Path(capture).read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(),'23540874ab56ec6d95fc674d3568ef701fecb520788a09f502d500b17a43ca74')
        events = [json.loads(line) for line in data.splitlines() if line.strip()]
        starts = [r for r in events if r.get('phase') == 'prepared' and r.get('action_key') == 'package.save_checkpoint']
        self.assertEqual(len(starts),1)
        start = starts[0]
        ends = [r for r in events if r.get('phase') == 'completed' and r.get('operation_id') == start['operation_id']]
        self.assertEqual(len(ends),1)
        selected,conflicts,overwrites = verify_save_trace(ends[0]['outcome'],start['checkpoint'])
        self.assertEqual(len(selected),4)
        self.assertEqual(conflicts,[])
        self.assertEqual(overwrites,[])
        # This older private collector did not observe the generic bridge read.
        self.assertFalse(any(r.get('phase') == 'saved_package_state_observed' for r in events))


if __name__ == '__main__':unittest.main()
