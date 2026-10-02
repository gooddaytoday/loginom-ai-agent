"""Own Linux pipes and the production redactor; no browser, CLI or model."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from javascript_cli_capture import collect_cli_process
from javascript_cli_controller import JavascriptProcessController,cold_launch_inputs
import test_javascript_cli_capture


@unittest.skipUnless(sys.platform=='linux' and os.environ.get('LOGINOM_NODE'),
    'pinned LOGINOM_NODE and Linux required')
class JavascriptColdCaptureTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_javascript_cli_capture.JavascriptCaptureTests();self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.report=str(self.fixture.root/'cold-evidence/report.json')

    def start(self):return self.fixture.start(['fixture-private-value-1234'],mode='cold',expected_report=self.report)

    def summary(self,**changes):
        return dict(status='OBSERVED',work_stage='cold-output',report=self.report,
            cleanup=dict(package_closed=True,logged_out=True,browser_closed=True))|changes

    def summaries(self):
        return [json.loads(line) for line in (self.fixture.directory/'cold-summary.jsonl').read_text().splitlines()]

    def test_one_technical_summary_is_redacted_without_cli_event_or_acceptance_claim(self):
        capture=self.start()
        self.fixture.emit(self.summary(cleanup=dict(package_closed=False,logged_out=False,browser_closed=True,
            failure='fixture-private-value-1234',reasoning='hidden rationale')))
        capture.push('stderr',b'password=fixture-private-value-1234\n')
        result=capture.finish();self.assertTrue(result['passed'],result)
        self.assertEqual(result['mode'],'cold')
        self.assertEqual(result['counts'],dict(event=1,error=1,omitted=0))
        self.assertEqual(self.summaries()[0]['cleanup']['failure'],'[redacted]')
        text=''.join(path.read_text() for path in self.fixture.directory.iterdir())
        self.assertNotIn('fixture-private-value-1234',text);self.assertNotIn('hidden rationale',text)
        self.assertFalse((self.fixture.directory/'events.jsonl').exists())
        self.assertIs(result['cli_acceptance_verified'],False)

    def test_missing_summary_fails_even_with_clean_worker_exit(self):
        capture=self.start();result=capture.finish()
        self.assertFalse(result['passed']);self.assertEqual(result['worker_returncode'],0)
        self.assertIn('cold_capture_exact_summary_required',result['failures'])

    def test_cli_event_unknown_or_extra_summary_fields_refuse_without_raw_dump(self):
        capture=self.start()
        for value in (self.fixture.event(),self.summary(secret_extra='private unexpected data'),
                self.summary(status='PASS')):self.fixture.emit(value)
        self.fixture.emit(self.summary())
        result=capture.finish();self.assertFalse(result['passed'])
        self.assertEqual(self.summaries(),[self.summary()])
        self.assertNotIn('private unexpected data',''.join(path.read_text() for path in self.fixture.directory.iterdir()))

    def test_duplicate_or_foreign_report_refuses(self):
        capture=self.start()
        self.fixture.emit(self.summary(report='/foreign/report.json'))
        self.fixture.emit(self.summary());self.fixture.emit(self.summary())
        result=capture.finish();self.assertFalse(result['passed'])
        self.assertEqual(self.summaries(),[self.summary()])

    def test_hidden_summary_does_not_replace_required_public_summary(self):
        capture=self.start();self.fixture.emit(dict(role='system',text='private rules'))
        self.fixture.emit(self.summary());self.assertTrue(capture.finish()['passed'])
        self.assertNotIn('private rules',''.join(path.read_text() for path in self.fixture.directory.iterdir()))

    def producer(self,mode='normal'):
        fixture=self.fixture
        python=Path(sys.executable).resolve();pin=fixture.pin(python)
        script=fixture.root/'cold-producer.py'
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
    print(json.dumps(SUMMARY),flush=True)
    sys.exit(0)
signal.signal(signal.SIGINT,signal.SIG_IGN if MODE=='forced' else clean)
signal.signal(signal.SIGTERM,clean)
print('password=fixture-private-value-1234',file=sys.stderr,flush=True)
if MODE=='normal':clean()
while True:time.sleep(.01)
'''.replace('PROFILE',repr(str(fixture.profile/'browser-profile')))
            .replace('SUMMARY',repr(self.summary())).replace('MODE',repr(mode)))
        fixture.process=subprocess.Popen([str(python),str(script)],start_new_session=True,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        self.assertEqual(fixture.process.stdout.readline().strip(),b'ready')
        controller=JavascriptProcessController(fixture.process,fixture.profile,executable=pin,browser=pin,
            kind='cold',node=pin,source_entries=(('cold_reader',script),))
        fixture.process.stdin.write(b'spawn\n');fixture.process.stdin.flush()
        fixture.child_fd=os.pidfd_open(int(fixture.process.stdout.readline().strip()))
        controller.sample();self.start()
        return controller

    def run_producer(self,controller):
        self.fixture.process.stdin.write(b'run\n');self.fixture.process.stdin.flush()
        return controller.collect(self.fixture.capture,cleanup_wait_ms=200)

    def test_actual_cold_original_handle_and_ten_minute_ceiling(self):
        controller=self.producer()
        self.assertEqual(controller.deadline_at-controller.submitted_at,600000)
        with self.assertRaisesRegex(ValueError,'cli_capture_original_collect_contract'):
            collect_cli_process(controller,self.fixture.capture)
        result=self.run_producer(controller);self.assertTrue(result['passed'],result)
        self.assertEqual(self.summaries(),[self.summary()]);self.assertEqual(result['control'],[])
        self.assertEqual(self.fixture.process.returncode,0)
        self.assertIs(result['cold_persistence_verified'],False)
        self.assertIs(result['cli_acceptance_verified'],False)

    def test_expired_cold_cannot_be_promoted_by_success_summary_and_clean_exit(self):
        controller=self.producer('deadline');controller.deadline_at=controller.submitted_at+1000
        result=self.run_producer(controller);self.assertFalse(result['passed'])
        self.assertTrue(result['capture']['passed']);self.assertEqual(self.summaries(),[self.summary()])
        self.assertTrue(result['original_deadline_expired']);self.assertFalse(controller.finish()['passed'])
        self.assertEqual([row['signal'] for row in result['control']],['SIGINT'])

    def test_forced_cold_root_recovery_remains_failure(self):
        controller=self.producer('forced');controller.deadline_at=controller.submitted_at+1000
        result=self.run_producer(controller);self.assertFalse(result['passed'])
        self.assertTrue(result['forced_root_termination']);self.assertEqual(self.fixture.process.returncode,0)
        self.assertEqual([row['signal'] for row in result['control']],['SIGINT','SIGTERM'])
        self.assertEqual({row['pid'] for row in result['control']},{self.fixture.process.pid})

    def test_private_input_change_survives_clean_original_process_finish(self):
        controller=self.producer()
        path=self.fixture.root/'assignment.json';path.write_text('{"fixture":"original"}');path.chmod(0o600)
        controller.cold_inputs=dict(assignment=self.fixture.pin(path))
        path.write_text('{"fixture":"changed"}')
        result=self.run_producer(controller)
        self.assertFalse(result['passed']);self.assertEqual(self.fixture.process.returncode,0)
        self.assertIn('cli_controller_cold_inputs_changed_after_launch',result['failures'])
        self.assertFalse(controller.finish()['passed'])


class JavascriptColdInputsTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.temporary=tempfile.TemporaryDirectory(prefix='loginom-cold-inputs-')
        self.addCleanup(self.temporary.cleanup);self.root=Path(self.temporary.name)
        self.profile=self.root/'profile';self.profile.mkdir(mode=0o700)
        self.evidence=self.root/'evidence'
        self.config=self.root/'private.json';self.config.write_text(json.dumps(dict(
            url='http://logi-test-plan.bg.local/app/',username='jsteach',password='')));self.config.chmod(0o600)
        self.assignment=self.root/'assignment.json';self.assignment.write_text(json.dumps(dict(
            campaign_id='javascript-20260926-ubuntu',profile=str(self.profile))));self.assignment.chmod(0o600)

    def proof(self):return cold_launch_inputs(self.config,self.profile,self.evidence,'jsteach')

    def test_operator_owns_new_directory_and_private_inputs_are_pinned(self):
        proof=self.proof();self.assertEqual(set(proof),{'config','assignment'})
        self.assertFalse(self.evidence.exists())
        # Actual operator uses this exact mkdir, without recursive/exist_ok.
        self.evidence.mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError,'new_evidence'):self.proof()

    def test_missing_wrong_or_public_assignment_refuses(self):
        original=self.assignment.read_bytes()
        self.assignment.unlink()
        with self.assertRaisesRegex(ValueError,'private_configuration'):self.proof()
        for value in (dict(campaign_id='foreign',profile=str(self.profile)),
                dict(campaign_id='javascript-20260926-ubuntu',profile=str(self.root/'foreign'))):
            self.assignment.write_text(json.dumps(value));self.assignment.chmod(0o600)
            with self.assertRaisesRegex(ValueError,'target_account_assignment'):self.proof()
        self.assignment.write_bytes(original);self.assignment.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'private_configuration'):self.proof()

    def test_evidence_alias_existing_or_nonprivate_parent_refuses(self):
        self.evidence.symlink_to(self.root/'missing')
        with self.assertRaisesRegex(ValueError,'new_evidence'):self.proof()
        self.evidence.unlink();self.root.chmod(0o755)
        with self.assertRaisesRegex(ValueError,'new_evidence'):self.proof()


if __name__=='__main__':unittest.main()
