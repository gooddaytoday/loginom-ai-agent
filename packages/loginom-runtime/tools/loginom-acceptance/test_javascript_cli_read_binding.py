"""Actual compact/read-request producers and SQLite, without model/browser runs.

These fixtures prove delivery binding only. Native execution/Table/business and
whole CLI acceptance require the separate auditors and fresh candidate trials.
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
from javascript_cli_nodes import verify_cli_node_binding
import test_javascript_cli_nodes


PRODUCER = '''
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {createUserWorkflowBindings}=await import(pathToFileURL(process.argv[1]+'/user-workflow.mjs'));
const {buildNodeReadRequest}=await import(pathToFileURL(process.argv[1]+'/node-read-contract.mjs'));
const {compactNodeResult}=await import(pathToFileURL(process.argv[1]+'/user-results.mjs'));
const input=JSON.parse(readFileSync(0,'utf8'));
const expanded=buildNodeReadRequest(createUserWorkflowBindings().expandNodeRead(input.args),input.source);
const reply=compactNodeResult({operation_id:input.args.operation_id,attempt:1,state:'settled',outcome:input.outcome,error:null});
console.log(JSON.stringify({expanded,reply}));
'''


class JavascriptCliReadBindingTests(unittest.TestCase):
    def setUp(self):
        self.nodes = test_javascript_cli_nodes.JavascriptCliNodeTests(methodName='runTest')
        self.nodes.setUp()
        self.addCleanup(self.nodes.doCleanups)
        source = self.nodes.checkpoint
        text = self.nodes.args['parameters']['source_text']
        names = ('finish','output_mapping','node_finish','materialization_execute','execute')
        source['phases'] = [dict(phase=name,receipt_id='js:'+name,status='verified') for name in names]
        source['configuration']['readback'].update(scope='observed_after_verified_finish',values_are='independent_owned_source_readback',
            node=copy.deepcopy(source['node']),schema_mode='code',settings_preserved=True,wizard_commit_verified=True,
            receipt_ids=['js:'+name for name in names],execution_effects=dict(explicit_execute_requested=True,internal_execution_started=None),
            source=dict(sha256=hashlib.sha256(text.encode()).hexdigest(),utf8_bytes=len(text.encode()),lf_lines=text.count('\n')+1),
            output_mapping=dict(port=0,fields=[dict(source['output']['ports'][0]['schema'][0],source_name='Value')]))
        generated = self.nodes.produce()
        self.nodes.apply['state']['output'] = json.dumps(generated['reply'])
        self.nodes.native[2]['result'] = copy.deepcopy(source)
        self.nodes.native[3]['outcome'] = copy.deepcopy(self.nodes.outcome)
        self.args = dict(operation_id='read',source_operation_id='js',read=dict(ports=[0],sample_rows=100,require_exact_numbers=True))
        self.checkpoint = copy.deepcopy(source)
        self.checkpoint.update(operation_id='read',configuration=dict(status='not_requested'))
        self.checkpoint['execution']['execution_id'] = 'fresh-read-exec'
        self.checkpoint['output']['execution_id'] = 'fresh-read-exec'
        self.checkpoint['output']['ports'][0]['execution_id'] = 'fresh-read-exec'
        metadata = source['configuration']['readback']['source']
        self.checkpoint['output']['javascript_source'] = dict(source_operation_id='js',source_sha256=metadata['sha256'],
            source_utf8_bytes=metadata['utf8_bytes'],source_lf_lines=metadata['lf_lines'],settings_sha256='c'*64)
        self.outcome = dict(self.nodes.outcome,operation_id='read',output=self.checkpoint)
        generated = self.produce()
        self.part = copy.deepcopy(self.nodes.apply)
        self.part.update(id='read',callID='read-call',tool='loginom_dock_node_read')
        self.part['state'].update(input=copy.deepcopy(self.args),output=json.dumps(generated['reply']),time=dict(start=1300,end=1350))
        header = {k:self.nodes.native[0][k] for k in ('session_id','runtime_revision','manifest_sha256','target')}
        self.rows = [dict(header,operation_id='read',phase='node_apply_prepared',request=generated['expanded']),
            dict(header,operation_id='read',phase='node_checkpoint',result=self.checkpoint),
            dict(header,operation_id='read',phase='completed',outcome=self.outcome)]
        self.nodes.native.extend(self.rows)
        self.nodes.fixture.events.append(dict(type='tool_use',timestamp=1351,sessionID='own-session',part=self.part))

    def produce(self):
        node = os.environ.get('LOGINOM_NODE') or shutil.which('node')
        self.assertIsNotNone(node)
        result = subprocess.run([node,'--input-type=module','-e',PRODUCER,str(Path(__file__).resolve().parents[2]/'client/lib')],
            input=json.dumps(dict(args=self.args,source=dict(parameters=self.nodes.native[1]['request'],outcome=self.nodes.outcome),outcome=self.outcome)),
            text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        return json.loads(result.stdout)

    def audit(self,source='js'):
        self.nodes.synchronize()
        f = self.nodes.fixture
        transport = verify_cli_delivery(f.events,f.projection(),f.expected,submitted_at=1000,deadline_at=1801000,directory=f.directory)
        self.assertTrue(transport['passed'],transport)
        return verify_cli_node_binding(f.events,self.nodes.native,'read',self.nodes.expected,source_operation_id=source)

    def test_actual_request_reply_and_sqlite_bind_only_read_delivery(self):
        result = self.audit()
        self.assertTrue(result['passed'],result)
        for key in ('business_output_verified','model_code_semantics_verified','persistence_verified','cli_acceptance_verified'):
            self.assertIs(result[key],False)
        self.assertEqual(self.rows[0]['request']['budgets']['total_ms'],600000)

    def test_read_requires_explicit_different_pinned_source_operation(self):
        for source in (None,'','read','foreign'):
            with self.subTest(source=source):self.assertFalse(self.audit(source)['passed'])

    def test_changed_model_arguments_or_host_budget_refuse(self):
        original = copy.deepcopy(self.part['state']['input'])
        for change in (dict(source_operation_id='foreign'),dict(budget_ms=1),dict(kind='source'),
                dict(read=dict(ports=[1])),dict(read=dict(ports=[False])),dict(read=dict(sample_rows=5)),dict(read=dict(require_exact_numbers=1)),
                dict(read=dict(coverage='full'))):
            self.part['state']['input'] = original | change
            with self.subTest(change=change):self.assertFalse(self.audit()['passed'])

    def test_native_source_owner_schema_digest_budget_or_runtime_refuse(self):
        original = copy.deepcopy(self.rows[0])
        for mutation in ('source','owner','schema','sha','budget','runtime'):
            self.rows[0].clear();self.rows[0].update(copy.deepcopy(original))
            request = self.rows[0]['request']
            if mutation == 'source':request['parameters']['source_operation_id'] = 'foreign'
            if mutation == 'owner':request['target']['ref']['node_id'] = 'foreign'
            if mutation == 'schema':request['parameters']['schemas'][0]['schema'][0]['type'] = 'string'
            if mutation == 'sha':request['parameters']['javascript_source']['source_sha256'] = '0'*64
            if mutation == 'budget':request['budgets']['total_ms'] += 1
            if mutation == 'runtime':self.rows[0]['runtime_revision'] = '0'*64
            with self.subTest(mutation=mutation):self.assertFalse(self.audit()['passed'])

    def test_unverified_or_changed_retained_configuration_refuse(self):
        original = copy.deepcopy(self.nodes.native[3]['outcome']['output'])
        for mutation in ('scope','owner','receipts','status','settings','mapping','boolean_port','extra_mapping','missing_execution_claim'):
            prior = copy.deepcopy(original)
            rb = prior['configuration']['readback']
            if mutation == 'scope':rb['scope'] = 'observed_before_verified_finish'
            if mutation == 'owner':rb['node']['node_id'] = 'foreign'
            if mutation == 'receipts':rb['receipt_ids'].pop()
            if mutation == 'status':prior['phases'][0]['status'] = 'pending'
            if mutation == 'settings':rb['settings_preserved'] = False
            if mutation == 'mapping':rb['output_mapping']['fields'][0]['excluded'] = True
            if mutation == 'boolean_port':rb['output_mapping']['port'] = False
            if mutation == 'extra_mapping':rb['output_mappings'] = None
            if mutation == 'missing_execution_claim':del rb['execution_effects']['internal_execution_started']
            self.nodes.native[2]['result'] = prior
            self.nodes.native[3]['outcome']['output'] = prior
            # Coherent source public/native change still cannot make the retained
            # configuration meet the independent read admission contract.
            self.nodes.checkpoint = prior;self.nodes.outcome['output'] = prior
            self.nodes.apply['state']['output'] = json.dumps(self.nodes.produce()['reply'])
            with self.subTest(mutation=mutation):self.assertFalse(self.audit()['passed'])

    def test_missing_native_receipt_controller_only_read_or_duplicate_admission_refuse(self):
        original = list(self.nodes.native)
        for change in ('controller_only','missing_checkpoint','duplicate'):
            self.nodes.native = list(original)
            if change == 'controller_only':self.nodes.fixture.events.pop()
            if change == 'missing_checkpoint':self.nodes.native.remove(self.rows[1])
            if change == 'duplicate':self.nodes.native.append(copy.deepcopy(self.rows[0]))
            with self.subTest(change=change):self.assertFalse(self.audit()['passed'])
            if change == 'controller_only':self.nodes.fixture.events.append(dict(type='tool_use',timestamp=1351,sessionID='own-session',part=self.part))

    def test_delivered_cell_type_null_or_complete_flag_cannot_differ_from_native(self):
        original = self.part['state']['output']
        for mutation in ('value','type','null','complete'):
            reply = json.loads(original)
            port = reply['output']['ports'][0]
            if mutation == 'value':port['sample'][0][0]['value'] = 2
            if mutation == 'type':port['sample'][0][0]['type'] = 'string'
            if mutation == 'null':port['sample'][0][0]['is_null'] = True
            if mutation == 'complete':port['sample_complete'] = False
            self.part['state']['output'] = json.dumps(reply)
            with self.subTest(mutation=mutation):self.assertFalse(self.audit()['passed'])

    def test_stale_read_identity_or_read_before_source_terminal_refuse(self):
        original_rows = list(self.nodes.native)
        original_checkpoint = copy.deepcopy(self.checkpoint)
        original_part = copy.deepcopy(self.part)
        for change in ('stale','order','public_time'):
            self.nodes.native = list(original_rows)
            self.checkpoint.clear();self.checkpoint.update(copy.deepcopy(original_checkpoint))
            self.part.clear();self.part.update(copy.deepcopy(original_part))
            self.assertTrue(self.audit()['passed'],self.audit())
            if change == 'stale':
                self.checkpoint['execution']['execution_id'] = 'exec'
                self.checkpoint['output']['execution_id'] = 'exec'
                self.checkpoint['output']['ports'][0]['execution_id'] = 'exec'
                self.part['state']['output'] = json.dumps(self.produce()['reply'])
            if change == 'order':self.nodes.native[3],self.nodes.native[4] = self.nodes.native[4],self.nodes.native[3]
            if change == 'public_time':self.part['state']['time']['start'] = 1270
            with self.subTest(change=change):self.assertFalse(self.audit()['passed'])

    def test_actual_read_defaults_and_declared_retained_schema_are_supported(self):
        self.args['read'] = {}
        generated = self.produce()
        self.part['state'].update(input=copy.deepcopy(self.args),output=json.dumps(generated['reply']))
        self.rows[0]['request'] = generated['expanded']
        self.assertTrue(self.audit()['passed'],self.audit())
        self.assertEqual(self.rows[0]['request']['read'],dict(ports=[0],sample_rows=10,require_exact_numbers=False))
        self.nodes.args['parameters']['schema_mode'] = 'declared'
        self.nodes.checkpoint['configuration']['readback']['schema_mode'] = 'declared'
        generated_source = self.nodes.produce()
        self.nodes.native[1]['request'] = generated_source['expanded']
        self.nodes.native[2]['result'] = copy.deepcopy(self.nodes.checkpoint)
        self.nodes.native[3]['outcome'] = copy.deepcopy(self.nodes.outcome)
        self.nodes.apply['state']['input'] = copy.deepcopy(self.nodes.args)
        self.nodes.apply['state']['output'] = json.dumps(generated_source['reply'])
        self.assertTrue(self.audit()['passed'],self.audit())

    def test_same_id_read_redelivery_has_one_native_admission(self):
        repeated = copy.deepcopy(self.part)
        repeated.update(id='read-retry',callID='read-retry-call')
        repeated['state']['time'] = dict(start=1360,end=1370)
        self.nodes.fixture.events.append(dict(type='tool_use',timestamp=1371,sessionID='own-session',part=repeated))
        self.assertTrue(self.audit()['passed'],self.audit())
        self.assertEqual(len([r for r in self.nodes.native if r.get('operation_id') == 'read' and r.get('phase') == 'node_apply_prepared']),1)

    def test_coherently_changed_output_source_metadata_cannot_rebind_read(self):
        original = copy.deepcopy(self.checkpoint['output']['javascript_source'])
        for key,value in [('source_operation_id','foreign'),('source_sha256','0'*64),('source_utf8_bytes',0),
                ('source_lf_lines',1024),('settings_sha256','unverified')]:
            self.checkpoint['output']['javascript_source'] = dict(original)
            self.part['state']['output'] = json.dumps(self.produce()['reply'])
            self.assertTrue(self.audit()['passed'],self.audit())
            self.checkpoint['output']['javascript_source'][key] = value
            self.part['state']['output'] = json.dumps(self.produce()['reply'])
            with self.subTest(key=key):self.assertFalse(self.audit()['passed'])


if __name__ == '__main__':unittest.main()
