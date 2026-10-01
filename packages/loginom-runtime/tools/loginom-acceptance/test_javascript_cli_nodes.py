"""Public receipts/defaults come from real runtime modules; SQLite stores them.

No browser, model or supplied JavaScript code is executed. Minimal native records
exercise binding only, never assert configuration/business/persistence acceptance.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
import test_javascript_cli_evidence
from javascript_cli_evidence import verify_cli_delivery
from javascript_cli_nodes import verify_cli_node_binding


PRODUCER = '''
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {createUserWorkflowBindings}=await import(pathToFileURL(process.argv[1]+'/user-workflow.mjs'));
const {compactNodeResult,compactActionResult}=await import(pathToFileURL(process.argv[1]+'/user-results.mjs'));
const input=JSON.parse(readFileSync(0,'utf8'));
const bindings=createUserWorkflowBindings();bindings.remember(input.workspace);
if(input.delivery)bindings.rememberDelivery(input.delivery.job,input.delivery.request);
if(input.continuation)bindings.remember(input.continuation);
const expanded=bindings.expandNode(input.args);
const reply=compactNodeResult({operation_id:input.args.operation_id,attempt:1,state:'settled',outcome:input.outcome,error:null});
const running=compactNodeResult({operation_id:input.args.operation_id,attempt:1,state:'running',outcome:null,error:null});
console.log(JSON.stringify({expanded,reply,running,
 deliveryReply:input.delivery?compactNodeResult(input.delivery.job):null,
 saveReply:input.save?compactActionResult(input.save):null}));
'''


class JavascriptCliNodeTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_javascript_cli_evidence.StandaloneJavascriptEvidenceTests(methodName='runTest')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.expected = dict(cli_session_id='own-session',runtime_session_id='runtime-session',runtime_revision='b'*64,
            action_manifest_sha256='a'*64,target=dict(profile_id='fixture',loginom_build='7.4.2',platform='linux',browser='chromium'))
        self.flow = dict(workflow_id='workflow',prefix='MF;TF-1',tab_tid='own-tab',navigation_path=[dict(tid='own',label='own')])
        self.workspace = dict(document_id='document',workflow_ref=self.flow,status='READY',authenticated=True,target_verified=True)
        self.args = dict(operation_id='js',contract_revision='2',document_id='document',workflow_ref={'workflow_id':'workflow'},
            target=dict(kind='new',type='programming.javascript',label='Script'),mode='script',finish='execute',inputs=[],
            parameters=dict(schema_mode='code',source_text='var value = "тест";\n'))
        self.checkpoint = dict(operation_id='js',status='SUCCEEDED',cleanup_complete=True,effect_possible=True,package_saved=False,
            node=dict(document_id='document',workflow_id='workflow',node_id='guid'),execution=dict(status='completed',execution_id='exec'),
            configuration=dict(status='applied',readback=dict(kind='javascript')),
            output=dict(status='complete',execution_id='exec',evidence_ref='native',ports=[dict(port=0,port_guid='port-guid',fresh=True,
                execution_id='exec',schema=[dict(index=0,name='Value',label='Value',type='integer',data_kind='Дискретный')],row_count=1,
                sample_rows=1,sample_complete=True,sample=[[dict(type='integer',value=1,display_text='1',precision='exact',is_null=False)]])]))
        self.outcome = dict(status='SUCCEEDED',operation_id='js',action_key='node.apply',action_revision='2',phase='node_ready',
            effect_possible=True,cleanup_complete=True,error=None,trace=[],output=self.checkpoint)
        self.prepare = copy.deepcopy(self.fixture.tool)
        self.prepare['state']['time'] = dict(start=1200,end=1230)
        self.prepare['state']['metadata']['generation'] = 1
        self.prepare['state']['output'] = json.dumps(dict(prepared=True,sessionId='runtime-session',workspace=self.workspace))
        self.apply = copy.deepcopy(self.fixture.tool)
        self.apply.update(id='apply',callID='apply-call',tool='loginom_dock_node_apply')
        self.apply['state']['time'] = dict(start=1240,end=1280)
        self.apply['state']['metadata']['generation'] = 1
        self.fixture.part('apply','assistant',{k:v for k,v in self.apply.items() if k not in ('id','messageID','sessionID')})
        self.generated = self.produce()
        self.apply['state']['input'] = copy.deepcopy(self.args)
        self.apply['state']['output'] = json.dumps(self.generated['reply'])
        header = {k:v for k,v in self.expected.items() if k not in ('cli_session_id','runtime_session_id','action_manifest_sha256')}
        header.update(session_id='runtime-session',manifest_sha256='a'*64)
        self.native = [{**header,'event':'workspace_prepared','state':copy.deepcopy(self.workspace)},
            {**header,'operation_id':'js','phase':'node_apply_prepared','request':copy.deepcopy(self.generated['expanded'])},
            {**header,'operation_id':'js','phase':'node_checkpoint','result':copy.deepcopy(self.checkpoint)},
            {**header,'operation_id':'js','phase':'completed','outcome':copy.deepcopy(self.outcome)}]
        self.fixture.events = [dict(type='tool_use',timestamp=1231,sessionID='own-session',part=self.prepare),
            dict(type='tool_use',timestamp=1281,sessionID='own-session',part=self.apply)]
        self.synchronize()

    def produce(self,delivery=None,continuation=None,save=None):
        node = os.environ.get('LOGINOM_NODE') or shutil.which('node')
        if not node:self.fail('LOGINOM_NODE or Node.js is required for actual source-module fixtures')
        library = Path(__file__).resolve().parents[2]/'client/lib'
        result = subprocess.run([node,'--input-type=module','-e',PRODUCER,str(library)],
            input=json.dumps(dict(workspace=self.workspace,args=self.args,outcome=self.outcome,delivery=delivery,continuation=continuation,save=save)),text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        return json.loads(result.stdout)

    def synchronize(self):
        seen = set()
        for event in self.fixture.events:
            part = event['part']
            if part['id'] in seen:continue
            seen.add(part['id'])
            value = {k:v for k,v in part.items() if k not in ('id','messageID','sessionID')}
            existing = self.fixture.connection.execute('select id from part where id=?',(part['id'],)).fetchone()
            if existing:self.fixture.connection.execute('update part set data=? where id=?',(json.dumps(value),part['id']))
            else:self.fixture.part(part['id'],'assistant',value)
        self.fixture.connection.commit()

    def audit(self):
        transport = verify_cli_delivery(self.fixture.events,self.fixture.projection(),self.fixture.expected,
            submitted_at=1000,deadline_at=1801000,directory=self.fixture.directory)
        self.assertTrue(transport['passed'],transport)
        return verify_cli_node_binding(self.fixture.events,self.native,'js',self.expected)

    def assert_refused(self,failure):
        proof = self.audit()
        self.assertFalse(proof['passed'],proof)
        self.assertIn(failure,proof['failures'])

    def test_actual_compact_source_request_and_reply_match_native_with_partial_scope(self):
        proof = self.audit()
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['public_source_sha256'],hashlib.sha256(self.args['parameters']['source_text'].encode()).hexdigest())
        for field in ('model_code_semantics_verified','input_upload_verified','business_output_verified','persistence_verified','cli_acceptance_verified'):
            self.assertIs(proof[field],False)

    def test_actual_explicit_read_mapping_and_declared_settings_preserved(self):
        self.args['read'] = dict(ports=[0],sample_rows=100,require_exact_numbers=True,coverage='full')
        self.args['mappings'] = [dict(port=0,direction='output',changes=[])]
        self.args['parameters']['schema_mode'] = 'declared'
        self.generated = self.produce()
        self.apply['state']['input'] = copy.deepcopy(self.args)
        self.native[1]['request'] = self.generated['expanded']
        self.synchronize()
        self.assertTrue(self.audit()['passed'],self.audit())
        self.assertEqual(self.native[1]['request']['read'],self.args['read'])
        self.assertEqual(self.native[1]['request']['mappings'],self.args['mappings'])

    def test_coherent_model_source_or_default_change_refuse(self):
        original = copy.deepcopy(self.apply['state']['input'])
        for case in ('source','default','boolean','workflow','budgets'):
            self.apply['state']['input'] = copy.deepcopy(original)
            if case == 'source':self.apply['state']['input']['parameters']['source_text'] += '// changed\n'
            if case == 'default':self.apply['state']['input']['read'] = dict(sample_rows=10)
            if case == 'boolean':self.apply['state']['input']['read'] = dict(require_exact_numbers=0)
            if case == 'workflow':self.apply['state']['input']['workflow_ref']['prefix'] = 'unissued'
            if case == 'budgets':self.apply['state']['input']['budgets'] = dict(total_ms=1)
            self.synchronize()
            with self.subTest(case=case):
                self.assert_refused('cli_node_compact_request_scope' if case in ('workflow','budgets') else 'cli_node_compact_expansion_changed')

    def test_native_receipt_pin_owner_order_or_checkpoint_corruption_refuse(self):
        original = copy.deepcopy(self.native)
        for case in ('missing','order','runtime','target','checkpoint','outcome'):
            self.native = copy.deepcopy(original)
            if case == 'missing':self.native.pop()
            if case == 'order':self.native[1],self.native[2] = self.native[2],self.native[1]
            if case == 'runtime':self.native[-1]['runtime_revision'] = '0'*64
            if case == 'target':self.native[-1]['target']['profile_id'] = 'foreign'
            if case == 'checkpoint':self.native[2]['result']['cleanup_complete'] = False
            if case == 'outcome':self.native[-1]['outcome']['output']['package_saved'] = 0
            with self.subTest(case=case):
                failure = 'cli_node_native_lifecycle_receipts' if case in ('missing','order') else 'cli_node_native_runtime_pin' if case in ('runtime','target') else 'cli_node_checkpoint_outcome_binding'
                self.assert_refused(failure)

    def test_coherent_public_node_source_execution_or_configuration_change_refuse(self):
        original = copy.deepcopy(self.generated['reply'])
        for key in ('node','execution','configuration','package_saved','effect_possible'):
            reply = copy.deepcopy(original)
            if key == 'node':reply[key]['node_id'] = 'foreign'
            if key == 'execution':reply[key]['execution_id'] = 'foreign'
            if key == 'configuration':reply[key]['status'] = 'not_requested'
            if key == 'package_saved':reply[key] = 0
            if key == 'effect_possible':reply[key] = 1
            self.apply['state']['output'] = json.dumps(reply)
            self.synchronize()
            with self.subTest(key=key):self.assert_refused('cli_node_public_checkpoint_identity')

    def test_coherent_public_cells_schema_null_precision_order_or_count_change_refuse(self):
        original = copy.deepcopy(self.generated['reply'])
        for case in ('value','boolean','schema','null','precision','count','missing'):
            reply = copy.deepcopy(original)
            port = reply['output']['ports'][0]
            if case == 'value':port['sample'][0][0]['value'] = 2
            if case == 'boolean':port['sample'][0][0]['value'] = True
            if case == 'schema':port['schema'][0]['type'] = 'string'
            if case == 'null':port['sample'][0][0]['is_null'] = True
            if case == 'precision':port['sample'][0][0]['precision'] = 'approximate'
            if case == 'count':port['row_count'] = 2
            if case == 'missing':reply['output']['ports'] = []
            self.apply['state']['output'] = json.dumps(reply)
            self.synchronize()
            with self.subTest(case=case):self.assert_refused('cli_node_public_port_schema_or_cells')

    def test_running_snapshot_then_actual_poll_settles_same_native_operation(self):
        settled = self.apply['state']['output']
        self.apply['state']['output'] = json.dumps(self.generated['running'])
        wait = copy.deepcopy(self.apply)
        wait.update(id='wait',callID='wait-call',tool='loginom_dock_node_wait')
        wait['state'].update(input=dict(operation_id='js',timeout_ms=1000),output=settled,time=dict(start=1290,end=1300))
        self.fixture.events.append(dict(type='tool_use',timestamp=1301,sessionID='own-session',part=wait))
        self.synchronize()
        self.assertTrue(self.audit()['passed'],self.audit())
        wait['state']['input']['repair'] = True
        self.synchronize()
        self.assert_refused('cli_node_poll_arguments')

    def test_pending_without_terminal_never_promotes_native_success(self):
        self.apply['state']['output'] = json.dumps(self.generated['running'])
        self.synchronize()
        self.assert_refused('cli_node_public_terminal_missing')

    def test_same_id_apply_retry_binds_one_native_admission_and_changed_retry_refuses(self):
        retry = copy.deepcopy(self.apply)
        retry.update(id='retry',callID='retry-call')
        retry['state']['time'] = dict(start=1290,end=1300)
        self.fixture.events.append(dict(type='tool_use',timestamp=1301,sessionID='own-session',part=retry))
        self.synchronize()
        self.assertTrue(self.audit()['passed'],self.audit())
        retry['state']['input']['parameters']['source_text'] += '// conflict'
        self.synchronize()
        self.assert_refused('cli_node_compact_expansion_changed')

    def test_issued_workflow_requires_exact_native_prepare_receipt(self):
        self.native[0]['state']['document_id'] = 'foreign'
        self.assert_refused('cli_node_issued_workflow_receipt')

    def test_actual_import_defaults_use_delivered_path_and_preserve_explicit_column_settings(self):
        self.args['target']['type'] = 'imports.text'
        self.args['mode'] = 'file'
        self.args['parameters'] = dict(source=dict(artifact_id='artifact',upload_operation_id='upload'),
            settings=dict(columns=[dict(name='Qty',type='integer'),dict(name='Price',type='real',label='Explicit',used=False)]))
        delivery = dict(request=dict(operation_id='delivery',artifact_id='artifact',upload_grant_id='grant'),
            job=dict(operation_id='delivery',upload_operation_id='upload',state='settled',outcome=dict(status='SUCCEEDED',
                cleanup_complete=True,upload_completion_verified=True,upload_operation_id='upload',destination='/jsteach/file.csv',bytes=5,sha256='c'*64),error=None))
        generated = self.produce(delivery=delivery)
        self.apply['state'].update(input=copy.deepcopy(self.args),output=json.dumps(generated['reply']))
        self.native[1]['request'] = generated['expanded']
        header = {k:self.native[0][k] for k in ('session_id','runtime_revision','manifest_sha256','target')}
        self.native[1:1] = [{**header,'operation_id':'delivery','phase':'artifact_delivery_prepared','artifact_id':'artifact'},
            {**header,'operation_id':'delivery','phase':'artifact_delivery_completed','result':delivery['job']['outcome']}]
        part = copy.deepcopy(self.apply)
        part.update(id='delivery',callID='delivery-call',tool='loginom_dock_artifact_deliver')
        part['state'].update(input=delivery['request'],output=json.dumps(generated['deliveryReply']),time=dict(start=1232,end=1235))
        self.fixture.events.insert(1,dict(type='tool_use',timestamp=1236,sessionID='own-session',part=part))
        self.synchronize()
        proof = self.audit()
        self.assertTrue(proof['passed'],proof)
        self.assertIs(proof['input_upload_verified'],False)
        settings = generated['expanded']['parameters']['settings']
        self.assertEqual(settings['source']['source_path'],'/jsteach/file.csv')
        self.assertEqual(settings['columns'][0]['data_kind'],'Дискретный')
        self.assertEqual(settings['columns'][1]['data_kind'],'Непрерывный')
        self.assertEqual(settings['columns'][1]['label'],'Explicit')
        self.assertIs(settings['columns'][1]['used'],False)
        self.native[2]['result']['destination'] = '/foreign/file.csv'
        self.assert_refused('cli_node_delivery_path_receipt')

    def test_actual_save_continuation_restores_current_issued_navigation(self):
        continuation = dict(document_id='document',workflow_ref={**self.flow,'navigation_path':[dict(tid='saved',label='saved')]})
        save = dict(operation_id='save',status='SUCCEEDED',action_key='package.save_checkpoint',cleanup_complete=True,
            output=dict(package_ref=dict(kind='package',path='/jsteach/fixture.lgp'),workflow_continuations=[{**continuation,'previous_workflow_ref':self.flow}]))
        generated = self.produce(continuation=continuation,save=save)
        self.apply['state']['output'] = json.dumps(generated['reply'])
        self.native[1]['request'] = generated['expanded']
        header = {k:self.native[0][k] for k in ('session_id','runtime_revision','manifest_sha256','target')}
        self.native.insert(1,{**header,'operation_id':'save','phase':'completed','action_key':'package.save_checkpoint','outcome':save})
        part = copy.deepcopy(self.apply)
        part.update(id='save',callID='save-call',tool='loginom_dock_action_run')
        part['state'].update(input=dict(operation_id='save',action_key='package.save_checkpoint',parameters=dict(path='/jsteach/fixture.lgp',conflict_policy='fail')),
            output=json.dumps(generated['saveReply'])+'\n\n'+json.dumps(dict(kind='dock_saved_package_state',modified=False)),time=dict(start=1232,end=1235))
        self.fixture.events.insert(1,dict(type='tool_use',timestamp=1236,sessionID='own-session',part=part))
        self.synchronize()
        self.assertTrue(self.audit()['passed'],self.audit())
        reply = generated['saveReply']
        reply['output']['workflow_continuations'][0]['workflow_ref']['navigation_path'][0]['tid'] = 'foreign'
        part['state']['output'] = json.dumps(reply)
        self.synchronize()
        self.assert_refused('cli_node_save_continuations')

    def test_remote_plaintext_knowledge_is_not_misparsed_as_local_receipt(self):
        part = copy.deepcopy(self.apply)
        part.update(id='knowledge',callID='knowledge-call',tool='loginom_read')
        part['state'].update(input=dict(uri='owned-source'),output='Plain text knowledge source.',time=dict(start=1232,end=1235))
        self.fixture.events.insert(1,dict(type='tool_use',timestamp=1236,sessionID='own-session',part=part))
        self.synchronize()
        self.assertTrue(self.audit()['passed'],self.audit())

    def test_actual_compactor_cell_null_and_duplicate_display_forms_bind_exactly(self):
        cases = [dict(type='string',value='same',display_text='same',precision='exact',is_null=False),
            dict(type='integer',value=None,display_text='',precision='exact',is_null=True),
            dict(type='integer',value=None,precision='exact',is_null=True)]
        for cell in cases:
            self.checkpoint['output']['ports'][0]['schema'][0]['type'] = cell['type']
            self.checkpoint['output']['ports'][0]['sample'] = [[cell]]
            self.outcome['output'] = self.checkpoint
            generated = self.produce()
            self.native[2]['result'] = copy.deepcopy(self.checkpoint)
            self.native[3]['outcome'] = copy.deepcopy(self.outcome)
            self.apply['state']['output'] = json.dumps(generated['reply'])
            self.synchronize()
            with self.subTest(cell=cell):self.assertTrue(self.audit()['passed'],self.audit())

    def test_foreign_native_prepare_header_cannot_issue_workflow(self):
        self.native[0]['session_id'] = 'foreign'
        self.assert_refused('cli_node_issued_workflow_receipt')

    def test_local_receipt_malformed_tail_or_nonobject_refuses_but_whitespace_is_valid(self):
        original = self.apply['state']['output']
        self.apply['state']['output'] = original+'\n'
        self.synchronize()
        self.assertTrue(self.audit()['passed'],self.audit())
        for text in ('[]',original+'unexpected tail'):
            self.apply['state']['output'] = text
            self.synchronize()
            with self.subTest(text=text[:2]):self.assert_refused('cli_node_public_receipt_shape')

    def test_unchecked_resume_and_malformed_external_pins_never_get_binding_pass(self):
        resume = copy.deepcopy(self.apply)
        resume.update(id='resume',callID='resume-call',tool='loginom_dock_node_resume')
        resume['state'].update(input=dict(operation_id='js'),time=dict(start=1290,end=1300))
        self.fixture.events.append(dict(type='tool_use',timestamp=1301,sessionID='own-session',part=resume))
        self.synchronize()
        self.assert_refused('cli_node_resume_requires_reconciliation_audit')
        self.expected['runtime_revision'] = None
        self.assert_refused('cli_node_external_identity_pin')


if __name__ == '__main__':
    unittest.main()
