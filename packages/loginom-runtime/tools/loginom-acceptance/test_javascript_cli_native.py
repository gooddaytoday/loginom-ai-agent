"""Actual production journal writer/Node, Linux handles and private file fixtures."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from javascript_cli_candidate import file_sha256
from javascript_cli_controller import JavascriptProcessController
from javascript_cli_native import NativeJournalWatch,attempt_directories,managed_runtime_pin
from javascript_cli_evidence import loginom_runtime_url_matches


@unittest.skipUnless(sys.platform=='linux' and os.environ.get('LOGINOM_NODE'),'pinned actual Node and Linux required')
class JavascriptNativeArtifactsTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='loginom-native-artifacts-')
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        self.profile=self.root/'profile';self.profile.mkdir(mode=0o700)
        self.runtime=self.profile/'loginom/runtime';self.runtime.mkdir(parents=True,mode=0o700)
        self.client=self.root/'client';(self.client/'lib/nested').mkdir(parents=True)
        runtime_pin=Path(__file__).resolve().parents[2]/'client/lib/runtime-pin.mjs'
        (self.client/'lib/runtime-pin.mjs').write_bytes(runtime_pin.read_bytes())
        (self.client/'lib/nested/example.mjs').write_text('export const value = 1;\n')
        (self.client/'lib/nested/example.d.ts').write_text('export declare const value: number;\n')
        for name,text in (('.node-version','24.19.0\n'),('package.json','{}\n'),('package-lock.json','{}\n')):
            (self.client/name).write_text(text)
        self.pin=managed_runtime_pin(self.client)
        self.node=dict(path=str(Path(os.environ['LOGINOM_NODE']).resolve()),
            sha256=file_sha256(Path(os.environ['LOGINOM_NODE']).resolve()))
        self.expected=dict(cli_session_id='cli-fixture',runtime_session_id='runtime-fixture',
            runtime_revision=self.pin['revision'],action_manifest_sha256='a'*64,
            account='jsteach',loginom_url='http://logi-test-plan.bg.local/app/',
            target=dict(profile_id='profile-fixture',loginom_build='7.4.2',platform='linux',browser='chromium'))
        self.attempt=self.runtime/'generations/1/chats/cli-fixture/attempts/12345678-1234-1234-1234-123456789abc'
        self.prepare=dict(prepared=True,sessionId='runtime-fixture',loginomUrl=self.expected['loginom_url']+'?testable=true',
            knowledge=dict(session_manifest=dict(
            clientRevision=self.pin['revision'],actionManifestDigest='a'*64)))
        self.events=[dict(type='tool_use',part=dict(id='prepare-part',sessionID='cli-fixture',tool='loginom_dock_prepare',
            state=dict(status='completed',input=dict(intent='new_draft'),metadata=dict(generation=1),
                output=json.dumps(self.prepare))))]
        self.process=None;self.watch=None;self.child_fd=None
        self.addCleanup(self.close_fixture)

    def close_fixture(self):
        if self.watch is not None:self.watch.close()
        if self.child_fd is not None:
            try:signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
            except ProcessLookupError:pass
            os.close(self.child_fd)
        if self.process is not None:
            if self.process.poll() is None:self.process.kill()
            self.process.wait(timeout=5)
            for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
                if stream is not None:stream.close()

    def command(self,name):
        self.process.stdin.write(name+'\n');self.process.stdin.flush()
        return self.process.stdout.readline().strip()

    def producer(self,*,before=None):
        spec=self.root/'private-fixture.json'
        spec.write_text(json.dumps(dict(attempt=str(self.attempt),expected=self.expected,runtime_pin=self.pin)))
        spec.chmod(0o600)
        script=self.root/'producer.mjs'
        journal=Path(__file__).resolve().parents[2]/'client/lib/execution-journal.mjs'
        script.write_text('''
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createExecutionJournal} from JOURNAL;
const spec=JSON.parse(await readFile(SPEC,'utf8')),e=spec.expected;
let browser,record;
console.log('ready');
const reader=createInterface({input:process.stdin});
for await(const command of reader){
 if(command==='start'){
  await mkdir(spec.attempt+'/browser-profile',{recursive:true,mode:0o700});
  browser=spawn(process.execPath,['-e','setTimeout(()=>{},60000)','--',
    '--user-data-dir='+spec.attempt+'/browser-profile','--no-proxy-server'],{stdio:'ignore'});
  const metadata={sessionId:e.runtime_session_id,clientRevision:e.runtime_revision,
    actionManifestDigest:e.action_manifest_sha256,targetIdentity:null};
  record=createExecutionJournal({directory:spec.attempt,metadata});
  await record({phase:'bootstrap_observed'});
  metadata.targetIdentity=e.target;
  await record({event:'workspace_prepared',state:{status:'READY'}});
  await writeFile(spec.attempt+'/session.json',JSON.stringify({sessionId:e.runtime_session_id,
    clientRevision:e.runtime_revision,clientSourceManifest:spec.runtime_pin.manifest,
    profile:spec.attempt+'/browser-profile',artifacts:spec.attempt+'/artifacts',
    resultProfile:'user-v1',mode:'executor-replay',loginomUrl:e.loginom_url+'?testable=true',workspaceReady:true,targetIdentity:e.target}),{mode:0o600});
  console.log(browser.pid);
 }
 if(command==='append'){await record({phase:'fixture_append',status:'verified'});console.log('appended');}
 if(command==='close'){
  const cleanup={policy:'last_confirmed_own_save',session_id:e.runtime_session_id};
  await writeFile(spec.attempt+'/saved-package-cleanup.json',JSON.stringify(cleanup),{mode:0o600});
  await record({event:'managed_saved_package_cleanup',cleanup});
  const ended=once(browser,'exit');browser.kill('SIGTERM');await ended;
  console.log('closed');break;
 }
}
reader.close();process.stdin.pause();process.stdin.destroy();
'''.replace('JOURNAL',json.dumps(journal.as_uri())).replace('SPEC',json.dumps(str(spec))))
        self.process=subprocess.Popen([self.node['path'],str(script)],cwd=self.runtime,start_new_session=True,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.assertEqual(self.process.stdout.readline().strip(),'ready')
        controller=JavascriptProcessController(self.process,self.profile,executable=self.node,browser=self.node,
            node=self.node,kind='cli',source_entries=(('managed_runtime',script),))
        self.watch=NativeJournalWatch(controller,attempt_directories(self.profile) if before is None else before)
        controller.native_watch=self.watch
        self.child_fd=os.pidfd_open(int(self.command('start')))
        controller.sample()
        self.assertEqual(len(self.watch.files),1)
        return controller

    def close_producer(self):
        self.assertEqual(self.command('close'),'closed')
        self.assertEqual(self.process.wait(timeout=5),0)

    def freeze(self):return self.watch.freeze(self.events,self.expected,self.pin)

    def test_runtime_byte_pin_matches_actual_node_production_function(self):
        script="const {createRuntimeSourcePin}=await import(process.argv[1]);console.log(JSON.stringify(await " \
            "createRuntimeSourcePin(new URL('./session.mjs',process.argv[1])," \
            "['../.node-version','../package.json','../package-lock.json'])));"
        result=subprocess.run([self.node['path'],'--input-type=module','-e',script,
            (self.client/'lib/runtime-pin.mjs').as_uri()],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,timeout=10,check=False)
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertEqual(json.loads(result.stdout),self.pin)

    def test_runtime_loginom_url_matches_actual_private_loginom_address(self):
        module=Path(__file__).resolve().parents[2]/'src/connection-check.mjs'
        code="const {loginomAddress}=await import(process.argv[1]);console.log(loginomAddress(process.argv[2]));"
        result=subprocess.run([self.node['path'],'--input-type=module','-e',code,module.as_uri(),
            self.expected['loginom_url']],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            check=False,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr.decode())
        actual=result.stdout.decode().strip()
        self.assertEqual(actual,self.expected['loginom_url']+'?testable=true')
        self.assertTrue(loginom_runtime_url_matches(actual,self.expected['loginom_url']))

    def test_original_new_private_journal_append_and_sealed_artifacts_bind(self):
        controller=self.producer()
        self.assertEqual(self.command('append'),'appended');controller.sample()
        self.close_producer()
        result=self.freeze()
        self.assertTrue(result['passed'],result)
        self.assertEqual(len(result['files']),3)
        self.assertEqual(len(self.watch.sealed['events']),4)
        self.assertTrue(self.watch.closed)
        self.assertTrue(self.watch.revalidate())
        self.assertIs(result['exclusive_writer_identity_verified'],False)
        self.assertIs(result['normal_package_cleanup_semantics_verified'],False)
        self.assertIs(result['cli_acceptance_verified'],False)
        result['passed']=False;self.assertTrue(self.freeze()['passed'])

    def test_existing_attempt_is_not_authorized_by_new_browser_identity(self):
        self.attempt.mkdir(parents=True,mode=0o700)
        before=attempt_directories(self.profile)
        with self.assertRaisesRegex(ValueError,'preexisting_attempt'):self.producer(before=before)

    def test_replaced_or_truncated_observed_journal_stays_refused(self):
        controller=self.producer()
        path=self.attempt/'execution-events.jsonl';original=path.read_bytes()
        path.write_bytes(b'')
        with self.assertRaisesRegex(ValueError,'replaced_or_truncated'):controller.sample()
        path.write_bytes(original)
        self.close_producer()
        self.assertFalse(self.freeze()['passed'])

    def test_same_size_prefix_edit_cannot_hide_behind_later_append(self):
        controller=self.producer()
        path=self.attempt/'execution-events.jsonl'
        content=path.read_bytes();self.assertIn(b'bootstrap_observed',content)
        path.write_bytes(content.replace(b'bootstrap_observed',b'bootstrap_tampered'))
        self.assertEqual(len(path.read_bytes()),len(content))
        self.close_producer()
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_journal_prefix_changed',result['failures'])

    def test_metadata_runtime_source_manifest_or_target_change_refuses(self):
        self.producer();self.close_producer()
        path=self.attempt/'session.json'
        value=json.loads(path.read_text());value['clientSourceManifest'][0]['sha256']='0'*64
        path.write_text(json.dumps(value))
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_metadata_source_prepare_binding',result['failures'])

    def test_missing_or_foreign_public_prepare_does_not_select_private_attempt(self):
        self.producer();self.close_producer()
        self.events[0]['part']['sessionID']='foreign'
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_public_attempt_identity',result['failures'])

    def test_normal_receipt_cannot_be_replaced_by_special_or_unbound_cleanup(self):
        self.producer();self.close_producer()
        (self.attempt/'saved-package-cleanup.json').write_text('{"policy":"acceptance_only"}')
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_normal_cleanup_artifact_binding',result['failures'])

    def test_live_original_handle_never_seals_native_acceptance(self):
        self.producer()
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_original_process_unverified',result['failures'])

    def test_private_artifact_mode_and_alias_are_required(self):
        self.producer();self.close_producer()
        path=self.attempt/'session.json';path.chmod(0o644)
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_private_artifact',result['failures'])

    def test_alias_to_same_metadata_bytes_is_still_not_owned_artifact(self):
        self.producer();self.close_producer()
        path=self.attempt/'session.json'
        external=self.root/'external.json';external.write_bytes(path.read_bytes());external.chmod(0o600)
        path.unlink();path.symlink_to(external)
        result=self.freeze()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_native_private_artifact',result['failures'])

    def test_sealed_artifact_later_change_refuses_gate_without_rewriting_original_fact(self):
        self.producer();self.close_producer()
        first=self.freeze()
        self.assertTrue(first['passed'],first)
        path=self.attempt/'session.json';original=path.read_bytes()
        path.write_bytes(original+b' ')
        self.assertFalse(self.watch.revalidate())
        self.assertTrue(self.freeze()['passed'])
        path.write_bytes(original);self.assertFalse(self.watch.revalidate())
