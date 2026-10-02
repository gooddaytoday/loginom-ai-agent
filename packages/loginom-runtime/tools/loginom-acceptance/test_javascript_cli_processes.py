"""Actual Linux Popen/process groups/PID-fds; no CLI candidate or browser run."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from javascript_cli_processes import LinuxProcessOwner,linux_process,browser_arguments


@unittest.skipUnless(sys.platform == 'linux','actual /proc and Linux PID-fds required')
class JavascriptCliProcessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='loginom-process-owner-')
        self.addCleanup(self.temp.cleanup)
        self.profile = Path(self.temp.name)
        self.child_fd = None
        self.process = None
        self.addCleanup(self.close_fixture)

    def close_fixture(self):
        # Only this test's actual handles can be terminated. Production collector
        # is read-only and has no signal/kill API or authority over another task.
        if self.child_fd is not None:
            try:signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
            except ProcessLookupError:pass
            os.close(self.child_fd)
        if self.process is not None:
            if self.process.poll() is None:self.process.kill()
            self.process.wait(timeout=5)
            for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
                if stream is not None:stream.close()

    def launch(self,mode='clean',detached=False):
        source = '''
import subprocess,sys
print('ready',flush=True)
sys.stdin.readline()
child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],start_new_session=DETACHED)
print(child.pid,flush=True)
sys.stdin.readline()
if MODE!='survivor':child.terminate();child.wait(timeout=5)
sys.exit(7 if MODE=='failed' else 0)
'''.replace('DETACHED',repr(detached)).replace('MODE',repr(mode))
        self.process = subprocess.Popen([sys.executable,'-c',source],start_new_session=True,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.assertEqual(self.process.stdout.readline().strip(),'ready')
        owner = LinuxProcessOwner(self.process,self.profile)
        self.process.stdin.write('spawn\n');self.process.stdin.flush()
        pid = int(self.process.stdout.readline())
        self.child_fd = os.pidfd_open(pid)
        self.assertIn(pid,{r['pid'] for r in owner.observe()})
        return owner

    def finish_root(self):
        self.process.stdin.write('finish\n');self.process.stdin.flush()
        return self.process.wait(timeout=5)

    def test_actual_original_clean_exit_and_child_absence(self):
        owner = self.launch()
        self.assertEqual(self.finish_root(),0)
        result = owner.finish()
        self.assertTrue(result['passed'],result)
        self.assertEqual(len(result['observed_processes']),2)
        self.assertEqual(result['root']['pid'],self.process.pid)
        self.assertGreater(result['root']['start_ticks'],0)
        self.assertEqual(result['remaining_processes'],[])
        self.assertTrue(result['original_clean_exit_verified'])
        for key in ('native_package_cleanup_verified','runtime_ack_verified','candidate_verified',
                'unobserved_detached_descendants_verified','cli_acceptance_verified'):self.assertIs(result[key],False)
        result['passed']=False
        self.assertTrue(owner.finish()['passed'])

    def test_clean_root_exit_does_not_hide_surviving_owned_child(self):
        owner = self.launch('survivor')
        self.assertEqual(self.finish_root(),0)
        result = owner.finish()
        self.assertFalse(result['passed'],result)
        self.assertIn('cli_process_owned_identity_still_present',result['failures'])
        self.assertEqual(len(result['remaining_processes']),1)
        signal.pidfd_send_signal(self.child_fd,signal.SIGKILL)
        self.assertFalse(owner.finish()['passed'])

    def test_observed_session_escape_cannot_hide_live_child(self):
        owner = self.launch('survivor',detached=True)
        self.assertEqual(self.finish_root(),0)
        self.assertFalse(owner.finish()['passed'])
        self.assertNotEqual(owner.finish()['remaining_processes'][0]['session'],self.process.pid)

    def test_nonzero_original_exit_is_not_cleanup_success(self):
        owner = self.launch('failed')
        self.assertEqual(self.finish_root(),7)
        self.assertIn('cli_process_original_clean_exit_required',owner.finish()['failures'])

    def test_nonterminal_original_handle_cannot_pass(self):
        owner = self.launch()
        self.assertIsNone(owner.finish()['actual_returncode'])
        self.assertFalse(owner.finish()['passed'])

    def test_forced_original_exit_cannot_pass(self):
        owner = self.launch()
        self.process.kill();self.process.wait(timeout=5)
        self.assertEqual(owner.finish()['actual_returncode'],-signal.SIGKILL)
        self.assertFalse(owner.finish()['passed'])

    def test_retained_profile_guard_cannot_pass(self):
        owner = self.launch();self.finish_root()
        (self.profile/'.writer').write_text('own guard')
        self.assertIn('cli_process_profile_guard_retained',owner.finish()['failures'])

    def test_serialized_handle_or_foreign_process_session_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'original_owner_required'):
            LinuxProcessOwner(dict(pid=os.getpid(),returncode=0),self.profile)
        self.process = subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])
        with self.assertRaisesRegex(ValueError,'fresh_owned_session_required'):
            LinuxProcessOwner(self.process,self.profile)

    def test_pid_parser_rejects_nonpositive_or_boolean_identity(self):
        for value in (None,True,0,-1,'1'):
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'pid_invalid'):linux_process(value)


class ChromiumProcessTitleTests(unittest.TestCase):
    def test_observed_chromium_title_preserves_policy_switches(self):
        args=['/usr/bin/chrome','--no-proxy-server','--user-data-dir=/private/profile/browser-profile',
            '--remote-debugging-pipe','about:blank']
        self.assertEqual(browser_arguments((' '.join(args)+'\0').encode(),args[0]),args)
        for flag in ('--headless=new','--no-sandbox','--type=renderer'):
            changed=[*args[:-1],flag,args[-1]]
            self.assertIn(flag,browser_arguments((' '.join(changed)+'\0').encode(),args[0]))

    def test_native_argv_keeps_spaces_inside_profile(self):
        args=['/usr/bin/chrome','--user-data-dir=/private/my profile','--no-proxy-server']
        self.assertEqual(browser_arguments(('\0'.join(args)+'\0').encode(),args[0]),args)

    def test_ambiguous_or_foreign_process_titles_are_rejected(self):
        for title in (
            '/other/chrome --user-data-dir=/private/profile about:blank',
            '/usr/bin/chrome --user-data-dir=/private/my profile about:blank',
            '/usr/bin/chrome --user-data-dir="/private/profile" about:blank',
            '/usr/bin/chrome --user-data-dir=/private/profile\t--headless about:blank',
            '/usr/bin/chrome --user-data-dir=/private/profile http://example.org',
            '/usr/bin/chrome  --user-data-dir=/private/profile about:blank',
        ):
            with self.subTest(title=title):self.assertEqual(browser_arguments((title+'\0').encode(),'/usr/bin/chrome'),[])


if __name__ == '__main__':unittest.main()
