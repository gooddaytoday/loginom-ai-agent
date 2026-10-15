"""Actual pinned Node redactor and Linux producer pipes, not CLI/live proof."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from javascript_cli_candidate import file_sha256
from javascript_cli_capture import RedactedCliCapture,known_cli_secrets,collect_cli_process
from javascript_cli_controller import JavascriptProcessController
from javascript_cli_evidence import terminal_tool,value_digest


@unittest.skipUnless(sys.platform=='linux' and os.environ.get('LOGINOM_NODE'),
    'pinned LOGINOM_NODE and Linux original handles required')
class JavascriptCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='loginom-capture-')
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        self.directory=self.root/'capture';self.directory.mkdir(mode=0o700)
        self.profile=self.root/'profile';self.profile.mkdir(mode=0o700)
        self.node=self.pin(Path(os.environ['LOGINOM_NODE']).resolve(strict=True))
        self.worker=self.pin(Path(__file__).with_name('javascript-cli-redact-worker.mjs').resolve())
        self.redactor=self.pin(Path(__file__).resolve().parents[2]/'client/lib/redact.mjs')
        self.capture=None
        self.process=None
        self.child_fd=None
        self.addCleanup(self.close_fixture)

    def pin(self,path):return dict(path=str(path),sha256=file_sha256(path))

    def close_fixture(self):
        if self.child_fd is not None:
            try:signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
            except ProcessLookupError:pass
            os.close(self.child_fd)
        if self.process is not None:
            if self.process.poll() is None:self.process.kill()
            self.process.wait(timeout=5)
            for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
                if stream is not None and not stream.closed:stream.close()
        if self.capture is not None:self.capture.finish()

    def start(self,known_values=(),**changes):
        options=dict(node=self.node,worker=self.worker,redactor=self.redactor,known_values=list(known_values))|changes
        self.capture=RedactedCliCapture(self.directory,**options)
        return self.capture

    def event(self,value=None):
        return dict(type='tool_use',timestamp=1234,sessionID='ses-fixture',part=dict(
            id='part-fixture',messageID='message-fixture',sessionID='ses-fixture',callID='call-fixture',type='tool',tool='dock_node_read',state=dict(status='completed',time=dict(start=1000,end=1200),
                input=dict(node_operation_id='op-fixture'),output=json.dumps(value or {},ensure_ascii=False))))

    def emit(self,value):self.capture.push('stdout',(json.dumps(value,ensure_ascii=False)+'\n').encode())

    def events(self):return [json.loads(line) for line in (self.directory/'events.jsonl').read_text().splitlines()]

    def test_full_public_utf8_null_types_and_multiline_source_survive(self):
        self.start()
        output=dict(code='const имя = "Ёж";\nOutputTable.Append();\n',rows=[[None,0,-1,'Ёж'],[1950,True,False,'']],
            columns=[dict(name='result',type='Integer'),dict(name='customer',type='String')],
            schema_mode='code',verified=True)
        self.emit(self.event(output))
        result=self.capture.finish()
        self.assertTrue(result['passed'],result)
        self.assertEqual(json.loads(self.events()[0]['part']['state']['output']),output)
        self.assertEqual(result['counts'],dict(event=1,error=0,omitted=0))
        self.assertEqual(result['worker_returncode'],0)
        self.assertEqual(len(result['files']),3)
        self.assertIs(result['cli_acceptance_verified'],False)

    def test_known_values_nested_credentials_and_binary_filtered_before_files(self):
        self.start(['fixture-private-value-1234'])
        self.emit(self.event(dict(password='nested-private-value-5678',
            visible='fixture-private-value-1234 nested-private-value-5678',
            media='data:text/plain;base64,Rml4dHVyZUJpbmFyeQ==',reasoning='private reasoning',
            details=dict(role='system',content='internal system prompt'),
            nested=dict(type='reasoning',text='nested hidden rationale'))))
        result=self.capture.finish()
        self.assertTrue(result['passed'],result)
        text=(self.directory/'events.jsonl').read_text()
        for fragment in ('fixture-private-value-1234','nested-private-value-5678','Rml4dHVyZUJpbmFyeQ',
                'private reasoning','internal system prompt','nested hidden rationale'):
            self.assertNotIn(fragment,text)
        self.assertIn('[redacted]',text)
        for path in self.directory.iterdir():self.assertEqual(path.stat().st_mode & 0o777,0o600)

    def test_multiple_receipt_documents_stay_parseable_and_original_hash_bound(self):
        self.start(['fixture-secret'])
        original=self.event()
        documents=[dict(status='SUCCEEDED',action_key='package.save_checkpoint',value='Ёж'),
            dict(kind='dock_saved_package_state',password='fixture-secret',modified=False),
            dict(nested=dict(text='brace } and quote " and slash \\'),source='line1\n\nline2')]
        original['part']['state']['output']='\n\n'.join(json.dumps(value,ensure_ascii=False,indent=2) for value in documents)
        self.emit(original)
        self.assertTrue(self.capture.finish()['passed'])
        event=self.events()[0]
        binding=event.pop('_capture_terminal')
        self.assertEqual(binding['original_sha256'],value_digest(terminal_tool(original['part'])))
        self.assertEqual(binding['redacted_event_sha256'],value_digest(event))
        blocks=[json.loads(value) for value in event['part']['state']['output'].split('\n\n')]
        self.assertEqual(blocks[0],documents[0])
        self.assertEqual(blocks[1]['password'],'[redacted]')
        self.assertEqual(blocks[2],documents[2])
        self.assertNotIn('fixture-secret',(self.directory/'events.jsonl').read_text())

    def test_producer_cannot_inject_original_binding(self):
        self.start()
        event=self.event();event['_capture_terminal']=dict(version=1,original_sha256='0'*64)
        self.emit(event)
        self.assertFalse(self.capture.finish()['passed'])
        self.assertEqual(self.events(),[])

    def test_nonpublic_events_are_omitted_without_raw_spool(self):
        self.start()
        for value in (dict(type='reasoning',text='hidden rationale'),dict(type='text',role='developer',text='hidden rules'),
                dict(type='text',channel='analysis',text='hidden analysis'),
                dict(type='text',part=dict(type='reasoning',text='hidden part'))):self.emit(value)
        self.capture.push('stderr',b'{"role":"system","content":"hidden stderr"}\n')
        self.capture.push('stderr',b'{"part":{"type":"reasoning","text":"hidden stderr part"}}\n')
        result=self.capture.finish()
        self.assertTrue(result['passed'],result)
        self.assertEqual(result['counts']['omitted'],6)
        self.assertEqual(self.events(),[])
        self.assertEqual({path.name for path in self.directory.iterdir()},
            {'events.jsonl','stderr.txt','capture-omissions.jsonl'})
        self.assertNotIn('hidden', ''.join(path.read_text() for path in self.directory.iterdir()))

    def test_invalid_unknown_or_deep_stdout_refuses_and_keeps_later_events(self):
        self.start()
        self.capture.push('stdout',b'raw invalid private text\n')
        self.emit(dict(type='unknown',text='private unknown event'))
        deep={}
        for index in range(42):deep=dict(child=deep)
        self.emit(self.event())
        self.emit(dict(type='text',payload=deep))
        result=self.capture.finish()
        self.assertFalse(result['passed'],result)
        self.assertEqual(len(self.events()),1)
        text=''.join(path.read_text() for path in self.directory.iterdir())
        self.assertNotIn('raw invalid private text',text)
        self.assertNotIn('private unknown event',text)
        self.assertEqual(result['worker_returncode'],0)

    def test_large_and_invalid_utf8_lines_are_never_written_raw(self):
        self.start()
        self.capture.push('stdout',b'x'*1048577+b'\n'+b'\xff\xfe\n')
        self.emit(self.event())
        result=self.capture.finish()
        self.assertFalse(result['passed'],result)
        self.assertEqual(len(self.events()),1)
        omissions=(self.directory/'capture-omissions.jsonl').read_text()
        self.assertIn('line_limit_exceeded',omissions);self.assertIn('invalid_utf8',omissions)
        self.assertLess(sum(p.stat().st_size for p in self.directory.iterdir()),2000)

    def test_partial_chunks_crlf_and_no_final_newline(self):
        self.start()
        raw=json.dumps(dict(type='text',part=dict(text='Ёж\nТест')),ensure_ascii=False).encode()+b'\r\n'
        for value in raw:self.capture.push('stdout',bytes([value]))
        self.capture.push('stderr',b'error: fixture')
        result=self.capture.finish()
        self.assertTrue(result['passed'],result)
        self.assertEqual(self.events()[0]['part']['text'],'Ёж\nТест')
        self.assertEqual((self.directory/'stderr.txt').read_text(),'error: fixture\n')

    def test_stderr_private_key_block_split_over_lines(self):
        self.start(['fixture-private-value-1234'])
        self.capture.push('stderr',b'Authorization: Bearer fixture-private-value-1234\n')
        self.capture.push('stderr',b'-----BEGIN RSA PRIVATE KEY-----\nRml4dHVyZUtleQ==\n')
        self.capture.push('stderr',b'-----END RSA PRIVATE KEY-----\nvisible error\n')
        result=self.capture.finish()
        self.assertTrue(result['passed'],result)
        text=(self.directory/'stderr.txt').read_text()
        self.assertNotIn('Rml4dHVyZUtleQ',text);self.assertNotIn('fixture-private-value-1234',text)
        self.assertIn('visible error',text)

    def test_unterminated_private_key_keeps_close_unconfirmed(self):
        self.start();self.capture.push('stderr',b'-----BEGIN PRIVATE KEY-----\nprivate-body\n')
        first=self.capture.finish()
        self.assertFalse(first['passed'],first)
        self.assertIn('cli_capture_worker_close_ack_unconfirmed',first['failures'])
        self.assertNotIn('private-body',(self.directory/'stderr.txt').read_text())
        first['passed']=True
        self.assertFalse(self.capture.finish()['passed'])
        with self.assertRaisesRegex(ValueError,'already_terminal'):self.capture.push('stderr',b'more')

    def test_dead_worker_cannot_supply_capture_or_clean_close(self):
        self.start();self.capture.worker.kill();self.capture.worker.wait(timeout=5)
        self.emit(self.event())
        result=self.capture.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_capture_redaction_transport_unconfirmed',result['failures'])
        self.assertIn('cli_capture_worker_unclean_exit',result['failures'])
        self.assertEqual(self.events(),[])

    def test_hung_worker_consumes_only_first_bounded_reply_wait(self):
        self.start()
        descriptor=os.pidfd_open(self.capture.worker.pid)
        try:signal.pidfd_send_signal(descriptor,signal.SIGSTOP)
        finally:os.close(descriptor)
        self.emit(self.event())
        self.assertTrue(self.capture.transport_failed)
        started=time.monotonic()
        for index in range(3):self.emit(self.event())
        self.assertLess(time.monotonic()-started,1)
        result=self.capture.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_capture_worker_forced_exit',result['failures'])
        self.assertEqual(self.events(),[])

    def test_pins_and_canonical_paths_checked_before_worker_launch(self):
        for change in (dict(worker={**self.worker,'sha256':'0'*64}),):
            with self.assertRaisesRegex(ValueError,'pinned_source'):self.start(**change)
        alias=self.root/'redactor-alias.mjs';alias.symlink_to(self.redactor['path'])
        with self.assertRaisesRegex(ValueError,'pinned_source'):self.start(redactor=self.pin(alias))
        self.assertEqual(list(self.directory.iterdir()),[])

    def test_changed_source_or_evidence_identity_refuses_final_receipt(self):
        source=self.root/'redactor-copy.mjs';source.write_bytes(Path(self.redactor['path']).read_bytes())
        self.start(redactor=self.pin(source));self.emit(self.event())
        source.write_text(source.read_text()+'\n// fixture drift\n')
        path=self.directory/'stderr.txt';path.unlink();path.write_text('replaced',encoding='utf-8');path.chmod(0o600)
        result=self.capture.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_capture_final_integrity_unconfirmed',result['failures'])

    def test_existing_files_preserved_when_initialization_refuses(self):
        (self.directory/'events.jsonl').write_text('existing')
        with self.assertRaisesRegex(ValueError,'initialization_unconfirmed'):self.start()
        self.assertEqual((self.directory/'events.jsonl').read_text(),'existing')

    def credentials(self):
        auth=self.profile/'data/auth.json';auth.parent.mkdir()
        auth.write_text(json.dumps(dict(openai=dict(type='oauth',access='fixture-access-1234',
            refresh='fixture-refresh-5678',expires=1234))));auth.chmod(0o600)
        connection=self.profile/'loginom/connection/connection.json';connection.parent.mkdir(parents=True)
        connection.write_text(json.dumps(dict(secrets=dict(format='loginom-cli-secrets-v1',protection='plaintext',
            payload=json.dumps(dict(apiKey='fixture-api-key-9876',password=''))))));connection.chmod(0o600)
        return auth,connection

    def test_secrets_loaded_only_from_own_private_linux_cli_fields(self):
        self.credentials()
        self.assertEqual(known_cli_secrets(self.profile),
            ['fixture-access-1234','fixture-api-key-9876','fixture-refresh-5678'])

    def test_unsafe_or_non_cli_credentials_refuse_without_fallback(self):
        auth,connection=self.credentials()
        auth.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'own_private_credentials'):known_cli_secrets(self.profile)
        auth.chmod(0o600)
        connection.write_text(json.dumps(dict(secrets=dict(apiKey='fixture-key',password=''))))
        with self.assertRaisesRegex(ValueError,'linux_cli_credentials'):known_cli_secrets(self.profile)

    def producer(self,mode):
        python=Path(sys.executable).resolve()
        pin=self.pin(python)
        script=self.root/'producer.py'
        script.write_text('''
import json,signal,subprocess,sys,time
print('ready',flush=True)
sys.stdin.readline()
child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)',
    '--user-data-dir='+PROFILE,'--no-proxy-server'],start_new_session=True)
print(child.pid,flush=True)
sys.stdin.readline()
def clean(*args):
    child.terminate();child.wait(timeout=5)
    sys.exit(0)
signal.signal(signal.SIGINT,signal.SIG_IGN if MODE=='forced' else clean)
signal.signal(signal.SIGTERM,clean)
print(json.dumps(dict(type='text',part=dict(text='fixture-private-value-1234 public reply'))),flush=True)
print('password=fixture-private-value-1234',file=sys.stderr,flush=True)
if MODE=='normal':clean()
if MODE=='inherited':sys.exit(0)
while True:time.sleep(.01)
'''.replace('PROFILE',repr(str(self.profile/'browser-profile'))).replace('MODE',repr(mode)))
        self.process=subprocess.Popen([str(python),str(script)],start_new_session=True,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        self.assertEqual(self.process.stdout.readline().strip(),b'ready')
        controller=JavascriptProcessController(self.process,self.profile,executable=pin,browser=pin,
            kind='cli',node=pin,source_entries=(('fixture_root',script),))
        self.process.stdin.write(b'spawn\n');self.process.stdin.flush()
        self.child_fd=os.pidfd_open(int(self.process.stdout.readline().strip()))
        controller.sample()
        self.start(['fixture-private-value-1234'])
        return controller

    def run_producer(self,controller,**options):
        self.process.stdin.write(b'run\n');self.process.stdin.flush()
        return controller.collect(self.capture,**options)

    def test_original_controller_drains_both_streams_and_reaps_redactor(self):
        controller=self.producer('normal')
        result=self.run_producer(controller)
        self.assertTrue(result['passed'],result)
        self.assertEqual(self.process.poll(),0)
        self.assertEqual(self.capture.worker.poll(),0)
        self.assertEqual(self.events()[0]['part']['text'],'[redacted] public reply')
        self.assertIs(result['model_delivery_verified'],False)
        self.assertIs(result['native_cleanup_verified'],False)
        self.assertIs(result['cli_acceptance_verified'],False)
        self.assertEqual(result['control'],[])
        self.assertIs(controller.capture,self.capture)
        result['passed']=False
        self.assertTrue(controller.collection['passed'])

    def test_deadline_sigint_clean_exit_still_refuses_original_trial(self):
        controller=self.producer('deadline');controller.deadline_at=controller.submitted_at+1000
        result=self.run_producer(controller,cleanup_wait_ms=200)
        self.assertFalse(result['passed'],result)
        self.assertTrue(result['original_deadline_expired'])
        self.assertEqual(self.process.poll(),0)
        self.assertEqual([r['signal'] for r in result['control']],['SIGINT'])
        self.assertIn('cli_capture_original_deadline_expired',result['failures'])
        self.assertTrue(result['capture']['passed'])
        self.assertFalse(result['process']['passed'])
        self.assertFalse(controller.finish()['passed'])
        self.assertIn('cli_capture_original_deadline_expired',controller.finish()['failures'])

    def test_forced_own_root_recovery_never_promotes_clean_exit(self):
        controller=self.producer('forced');controller.deadline_at=controller.submitted_at+1000
        result=self.run_producer(controller,cleanup_wait_ms=200)
        self.assertFalse(result['passed'],result)
        self.assertEqual([r['signal'] for r in result['control']],['SIGINT','SIGTERM'])
        self.assertTrue(result['forced_root_termination'])
        self.assertEqual(self.process.poll(),0)
        self.assertIn('cli_capture_forced_root_termination',result['failures'])
        self.assertEqual({r['pid'] for r in result['control']},{self.process.pid})
        self.assertFalse(controller.finish()['passed'])

    def test_clean_root_with_inherited_pipes_and_live_child_refuses(self):
        controller=self.producer('inherited')
        result=self.run_producer(controller)
        self.assertFalse(result['passed'],result)
        self.assertEqual(self.process.poll(),0)
        self.assertIn('cli_capture_original_stream_or_process_unsettled',result['failures'])
        self.assertTrue(self.process.stdout.closed);self.assertTrue(self.process.stderr.closed)
        self.assertEqual(result['control'],[])
        signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
        self.assertFalse(controller.finish()['passed'])

    def test_serialized_handles_cannot_reuse_cli_collector(self):
        self.start()
        with self.assertRaisesRegex(ValueError,'original_collect_contract'):collect_cli_process({},self.capture)

    def test_cold_reader_cannot_reuse_cli_event_collector(self):
        controller=self.producer('normal');controller.kind='cold'
        with self.assertRaisesRegex(ValueError,'original_collect_contract'):controller.collect(self.capture)

    def test_arbitrary_process_cannot_supply_candidate_capture(self):
        controller=self.producer('normal')
        with self.assertRaisesRegex(ValueError,'original_factory_required'):
            controller.create_capture(self.directory,self.worker)
