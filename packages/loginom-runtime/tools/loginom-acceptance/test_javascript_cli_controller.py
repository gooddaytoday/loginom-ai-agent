"""Actual original Popen/detached processes; no model, Chromium or candidate run."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from javascript_cli_candidate import file_sha256
from javascript_cli_controller import JavascriptProcessController,JavascriptLaunchUnconfirmed


@unittest.skipUnless(sys.platform == 'linux','actual Linux /proc and PID-fds required')
class JavascriptControllerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='loginom-controller-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.profile = self.directory/'profile'
        self.profile.mkdir()
        self.python = Path(sys.executable).resolve()
        self.pin = dict(path=str(self.python),sha256=file_sha256(self.python))
        self.process = None
        self.child_fd = None
        self.addCleanup(self.close_fixture)

    def close_fixture(self):
        if self.child_fd is not None:
            try:signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
            except ProcessLookupError:pass
            os.close(self.child_fd)
        if self.process is not None:
            if self.process.poll() is None:self.process.kill()
            self.process.wait(timeout=5)
            for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
                if stream is not None:stream.close()

    def launch(self,flags=('--no-proxy-server',),*,foreign=False):
        path = self.profile/'browser-profile' if not foreign else self.directory/'foreign-profile'
        path.mkdir()
        script = self.directory/'original.py'
        script.write_text('''
import subprocess,sys
print('ready',flush=True)
sys.stdin.readline()
child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)',
    '--user-data-dir='+PROFILE,*FLAGS],start_new_session=True)
print(child.pid,flush=True)
command=sys.stdin.readline().strip()
if command=='clean':child.terminate();child.wait(timeout=5)
'''.replace('PROFILE',repr(str(path))).replace('FLAGS',repr(list(flags))))
        self.process = subprocess.Popen([str(self.python),str(script)],start_new_session=True,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.assertEqual(self.process.stdout.readline().strip(),'ready')
        controller = JavascriptProcessController(self.process,self.profile,executable=self.pin,
            browser=self.pin,kind='cli',node=self.pin,source_entries=(('fixture_root',script),))
        self.process.stdin.write('spawn\n');self.process.stdin.flush()
        pid = int(self.process.stdout.readline())
        self.child_fd = os.pidfd_open(pid)
        return controller,pid

    def finish_root(self,command='clean'):
        self.process.stdin.write(command+'\n');self.process.stdin.flush()
        self.assertEqual(self.process.wait(timeout=5),0)

    def test_original_handle_and_detached_profile_identity_are_bound(self):
        controller,pid = self.launch()
        self.assertIn(pid,{r['pid'] for r in controller.sample()})
        self.finish_root()
        result = controller.finish()
        self.assertTrue(result['passed'],result)
        self.assertEqual(result['processes']['root']['pid'],self.process.pid)
        self.assertEqual(result['processes']['observed_browsers'][0]['pid'],pid)
        self.assertNotEqual(result['processes']['observed_browsers'][0]['session'],self.process.pid)
        self.assertTrue(result['processes']['owned_browser_launch_policy_verified'])
        self.assertEqual([r['role'] for r in result['source_process_bindings']],['fixture_root'])
        self.assertEqual(result['deadline_at']-result['submitted_at'],1800000)
        for key in ('native_package_cleanup_verified','runtime_ack_verified','model_delivery_verified',
                'cold_persistence_verified','cli_acceptance_verified'):self.assertIs(result[key],False)
        self.assertNotIn('argv',repr(result))
        result['passed']=False
        self.assertTrue(controller.finish()['passed'])

    def test_unseen_detached_browser_after_root_exit_is_not_missed(self):
        controller,pid = self.launch()
        # No sampling between birth and reparenting: ancestry/session-only
        # collection would miss this original live descendant.
        self.finish_root('survive')
        result = controller.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn(pid,{r['pid'] for r in result['processes']['remaining_processes']})
        self.assertEqual(result['processes']['observed_browsers'][0]['pid'],pid)
        signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
        self.assertFalse(controller.finish()['passed'])

    def test_same_executable_foreign_profile_does_not_supply_browser_proof(self):
        controller,pid = self.launch(foreign=True)
        self.finish_root('survive')
        result = controller.finish()
        self.assertFalse(result['passed'],result)
        self.assertEqual(result['processes']['observed_browsers'],[])
        self.assertNotIn(pid,{r['pid'] for r in result['processes']['remaining_processes']})
        self.assertIn('cli_process_owned_browser_not_observed',result['failures'])

    def test_headless_unsandboxed_or_proxy_policy_cannot_be_forgotten(self):
        for flags in (('--no-proxy-server','--headless=new'),('--no-proxy-server','--no-sandbox'),()):
            with self.subTest(flags=flags):
                controller,pid = self.launch(flags)
                controller.sample();self.finish_root()
                result = controller.finish()
                self.assertFalse(result['passed'],result)
                self.assertIn('cli_process_owned_browser_launch_policy',result['failures'])
                self.close_fixture();self.process=None;self.child_fd=None
                (self.profile/'browser-profile').rmdir()

    def test_original_executable_pin_is_checked_on_live_process(self):
        controller,pid = self.launch()
        with self.assertRaisesRegex(ValueError,'original_executable_pin'):
            JavascriptProcessController(self.process,self.profile,executable={**self.pin,'sha256':'0'*64},
                browser=self.pin,kind='cold')
        controller.sample();self.finish_root()

    def test_finished_controller_cannot_resume_sampling(self):
        controller,pid = self.launch();controller.sample();self.finish_root();controller.finish()
        with self.assertRaisesRegex(ValueError,'already_terminal'):controller.sample()

    def test_a_failed_runtime_observation_survives_later_clean_exit(self):
        controller,pid = self.launch()
        controller.node['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'original_executable_pin'):controller.sample()
        controller.node=dict(self.pin)
        controller.sample();self.finish_root()
        result=controller.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_controller_runtime_observation_unconfirmed',result['failures'])

    def test_a_failed_browser_observation_survives_later_clean_exit(self):
        controller,pid = self.launch()
        controller.owner.browser['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'live_browser_executable_pin'):controller.sample()
        controller.owner.browser=dict(self.pin)
        controller.sample();self.finish_root()
        result=controller.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_process_observation_unconfirmed',result['failures'])

    def test_cold_launch_requires_original_cli_and_native_writer_evidence(self):
        with self.assertRaisesRegex(ValueError,'original_writer_required'):
            JavascriptProcessController.launch_cold(dict(passed=True),{},[],None,self.profile,self.directory,environment={})

    def test_process_only_receipt_cannot_authorize_a_cold_reader(self):
        controller,pid = self.launch();controller.sample();self.finish_root()
        self.assertTrue(controller.finish()['passed'])
        controller.candidate=(self.directory,{})
        with self.assertRaisesRegex(ValueError,'original_writer_required'):
            JavascriptProcessController.launch_cold(controller,{},[],None,self.profile,self.directory,environment={})

    def test_launch_observation_error_retains_actual_handle_for_owner(self):
        controller,pid = self.launch()
        error = JavascriptLaunchUnconfirmed(self.process)
        self.assertIs(error.process,self.process)
        self.assertEqual(str(error),'cli_controller_launch_observation_unconfirmed')
        controller.sample();self.finish_root()


class JavascriptControllerPreflightTests(unittest.TestCase):
    def setUp(self):
        # Physical inventory fixtures remain explicitly non-executable. Every
        # case must refuse before Popen; no candidate execution is claimed.
        from test_javascript_cli_candidate import JavascriptCandidateTests
        self.fixture = JavascriptCandidateTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.profile = self.fixture.root.parent/'profile';self.profile.mkdir()
        self.directory = self.fixture.root.parent/'task';self.directory.mkdir()
        self.file = self.directory/'task.md';self.file.write_text('Original task only')
        self.files = [dict(path=str(self.file),sha256=file_sha256(self.file),bytes=self.file.stat().st_size)]

    def launch(self,*,environment=None):
        return JavascriptProcessController.launch_cli(self.fixture.root,self.fixture.expected,
            self.profile,self.directory,self.files,'Complete original task',environment=environment or {})

    def test_candidate_corruption_and_override_refuse_before_launch(self):
        with self.assertRaisesRegex(ValueError,'isolation_or_normal_transport'):
            self.launch(environment={'LOGINOM_AI_AGENT_CLI_BUNDLE':'/old/source'})
        (self.fixture.root/'bin/loginom-ai-agent-cli').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'candidate_unverified'):self.launch()

    def test_missing_graphical_session_refuses_before_any_candidate_execution(self):
        with self.assertRaisesRegex(ValueError,'graphical_session_required'):self.launch()

    def test_writer_and_extra_workspace_file_refuse_before_launch(self):
        guard = self.profile/'.writer';guard.write_text('retained')
        with self.assertRaisesRegex(ValueError,'isolation_or_normal_transport'):self.launch()
        guard.unlink()
        extra = self.directory/'oracle.json';extra.write_text('not a user input')
        with self.assertRaisesRegex(ValueError,'original_inputs_or_clean_directory'):self.launch()

    def test_changed_attachment_bytes_or_duplicate_input_refuse_before_launch(self):
        self.file.write_text('changed original snapshot')
        with self.assertRaisesRegex(ValueError,'original_inputs_or_clean_directory'):self.launch()
        self.files[0]['sha256']=file_sha256(self.file);self.files[0]['bytes']=self.file.stat().st_size
        self.files.append(dict(self.files[0]))
        with self.assertRaisesRegex(ValueError,'original_inputs_or_clean_directory'):self.launch()


if __name__ == '__main__':unittest.main()
