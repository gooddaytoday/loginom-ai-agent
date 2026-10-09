"""Real fixed-entry admission/FD tests; isolated synthetic accounts, no Loginom."""
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from common import read_private, write_private, process_identity, private_snapshot

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

provision = load('qualified_coordinator_tests', 'provision-accounts.py')
owner = load('qualified_legacy_tests', 'owner-reconcile.py')

class FixedQualification(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.dependencies = read_private(Path.home() / '.config/loginom-multica/operator.json')
        self.issue = str(uuid4()); self.operation_id = str(uuid4())
        self.operator = self.root / 'operator.json'; self.cards = self.root / 'cards'
        write_private(self.operator, {**{k: self.dependencies[k] for k in ['node', 'browser', 'playwright_module']},
            'admin_user': 'fixture-admin', 'admin_password': 'SYNTHETIC', 'url': 'about:blank',
            'api_key': 'SYNTHETIC', 'agents': {'worker': 'w', 'reviewer': 'r'}, 'workspace_id': 'fixture'})
        self.configs = provision.allocate(self.issue, self.operator, self.cards)
        sha = subprocess.check_output(['git', '-C', SCRIPTS, 'rev-parse', 'HEAD'], text=True).strip()
        self.source = provision.clean_candidate(sha)
        self.grant = self.root / 'authorization.json'
        self.observer = {'user_hash': hashlib.sha256(b'fixture-admin').hexdigest(),
            'guid_hash': hashlib.sha256(b'fixture-owner-guid').hexdigest(), 'session_id': 90,
            'create_time': '2026-10-09T00:00:00.000Z', 'stand': 'about:blank',
            'tab_binding_sha256': hashlib.sha256(b'fixture-existing-tab').hexdigest()}
        bindings = [{k: s[k] for k in ['path', 'device', 'inode', 'sha256']}
            for s in map(private_snapshot, [self.operator, *self.configs])]
        self.authorization = {'issue_id': self.issue, 'operation_id': self.operation_id,
            'source': self.source, 'configs': bindings, 'expected_observer': self.observer}
        write_private(self.grant, self.authorization)
        previous = self.root / 'previous.json'; write_private(previous, {name: [] for name in [
            'fixture-admin', *[provision.planned_username(self.issue, role) for role in ['worker', 'reviewer']]]})
        self.evidence = self.root / 'operation'
        self.command = [sys.executable, str(SCRIPTS / 'qualification-coordinator.py'), '--issue', self.issue,
            '--operator', str(self.operator), '--directory', str(self.cards), '--previous-processes', str(previous),
            '--evidence-dir', str(self.evidence), '--source-sha', sha, '--operation-id', self.operation_id,
            '--parent-binding-file', str(self.grant)]
        self.environment = {**os.environ, 'HOME': str(self.root / 'isolated-home')}
        Path(self.environment['HOME']).mkdir(mode=0o700)

    def tearDown(self): self.temp.cleanup()

    def test_exact_production_command_reaches_before_request_then_cancel_cleans_all_children(self):
        process = subprocess.Popen(self.command, env=self.environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        leader = process_identity(process.pid); request = None
        try:
            deadline = time.monotonic() + 12
            while process.poll() is None and time.monotonic() < deadline:
                request = next(self.evidence.rglob('capture-1-before-operation-request.json'), None)
                if request: break
                time.sleep(.02)
            if not request:
                self.fail('fixed production entry did not reach before-request: ' + (process.stderr.read().decode() if process.poll() is not None else 'deadline'))
            value = read_private(request)
            self.assertEqual(value['operation_id'], self.operation_id)
            self.assertEqual(value['capture_binding']['role'], 'admin')
            self.assertEqual(value['expected_observer'], self.observer)
            barriers = list(self.evidence.rglob('flock-barrier.json')); self.assertEqual(len(barriers), 1)
            barrier = read_private(barriers[0]); self.assertEqual(len(barrier['guards']), 4)
            self.assertEqual(barrier['command'][1], str(SCRIPTS / 'qualify-preparation.mjs'))
            self.assertEqual(barrier['flock_policy'], 'deny-all-EPERM')
            self.assertFalse(any(self.evidence.rglob('ui-completion.json')))
            self.assertFalse(any(self.evidence.rglob('fixture-browser.json')))
        finally:
            if process.poll() is None:
                daemon = json.loads(subprocess.check_output(['multica', 'daemon', 'status', '--output', 'json']))
                daemon_pid = daemon.get('pid', daemon.get('daemon_pid'))
                self.assertIsInstance(daemon_pid, int); self.assertNotEqual(process.pid, daemon_pid)
                current = process_identity(process.pid)
                self.assertEqual(current['start_ticks'], leader['start_ticks'])
                process.send_signal(signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=12)
            records = [leader]
            for path in self.evidence.rglob('supervisor-result.json'): records.extend(read_private(path)['processes'])
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / 'qualification-production-before-cancel.json',
                    {'processes': records, 'returncode': process.returncode, 'stderr_sha256': hashlib.sha256(stderr).hexdigest()})
            for record in records:
                current = process_identity(record['pid'])
                self.assertTrue(current is None or current['start_ticks'] != record['start_ticks'] or current['state'] in {'Z', 'X'})
        self.assertNotEqual(process.returncode, 0)
        self.assertTrue(all(read_private(p)['account_state'] == 'planned' for p in self.configs))
        self.assertEqual(len(list(Path(self.environment['HOME']).rglob('*.active.json'))), 3)
        for lock in [self.cards / self.issue / '.accounts.lock', *Path(self.environment['HOME']).rglob('*.lock')]:
            fd = os.open(lock, os.O_RDWR)
            try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally: os.close(fd)

    def test_wrong_owner_operation_or_config_binding_refuses_before_effects(self):
        for field, value in [('operation_id', str(uuid4())), ('configs', [])]:
            with self.subTest(field=field):
                write_private(self.grant, {**self.authorization, field: value})
                result = subprocess.run(self.command, env=self.environment, capture_output=True, timeout=5)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b'PRIVATE_PARENT', result.stderr)
                self.assertFalse(self.evidence.exists())
                self.assertEqual(list(Path(self.environment['HOME']).rglob('*.active.json')), [])

    def test_direct_fixed_child_without_parent_guards_cannot_read_configs_or_launch(self):
        operation = self.root / 'operation.json'
        write_private(operation, {'schema': 'lab53-preparation-operation-v1', **self.authorization})
        environment = {k: v for k, v in os.environ.items() if k != 'LOGINOM_ACCOUNTS_GUARDS_FILE'}
        result = subprocess.run([self.dependencies['node'], SCRIPTS / 'qualify-preparation.mjs',
            '--operation-file', operation, '--config', self.root / 'must-not-read.json'], env=environment, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0); self.assertIn(b'UNKNOWN', result.stderr)
        self.assertFalse((self.root / 'must-not-read.json').exists())

class LegacyTransaction(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.paths = [self.root / 'fixture.active.json', self.root / 'fixture.lock.active.json']
        for n, p in enumerate(self.paths): write_private(p, {'state': 'UNKNOWN', 'old_missing_facts': None, 'fixture': n})
        self.markers = [owner.binding(str(p)) for p in self.paths]
        self.history = self.root / 'history'; self.receipt = self.root / 'receipt.json'

    def tearDown(self): self.temp.cleanup()

    def assert_originals(self):
        self.assertEqual([owner.binding(str(p)) for p in self.paths], self.markers)
        self.assertFalse(self.receipt.exists())

    def test_second_history_link_failure_keeps_both_originals_and_first_immutable_link(self):
        original = os.link; count = 0
        def fail_second(src, dst, **kwargs):
            nonlocal count
            if Path(dst).parent == self.history:
                count += 1
                if count == 2: raise OSError('second link fixture fault')
            return original(src, dst, **kwargs)
        with patch.object(os, 'link', fail_second), self.assertRaisesRegex(OSError, 'second link fixture fault'):
            owner.archive_legacy(self.markers, self.history, self.receipt, {'fixture': True})
        self.assert_originals(); self.assertEqual(len(list(self.history.iterdir())), 1)
        self.assertEqual(next(self.history.iterdir()).stat().st_ino, self.markers[0]['inode'])

    def test_receipt_failure_after_removal_restores_exact_bytes_and_inodes(self):
        with patch.object(owner, 'write_private', side_effect=OSError('receipt fixture fault')):
            with self.assertRaisesRegex(OSError, 'receipt fixture fault'):
                owner.archive_legacy(self.markers, self.history, self.receipt, {'fixture': True})
        self.assert_originals(); self.assertEqual(len(list(self.history.iterdir())), 2)

    def test_success_preserves_all_original_bytes_in_history(self):
        owner.archive_legacy(self.markers, self.history, self.receipt, {'history_state': 'UNKNOWN_PRESERVED'})
        self.assertTrue(all(not p.exists() for p in self.paths))
        receipt = read_private(self.receipt); self.assertEqual(receipt['history_state'], 'UNKNOWN_PRESERVED')
        for old, current in zip(self.markers, receipt['markers']):
            self.assertEqual(Path(current['file']).stat().st_ino, old['inode'])
            self.assertEqual(hashlib.sha256(Path(current['file']).read_bytes()).hexdigest(), old['sha256'])

    def test_non_string_starttick_or_live_exact_writer_is_unknown(self):
        with self.assertRaisesRegex(RuntimeError, 'PROCESS_RECORDS_REQUIRED'): owner.check_absent([{'pid': 999999999, 'start_ticks': 1}])
        with self.assertRaisesRegex(RuntimeError, 'WRITER_PRESENT'): owner.check_absent([process_identity(os.getpid())])

    def test_real_readonly_census_controls_and_denials_never_become_absence(self):
        lock = self.root / 'fixture.lock'; lock.touch(mode=0o600)
        fd = os.open(lock, os.O_RDWR); fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            request = {'operation_id': str(uuid4()), 'nonce': 'f' * 64, 'guardian': process_identity(os.getpid()),
                'guard': {**owner.binding(str(lock)), 'fd': fd}, 'targets': [owner.binding(str(lock)), *self.markers]}
            request_file = self.root / 'fd-request.json'; write_private(request_file, request)
            result = subprocess.run([sys.executable, SCRIPTS / 'own-fd-inventory.py', request_file], capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            proof = json.loads(result.stdout)
            self.assertTrue(proof['before']['control_observed']); self.assertTrue(proof['after']['control_observed'])
            records = [proof['before']['control'], proof['after']['control']]
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / 'historical-fd-collector.json', {'processes': records})
            if proof['before']['errors'] or proof['after']['errors']:
                with self.assertRaisesRegex(RuntimeError, 'FD_CENSUS_(INCOMPLETE|CHANGED)'): owner.validate_fd_proof(request, proof)
            elif proof['before']['visible_pids'] != proof['after']['visible_pids']:
                with self.assertRaisesRegex(RuntimeError, 'FD_CENSUS_CHANGED'): owner.validate_fd_proof(request, proof)
            else: owner.validate_fd_proof(request, proof)
            for sample in ['before', 'after']:
                broken = json.loads(json.dumps(proof)); broken[sample]['errors'].append({'pid': os.getpid(), 'error': 'PermissionError'})
                with self.assertRaisesRegex(RuntimeError, 'FD_CENSUS_(INCOMPLETE|CHANGED)'): owner.validate_fd_proof(request, broken)
            broken = {**proof, 'nonce': '0' * 64}
            with self.assertRaisesRegex(RuntimeError, 'FD_BINDING_UNKNOWN'): owner.validate_fd_proof(request, broken)
        finally: os.close(fd)

if __name__ == '__main__': unittest.main()
