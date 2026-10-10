import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from common import account_guard, begin_account_effect, marker_paths, private_snapshot, write_private, process_identity

spec = importlib.util.spec_from_file_location('provision', SCRIPTS / 'provision-accounts.py')
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)


class AccountSafety(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.locks = self.root / 'locks'
        self.config = self.root / 'config.json'
        write_private(self.config, {'private_value': 'SYNTHETIC_SECRET'})

    def tearDown(self):
        self.temporary.cleanup()

    def test_both_legacy_markers_are_read_after_flock(self):
        with account_guard('fixture', lock_directory=self.locks) as guard:
            inode = guard['inode']
        for marker in marker_paths(self.locks / 'fixture.lock'):
            # Early precheck saw no marker. It appears before actual dispatch.
            self.assertFalse(marker.exists())
            write_private(marker, {'state': 'UNKNOWN', 'writer': {'pid': 999999}})
            raw = marker.read_bytes()
            with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_EFFECT_UNRESOLVED'):
                with account_guard('fixture', lock_directory=self.locks):
                    self.fail('dispatch was admitted')
            self.assertEqual(marker.read_bytes(), raw)
            self.assertEqual((self.locks / 'fixture.lock').stat().st_ino, inode)
            marker.unlink()  # Only this test's temporary fixture, never live state.

    def test_claimed_cleanup_does_not_authorize_reuse(self):
        with account_guard('fixture', lock_directory=self.locks):
            pass
        write_private(marker_paths(self.locks / 'fixture.lock')[0], {'state': 'done', 'server_absence': True})
        with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_EFFECT_UNRESOLVED'):
            with account_guard('fixture', lock_directory=self.locks):
                self.fail('unverified receipt admitted')

    def test_config_changed_after_precheck_blocks_dispatch(self):
        before = private_snapshot(self.config)
        write_private(self.config, {'private_value': 'CHANGED'})
        with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_CONFIG_CHANGED'):
            with account_guard('fixture', [before], self.locks):
                self.fail('cached config admitted')

    def child(self, guard):
        child = subprocess.Popen([sys.executable, '-c',
            'import os,sys;os.fstat(int(sys.argv[1]));print("ready",flush=True);sys.stdin.read()', str(guard['fd'])],
            pass_fds=(guard['fd'],), stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.assertEqual(child.stdout.readline().strip(), 'ready')
        return child

    def test_child_retains_same_flock_after_parent_fd_closed(self):
        with account_guard('fixture', lock_directory=self.locks) as guard:
            child = self.child(guard)
        try:
            with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_BUSY'):
                with account_guard('fixture', lock_directory=self.locks):
                    self.fail('inherited lock lost')
        finally:
            child.communicate('', timeout=5)
            child.stdout.close()
        with account_guard('fixture', lock_directory=self.locks):
            pass

    def test_live_unlocked_fd_holder_blocks_dispatch(self):
        with account_guard('fixture', lock_directory=self.locks) as guard:
            child = self.child(guard)
            record = process_identity(child.pid)
            fcntl.flock(guard['fd'], fcntl.LOCK_UN)
        try:
            with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_WRITER_PRESENT'):
                with account_guard('fixture', lock_directory=self.locks, previous_processes=[record]):
                    self.fail('old live writer admitted')
        finally:
            child.communicate('', timeout=5)
            child.stdout.close()

    def test_canonical_writer_is_private_and_preserves_unknown_effect(self):
        with account_guard('fixture', [private_snapshot(self.config)], self.locks) as guard:
            marker = begin_account_effect(guard, str(uuid4()), 'admin', str(uuid4()), 'a' * 40)
            raw = marker.read_bytes()
            self.assertEqual(marker, marker_paths(self.locks / 'fixture.lock')[0])
            self.assertEqual(marker.stat().st_mode & 0o777, 0o600)
            payload = json.loads(raw)
            self.assertEqual(payload['lock']['inode'], guard['inode'])
            self.assertEqual(payload['writer']['pid'], os.getpid())
            self.assertEqual(payload['schema'], 'loginom-account-effect-v1')
            self.assertNotIn('SYNTHETIC_SECRET', raw.decode())
        self.assertEqual(marker.read_bytes(), raw)
        with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_EFFECT_UNRESOLVED'):
            with account_guard('fixture', lock_directory=self.locks):
                self.fail('own unknown effect discarded')

    def test_linked_marker_is_blocked(self):
        with account_guard('fixture', lock_directory=self.locks):
            pass
        marker_paths(self.locks / 'fixture.lock')[0].symlink_to(self.config)
        with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_MARKER_LINKED'):
            with account_guard('fixture', lock_directory=self.locks):
                pass

    def test_replaced_lock_cannot_receive_new_marker(self):
        with account_guard('fixture', lock_directory=self.locks) as guard:
            original = Path(guard['path'])
            original.rename(original.with_suffix('.retained-lock'))
            original.touch(mode=0o600)
            with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_LOCK_REPLACED'):
                begin_account_effect(guard, str(uuid4()), 'admin', str(uuid4()), 'a' * 40)
            self.assertFalse(marker_paths(original)[0].exists())

    def test_preparation_blocks_before_pair_allocation_or_login(self):
        operator = self.root / 'operator.json'
        write_private(operator, {'admin_user': 'fixture-admin', 'node': str(self.root / 'forbidden-node')})
        cards = self.root / 'cards'
        issue = str(uuid4())
        result = subprocess.run([sys.executable, str(SCRIPTS / 'provision-accounts.py'), '--issue', issue,
            '--operator', str(operator), '--directory', str(cards), '--evidence-dir', str(self.root / 'forbidden-evidence'),
            '--previous-processes', str(self.root / 'missing-history'), '--source-sha', 'a' * 40], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stderr.strip(), 'BLOCKED_FINITE_SERVER_CLEANUP')
        self.assertFalse(cards.exists())
        self.assertEqual(list(self.locks.glob('*.active.json')), [])
        self.assertFalse((self.root / 'forbidden-evidence').exists())

    def test_allocation_preserves_pair_passwords_and_operator_binding(self):
        operator = self.root / 'operator.json'
        write_private(operator, {'admin_user': 'fixture-admin', 'agents': {'worker': 'w', 'reviewer': 'r'},
            'workspace_id': 'workspace', 'url': 'https://fixture.invalid', 'api_key': 'SYNTHETIC_KEY'})
        issue = str(uuid4())
        configs = provision.allocate(issue, operator, self.root / 'cards')
        before = [config.read_bytes() for config in configs]
        provision.allocate(issue, operator, self.root / 'cards')
        self.assertEqual(before, [config.read_bytes() for config in configs])
        self.assertNotEqual(json.loads(before[0])['loginom']['username'], json.loads(before[1])['loginom']['username'])
        with self.assertRaisesRegex(RuntimeError, 'STAGE0_PROVIDER_AUTH_FORBIDDEN'):
            provision.allocate(issue, operator, self.root / 'cards', 'full')
        self.assertEqual(before, [config.read_bytes() for config in configs])


if __name__ == '__main__':
    unittest.main()
