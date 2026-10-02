"""Standalone admission tests bind actual SQLite/public parts to native receipts."""
import copy
import hashlib
import json
import unittest
import test_javascript_cli_evidence
from javascript_cli_admission import host_artifact_name,verify_cli_admission


class JavascriptAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_javascript_cli_evidence.StandaloneJavascriptEvidenceTests(methodName='runTest')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.expected = dict(loginom_url='http://logi-test-plan.bg.local/app/',account='jsteach',
            target=dict(profile_id='test-profile',loginom_build='7.4.2',platform='linux',browser='chromium'),
            runtime_revision='b'*64,action_manifest_sha256='a'*64)
        self.workspace = dict(status='READY',authenticated=True,created_draft=True,ownership_verified=True,target_verified=True,
            reason=None,session_id='runtime-session',operation_id='prepare',target=copy.deepcopy(self.expected['target']),
            loginom_account='jsteach',document_id='document',workflow_ref=dict(tab_tid='own-tab',prefix='MF;own',workflow_id='workflow',navigation_path=['own']),
            package_ref=dict(persisted=False,path=None),preserved_workflows=[])
        prefix = hashlib.sha256(json.dumps(['1:own-session','user'],separators=(',',':')).encode()).hexdigest()
        artifacts = []
        for index,snapshot in enumerate(self.fixture.projection()['files']):
            name = prefix+'-'+str(index)+'-'+snapshot['filename']
            artifacts.append(dict(artifact_id='artifact-'+str(index),name=name,bytes=snapshot['bytes'],sha256=snapshot['sha256'],
                upload=dict(grant_id='grant-'+str(index),directory='/jsteach',destination='/jsteach/'+name,overwrite='reject')))
        self.result = dict(prepared=True,result_version='user-v1',sessionId='runtime-session',loginomUrl=self.expected['loginom_url'],
            workspace=self.workspace,input_artifacts=artifacts,knowledge=dict(session_manifest=dict(clientRevision='b'*64,actionManifestDigest='a'*64)))
        self.part = self.fixture.tool
        self.part['tool'] = 'loginom_dock_prepare'
        self.part['state']['metadata']['generation'] = 1
        self.synchronize()
        header = dict(session_id='runtime-session',runtime_revision='b'*64,manifest_sha256='a'*64)
        self.native = [{**header,'target':None,'phase':'bootstrap_observed'},
            {**header,'target':copy.deepcopy(self.expected['target']),'event':'workspace_prepared','state':copy.deepcopy(self.workspace)}]

    def synchronize(self):
        self.part['state']['output'] = json.dumps(self.result)
        value = {k:v for k,v in self.part.items() if k not in ('id','messageID','sessionID')}
        self.fixture.connection.execute('update part set data=? where id=?',(json.dumps(value),'tool'))
        self.fixture.connection.commit()
        self.fixture.events[1]['part'] = copy.deepcopy(self.part)

    def audit(self):
        return verify_cli_admission(self.fixture.events,self.fixture.projection(),self.fixture.expected,self.native,self.expected,
            submitted_at=1000,deadline_at=1801000,directory=self.fixture.directory)

    def assert_refused(self, failure):
        proof = self.audit()
        self.assertFalse(proof['passed'],proof)
        self.assertIn(failure,proof['failures'])

    def test_actual_snapshot_host_names_and_owned_draft_bind_distinct_sessions(self):
        proof = self.audit()
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['binding']['artifacts'],2)
        self.assertEqual(proof['binding']['cli_session_id'],'own-session')
        self.assertEqual(proof['binding']['runtime_session_id'],'runtime-session')
        for key in ('journal_authenticated','uploaded_bytes_verified','import_execution_verified','candidate_use_verified','cli_acceptance_verified'):
            self.assertIs(proof[key],False)

    def test_host_name_uses_basename_and_utf16_slice_without_python_codepoint_substitution(self):
        prefix = hashlib.sha256(b'["1:own-session","user"]').hexdigest()+'-0-'
        self.assertEqual(host_artifact_name(1,'own-session','user',0,'folder\\sales.csv'),prefix+'sales.csv')
        self.assertEqual(host_artifact_name(1,'own-session','user',0,'a'*121),prefix+'a'*120)
        # JS slice(-120) may leave a lone low surrogate at the boundary.
        name = 'x'+chr(0x1f600)+'a'*119
        self.assertEqual(host_artifact_name(1,'own-session','user',0,name),prefix+'\ude00'+'a'*119)
        for name in ('','..','a/.','a/\x00bad'):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):host_artifact_name(1,'own-session','user',0,name)

    def test_private_testable_url_form_is_exact_and_never_rewritten(self):
        self.result['loginomUrl']=self.expected['loginom_url']+'?testable=true'
        self.synchronize()
        self.assertTrue(self.audit()['passed'])
        self.assertEqual(json.loads(self.part['state']['output'])['loginomUrl'],self.result['loginomUrl'])
        for suffix in ('?testable=false','?testable=true&extra=1','?testable=%74rue','#testable=true'):
            self.result['loginomUrl']=self.expected['loginom_url']+suffix
            self.synchronize()
            with self.subTest(suffix=suffix):self.assert_refused('cli_admission_owned_draft')

    def test_coherent_host_generation_change_and_plain_source_filename_refuse(self):
        self.part['state']['metadata']['generation'] = 2
        self.synchronize()
        self.assert_refused('cli_admission_host_filename_binding')
        self.part['state']['metadata']['generation'] = 1
        self.result['input_artifacts'][0]['name'] = 'sales.csv'
        self.synchronize()
        self.assert_refused('cli_admission_host_filename_binding')

    def test_coherent_artifact_bytes_digest_destination_account_or_overwrite_refuse(self):
        original = copy.deepcopy(self.result['input_artifacts'])
        for key,value in [('bytes',999),('sha256','0'*64),('artifact_id',''),('grant_id',''),
                ('directory','/foreign'),('destination','/jsteach/other'),('overwrite','replace')]:
            self.result['input_artifacts'] = copy.deepcopy(original)
            artifact = self.result['input_artifacts'][0]
            if key in ('bytes','sha256','artifact_id'):artifact[key] = value
            else:artifact['upload'][key] = value
            self.synchronize()
            with self.subTest(key=key):self.assert_refused('cli_admission_artifact_bytes_or_grant')

    def test_coherent_missing_extra_or_duplicate_artifact_grant_refuse(self):
        original = copy.deepcopy(self.result['input_artifacts'])
        for case in ('missing','extra','duplicate_artifact','duplicate_grant'):
            self.result['input_artifacts'] = copy.deepcopy(original)
            artifacts = self.result['input_artifacts']
            if case == 'missing':artifacts.pop()
            if case == 'extra':artifacts.append(copy.deepcopy(artifacts[0]))
            if case == 'duplicate_artifact':artifacts[1]['artifact_id'] = artifacts[0]['artifact_id']
            if case == 'duplicate_grant':artifacts[1]['upload']['grant_id'] = artifacts[0]['upload']['grant_id']
            self.synchronize()
            with self.subTest(case=case):self.assert_refused('cli_admission_artifact_count_or_identity')

    def test_coherent_non_owned_or_saved_prepare_refuse(self):
        original = copy.deepcopy(self.workspace)
        for key,value in [('authenticated',False),('created_draft',False),('ownership_verified',False),('target_verified',False),
                ('session_id','foreign'),('loginom_account','foreign'),('reason','unexpected'),('preserved_workflows',[dict(graph_unchanged=False)])]:
            self.result['workspace'] = copy.deepcopy(original)
            self.result['workspace'][key] = value
            self.synchronize()
            self.native[-1]['state'] = copy.deepcopy(self.result['workspace'])
            with self.subTest(key=key):self.assert_refused('cli_admission_owned_draft')
        self.result['workspace'] = copy.deepcopy(original)
        self.result['workspace']['package_ref'] = dict(persisted=True,path='/jsteach/saved.lgp')
        self.synchronize()
        self.native[-1]['state'] = copy.deepcopy(self.result['workspace'])
        self.assert_refused('cli_admission_owned_draft')

    def test_native_receipt_missing_changed_or_duplicate_refuse(self):
        original = copy.deepcopy(self.native)
        for case in ('missing','changed','duplicate'):
            self.native = copy.deepcopy(original)
            if case == 'missing':self.native.pop()
            if case == 'changed':self.native[-1]['state']['document_id'] = 'foreign'
            if case == 'duplicate':self.native.append(copy.deepcopy(self.native[-1]))
            with self.subTest(case=case):self.assert_refused('cli_admission_native_prepare_receipt')

    def test_native_owner_runtime_manifest_target_and_pre_ready_effect_refuse(self):
        original = copy.deepcopy(self.native)
        for key,value in [('session_id','foreign'),('runtime_revision','foreign'),('manifest_sha256','0'*64)]:
            self.native = copy.deepcopy(original)
            self.native[-1][key] = value
            with self.subTest(key=key):self.assert_refused('cli_admission_native_runtime_owner')
        self.native = copy.deepcopy(original)
        self.native[-1]['target']['profile_id'] = 'foreign'
        self.assert_refused('cli_admission_native_target_binding')
        self.native = copy.deepcopy(original)
        self.native[0]['phase'] = 'node_apply_prepared'
        self.assert_refused('cli_admission_effect_before_ready')

    def test_public_runtime_pins_and_original_user_message_refuse(self):
        self.result['knowledge']['session_manifest']['clientRevision'] = 'foreign'
        self.synchronize()
        self.assert_refused('cli_admission_public_runtime_pins')
        self.result['knowledge']['session_manifest']['clientRevision'] = 'b'*64
        self.synchronize()
        info = dict(role='user',model=dict(providerID='openai',modelID='gpt-6.1-sol',variant='low'),time=dict(created=1001))
        self.fixture.connection.execute('insert into message values(?,?,?,?)',('extra-user','own-session',1001,json.dumps(info)))
        self.fixture.connection.commit()
        self.assert_refused('cli_admission_single_original_user')

    def test_identical_terminal_repeat_binds_once_and_changed_generation_is_detected(self):
        duplicate = copy.deepcopy(self.fixture.events[1])
        duplicate['timestamp'] += 1
        self.fixture.events.insert(2,duplicate)
        self.assertTrue(self.audit()['passed'],self.audit())
        duplicate['part']['state']['metadata']['generation'] = 2
        proof = self.audit()
        self.assertFalse(proof['passed'],proof)
        self.assertTrue(any('cli_changed_terminal_delivery' in failure for failure in proof['failures']))

    def test_missing_success_and_malformed_external_pins_refuse(self):
        original = copy.deepcopy(self.expected)
        for pin,value in [('runtime_revision',None),('action_manifest_sha256','not-a-pin')]:
            self.expected = copy.deepcopy(original)
            self.expected[pin] = value
            with self.subTest(pin=pin):self.assert_refused('cli_admission_external_runtime_pin')
        self.expected = original
        self.result['prepared'] = False
        self.synchronize()
        self.assert_refused('cli_admission_successful_prepare_missing')


if __name__ == '__main__':
    unittest.main()
