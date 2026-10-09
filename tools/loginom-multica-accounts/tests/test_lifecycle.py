import fcntl
import ctypes
import importlib.util
import json
import hashlib
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
from common import write_private, read_private, process_identity, begin_account_effect, marker_paths, private_snapshot
spec = importlib.util.spec_from_file_location('provision_lifecycle', SCRIPTS / 'provision-accounts.py')
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)


class ConnectedLifecycle(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.issue = str(uuid4())
        self.operator = self.root / 'operator.json'
        write_private(self.operator, {'admin_user': 'synthetic-admin', 'node': '/no-node',
            'agents': {'worker': 'w', 'reviewer': 'r'}, 'workspace_id': 'workspace',
            'url': 'https://fixture.invalid', 'api_key': 'SYNTHETIC_KEY'})
        self.cards = self.root / 'cards'
        self.locks = self.root / 'locks'
        self.previous = {name: [] for name in ['synthetic-admin', *[provision.planned_username(self.issue, r)
                          for r in ['worker', 'reviewer']]]}

    def tearDown(self):
        self.temporary.cleanup()

    def guard(self, previous=None):
        return provision.preparation_guard(self.issue, self.operator, self.cards,
            self.previous if previous is None else previous, self.root / 'attempt', self.locks)

    def assert_absent(self, records):
        for record in records:
            current = process_identity(record['pid'])
            self.assertTrue(current is None or current['start_ticks'] != record['start_ticks'] or current['state'] in {'Z', 'X'})

    def test_guard_returns_all_held_fds_and_previous_exact_records(self):
        child = subprocess.Popen([sys.executable, '-c', 'import sys;sys.stdin.read()'], stdin=subprocess.PIPE)
        record = process_identity(child.pid)
        child.communicate(timeout=3)
        previous = {name: [record] for name in self.previous}
        with self.guard(previous) as context:
            self.assertEqual(set(context['guards']), set(previous))
            for guard in context['guards'].values():
                self.assertEqual(guard['previous_processes_absent'], [record])
                self.assertEqual(os.fstat(guard['fd']).st_ino, guard['inode'])
            self.assertEqual(os.fstat(context['pair_guard']['fd']).st_ino, context['pair_guard']['inode'])
            configs = provision.allocate(self.issue, self.operator, self.cards, held_pair=context['pair_guard'])
            self.assertEqual(len(configs), 2)  # No second flock or self-deadlock.
        for guard in [context['pair_guard'], *context['guards'].values()]:
            with self.assertRaises(OSError): os.fstat(guard['fd'])

    def test_missing_or_live_previous_records_block_before_effect(self):
        with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_HISTORY_PROVENANCE_REQUIRED'):
            with self.guard({}): self.fail('missing history admitted')
        # A different new attempt directory preserves the failed attempt.
        child = subprocess.Popen([sys.executable, '-c', 'import sys;print("ready",flush=True);sys.stdin.read()'],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        child.stdout.readline()
        try:
            previous = {name: [process_identity(child.pid)] for name in self.previous}
            with self.assertRaisesRegex(RuntimeError, 'ACCOUNT_WRITER_PRESENT'):
                with provision.preparation_guard(self.issue, self.operator, self.cards, previous,
                                                self.root / 'attempt-two', self.locks): self.fail('live writer admitted')
            self.assertEqual(list(self.locks.glob('*.active.json')), [])
        finally:
            child.communicate(timeout=3)

    def run_child(self, mode):
        with self.guard() as context:
            guards = [context['pair_guard'], *context['guards'].values()]
            attempt = str(uuid4())
            for role, name in context['role_names'].items():
                begin_account_effect(context['guards'][name], self.issue, role, attempt, 'a' * 40)
            markers = {str(p): p.read_bytes() for g in context['guards'].values() for p in marker_paths(g['path']) if p.exists()}
            capture = self.root / 'child.json'
            script = self.root / 'child.py'
            script.write_text('''import os,sys,json,fcntl,subprocess,time,signal
from pathlib import Path
envelope=json.loads(Path(os.environ['LOGINOM_ACCOUNTS_GUARDS_FILE']).read_text())
directory=Path(os.environ['LOGINOM_ACCOUNTS_GUARDS_FILE']).parent
assert any(json.loads(p.read_text()).get('phase')=='process-start' for p in directory.glob('event-*.json'))
results=[]
for guard in envelope['guards']:
 info=os.fstat(guard['fd']);assert (info.st_dev,info.st_ino)==(guard['device'],guard['inode'])
 fd=os.open(guard['path'],os.O_RDWR)
 try:
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);raise AssertionError('lost lock')
  except BlockingIOError:results.append(guard['fd'])
 finally:os.close(fd)
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as stream:json.dump(results,stream)
mode=sys.argv[2]
if mode!='normal':
 subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],pass_fds=tuple(results))
 time.sleep(.08)
 if mode=='orphan':sys.exit(0)
 if mode=='cancel':os.kill(os.getppid(),signal.SIGTERM)
 time.sleep(30)
''')
            run_dir = context['evidence_dir'] / 'child'
            binding = {'issue_id': self.issue, 'operation_id': attempt, 'source_sha': 'a' * 40}
            if mode == 'normal':
                self.assertEqual(provision.run_foreground([sys.executable, script, capture, mode], guards, run_dir,
                                                        timeout=3, stop_timeout=.15, operation_binding=binding), 0)
            else:
                expected = {'cancel': 'CANCELLED', 'orphan': 'CHILDREN_REMAINED', 'timeout': 'TIMEOUT'}[mode]
                with self.assertRaisesRegex(RuntimeError, expected):
                    provision.run_foreground([sys.executable, script, capture, mode], guards, run_dir,
                                             timeout=.4, stop_timeout=.15, operation_binding=binding)
            self.assertEqual(len(json.loads(capture.read_text())), 4)
            receipts = [json.loads(p.read_text()) for p in run_dir.glob('event-*.json')]
            cleanup = next(r for r in receipts if r.get('phase') == 'process-cleanup')
            self.assertEqual(cleanup['process_cleanup'], 'PASS')
            self.assertEqual(cleanup['state'], 'UNKNOWN')
            for key, value in binding.items(): self.assertEqual(cleanup[key], value)
            self.assertEqual(cleanup['server_absence'], 'NOT_PROVED')
            self.assertGreaterEqual(len(cleanup['processes']), 1 if mode == 'normal' else 2)
            self.assert_absent(cleanup['processes'])
            for path, raw in markers.items(): self.assertEqual(Path(path).read_bytes(), raw)
            for g in guards: self.assertEqual(os.fstat(g['fd']).st_ino, g['inode'])
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / (mode + '.json'), cleanup)
        # Check actual flock freedom after all parent/child FDs close. UNKNOWN
        # markers remain and would still deny reuse despite this local result.
        for g in guards:
            fd = os.open(g['path'], os.O_RDWR)
            try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally: os.close(fd)

    def test_four_fds_and_flocks_survive_exec(self): self.run_child('normal')

    def test_kernel_barrier_blocks_unlock_relock_even_after_fork_and_sets_id(self):
        with self.guard() as context:
            guards = [context['pair_guard'], *context['guards'].values()]
            code = '''import os,json,fcntl,errno
from pathlib import Path
guards=json.loads(Path(os.environ['LOGINOM_ACCOUNTS_GUARDS_FILE']).read_text())['guards']
pid=os.fork()
if pid==0:
 os.setsid()
 for guard in guards:
  for fd in [guard['fd'],os.dup(guard['fd'])]:
   for operation in [fcntl.LOCK_UN,fcntl.LOCK_EX|fcntl.LOCK_NB]:
    try:fcntl.flock(fd,operation);raise AssertionError('barrier bypass')
    except PermissionError as e:assert e.errno==errno.EPERM
 os._exit(0)
assert os.waitpid(pid,0)[1]==0
'''
            self.assertEqual(provision.run_foreground([sys.executable, '-c', code], guards,
                context['evidence_dir'] / 'barrier', timeout=5, guard_barrier=True), 0)
            for guard in guards:
                fd = os.open(guard['path'], os.O_RDWR)
                try:
                    with self.assertRaises(BlockingIOError): fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finally: os.close(fd)
            proof = read_private(context['evidence_dir'] / 'barrier' / 'flock-barrier.json')
            self.assertEqual(proof['flock_policy'], 'deny-all-EPERM')
            cleanup = read_private(context['evidence_dir'] / 'barrier' / 'supervisor-result.json')
            self.assert_absent(cleanup['processes'])
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / 'barrier.json', cleanup)

    def run_linked_harness(self, mode):
        dependencies_file = Path.home() / '.config/loginom-multica/operator.json'
        dependencies = read_private(dependencies_file)
        write_private(self.operator, {**read_private(self.operator), 'admin_user': 'admin', 'admin_password': 'synthetic', 'url': 'about:blank'})
        self.previous = {name: [] for name in ['admin', *[provision.planned_username(self.issue, role) for role in ['worker', 'reviewer']]]}
        with self.guard() as context:
            configs = provision.allocate(self.issue, self.operator, self.cards, held_pair=context['pair_guard'])
            snapshots = [private_snapshot(self.operator), *[private_snapshot(path) for path in configs]]
            attempt = str(uuid4()); source_sha = 'a' * 40
            version = SCRIPTS.parent / 'VERSION.json'
            source = {'sha': source_sha, 'tree': 'b' * 40, 'manifest_sha256': hashlib.sha256(version.read_bytes()).hexdigest()}
            for role, name in context['role_names'].items():
                context['guards'][name]['configs'] = snapshots
                begin_account_effect(context['guards'][name], self.issue, role, attempt, source_sha)
            expected = {'guid_hash': hashlib.sha256(b'owner-guid').hexdigest(), 'user_hash': hashlib.sha256(b'admin').hexdigest(),
                'session_id': 90, 'create_time': '2026-10-09T00:00:00.000Z', 'tab_binding_sha256': hashlib.sha256(b'authorized-tab').hexdigest(), 'stand': 'about:blank'}
            operation = {'issue_id': self.issue, 'operation_id': attempt, 'source': source, 'stand': 'about:blank', 'expected_observer': expected}
            operation_file = context['evidence_dir'] / 'operation.json'; write_private(operation_file, operation)
            audit = {'schema': 'parent-held-audited-harness-v1', 'source_sha': source_sha,
                'manifest_sha256': source['manifest_sha256'], 'entrypoint': 'qualify-preparation.mjs', 'parent': process_identity(os.getpid())}
            responder = subprocess.Popen([sys.executable, SCRIPTS.parent / 'tests/parent-fixture.py', context['evidence_dir'], mode])
            responder_record = process_identity(responder.pid)
            old = os.environ.get('LAB53_FIXTURE_DEPENDENCIES'); os.environ['LAB53_FIXTURE_DEPENDENCIES'] = str(dependencies_file)
            guards = [context['pair_guard'], *context['guards'].values()]; directory = context['evidence_dir'] / 'linked'
            try:
                command = [dependencies['node'], SCRIPTS.parent / 'tests/linked-harness.mjs', self.operator, operation_file, *configs, directory, mode]
                result = provision.run_foreground(command, guards, directory, timeout=25, stop_timeout=1,
                    guard_barrier=True, harness_audit=audit, operation_binding={'issue_id': self.issue, 'operation_id': attempt, 'source_sha': source_sha})
                if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                    saved = read_private(directory / 'supervisor-result.json')
                    extra = read_private(directory / 'fixture-browser.json').get('observed_processes', []) if (directory / 'fixture-browser.json').exists() else []
                    write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / ('linked-start-' + mode + '.json'),
                        {'processes': saved['processes'] + extra + [responder_record]})
                self.assertEqual(result, 0 if mode in ['normal', 'readback', 'ready-write-failure', 'archive-stale', 'archive-second-fault'] else 1,
                    (directory / 'stderr.log').read_text()[-3500:])
                if mode == 'identity': self.assertIn('FINAL_SERVER_READBACK_INCOMPLETE', (directory / 'stderr.log').read_text())
                if mode == 'rights': self.assertIn('ACCOUNT_RIGHTS_UNCONFIRMED', (directory / 'stderr.log').read_text())
                if mode == 'logout': self.assertIn('waitForFunction', (directory / 'stderr.log').read_text())
                cleanup = next(read_private(path) for path in directory.glob('event-*.json') if read_private(path).get('phase') == 'process-cleanup')
                self.assert_absent(cleanup['processes'])
                browser = read_private(directory / 'fixture-browser.json')
                self.assertEqual(browser['network_requests'], 0); self.assertTrue(browser['sandbox'])
                self.assert_absent(browser['observed_processes'])
                if mode in ['normal', 'readback', 'ready-write-failure', 'archive-stale', 'archive-second-fault']:
                    completion = read_private(directory / 'ui-completion.json'); receipts = completion['receipts']
                    self.assertEqual([item['role'] for item in receipts], ['admin', 'worker', 'admin', 'reviewer'])
                    self.assertTrue(all(item['logout']['transport_disconnected'] for item in receipts))
                    # Actual completed UI subtree drives production final request
                    # and one-use validator, after all inherited own FDs exit.
                    effects = [item['effect'] for item in receipts]
                    logout_file = directory / 'logout.json'; write_private(logout_file, {'issue_id': self.issue, 'operation_id': attempt,
                        'source_sha': source_sha, 'effects': effects, 'receipts': receipts,
                        'all_ui_logout_invoked': True, 'all_transports_disconnected': True})
                    cleanup_file = next(path for path in directory.glob('event-*.json') if read_private(path).get('phase') == 'process-cleanup')
                    final = context['evidence_dir'] / 'final'; final.mkdir(mode=0o700)
                    inputs = {'directory': str(final), 'issueId': self.issue, 'operationId': attempt, 'source': source, 'stand': 'about:blank',
                        'configs': list(map(str, [self.operator, *configs])), 'effects': effects, 'cleanupFile': str(cleanup_file),
                        'logoutFile': str(logout_file), 'expectedObserver': expected}
                    input_file = final / 'input.json'; write_private(input_file, inputs)
                    collector = [dependencies['node'], SCRIPTS / 'finalize-preparation.mjs']
                    self.assertEqual(provision.run_foreground([*collector, 'request', input_file], [], final / 'request', timeout=5), 0)
                    response = final / 'parent-response.json'; deadline = time.monotonic() + 3
                    while not response.exists() and time.monotonic() < deadline: time.sleep(.01)
                    self.assertTrue(response.exists())
                    verify_file = final / 'verify.json'; write_private(verify_file, {'directory': str(final), 'requestFile': str(final / 'parent-request.json'),
                        'responseFile': str(response), 'expected': {'issue_id': self.issue, 'operation_id': attempt, 'source_sha': source_sha,
                            'source_tree': source['tree'], 'manifest_sha256': source['manifest_sha256'], 'config_paths': inputs['configs'],
                            'cleanup_file': str(cleanup_file), 'logout_file': str(logout_file), 'expected_observer': expected}})
                    self.assertEqual(provision.run_foreground([*collector, 'verify', verify_file], [], final / 'verify', timeout=5),
                        0 if mode != 'readback' else 1)
                    self.assertEqual((final / 'final-proof.json').exists(), mode != 'readback')
                    if mode != 'readback':
                        spec = importlib.util.spec_from_file_location('fixture_archive', SCRIPTS / 'owner-archive.py')
                        archive = importlib.util.module_from_spec(spec); spec.loader.exec_module(archive)
                        proof_file = final / 'final-proof.json'
                        all_markers = {}; marker_bytes = {}
                        context['operator_path'] = self.operator
                        original_configs = {path: read_private(path) for path in configs}
                        for name, guard in context['guards'].items():
                            guard['role'] = next(role for role, username in context['role_names'].items() if username == name)
                            markers = []; all_markers[name] = markers
                            for path in marker_paths(guard['path']):
                                if path.exists():
                                    info = path.stat(); markers.append({'path': str(path), 'device': info.st_dev, 'inode': info.st_ino,
                                        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                            broken = [dict(item, sha256='0' * 64) for item in markers]
                            with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_MARKER_CHANGED'):
                                archive.archive_owned(guard, broken, snapshots, operation, verify_file, proof_file, [], self.root / ('rejected-' + name))
                            marker_bytes.update({item['path']: Path(item['path']).read_bytes() for item in markers})
                        if mode == 'archive-stale':
                            os.utime(next(iter(marker_bytes)))
                            with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_FINAL_PROOF_STALE'):
                                provision.finish_qualified_pair(context, configs, operation, verify_file, proof_file, all_markers, cleanup['processes'])
                            for path, original in original_configs.items(): self.assertEqual(read_private(path), original)
                            self.assertTrue(all(Path(path).exists() for path in marker_bytes))
                        elif mode == 'archive-second-fault':
                            calls = 0; original_link = os.link
                            def fail_second_archive(source, destination, **kwargs):
                                nonlocal calls
                                if 'history-' in str(destination):
                                    calls += 1
                                    if calls == 2: raise OSError('synthetic second archive failure')
                                return original_link(source, destination, **kwargs)
                            with patch.object(os, 'link', fail_second_archive):
                                with self.assertRaisesRegex(OSError, 'synthetic second archive failure'):
                                    provision.finish_qualified_pair(context, configs, operation, verify_file, proof_file, all_markers, cleanup['processes'])
                            self.assertEqual(calls, 2)
                            for path, original in original_configs.items(): self.assertEqual(read_private(path), original)
                            for entries in all_markers.values():
                                for entry in entries:
                                    p = Path(entry['path'])
                                    self.assertEqual(p.read_bytes(), marker_bytes[str(p)])
                                    self.assertEqual(p.stat().st_ino, entry['inode'])
                                    self.assertEqual(read_private(p)['state'], 'UNKNOWN')
                            failure = next(read_private(p) for p in context['evidence_dir'].glob('event-*.json')
                                if read_private(p).get('phase') == 'pair-qualified-write-failed')
                            self.assertEqual(failure['restore_failures'], [])
                        elif mode == 'ready-write-failure':
                            calls = 0; original_write = provision.write_private
                            def fail_second_ready(path, data):
                                nonlocal calls
                                if path in configs and data.get('account_state') == 'ready':
                                    calls += 1
                                    if calls == 2: raise OSError('synthetic ready write failure')
                                return original_write(path, data)
                            with patch.object(provision, 'write_private', fail_second_ready):
                                with self.assertRaisesRegex(OSError, 'synthetic ready write failure'):
                                    provision.finish_qualified_pair(context, configs, operation, verify_file, proof_file, all_markers, cleanup['processes'])
                            for path, original in original_configs.items(): self.assertEqual(read_private(path), original)
                            for guard in context['guards'].values():
                                self.assertEqual(read_private(Path(guard['path']).with_suffix('.active.json'))['state'], 'UNKNOWN')
                        else:
                            qualified = provision.finish_qualified_pair(context, configs, operation, verify_file, proof_file, all_markers, cleanup['processes'])
                            self.assertTrue(qualified['ready']); self.assertEqual(qualified['status'], 'PAIR_QUALIFIED')
                            for path, original in original_configs.items():
                                self.assertEqual(read_private(path), {**original, 'account_state': 'ready'})
                            self.assertFalse(any(Path(path).exists() for path in marker_bytes))
                        for guard in context['guards'].values():
                            history = context['evidence_dir'] / ('history-' + guard['role'])
                            if mode not in ['archive-stale', 'archive-second-fault']:
                                self.assertEqual(len(list(history.iterdir())), 1)
                                self.assertIn(next(history.iterdir()).read_bytes(), marker_bytes.values())
                            self.assertTrue(Path(guard['path']).exists())
                if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                    write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / ('linked-' + mode + '.json'),
                        {'processes': cleanup['processes'] + browser['observed_processes'] + [responder_record]})
            finally:
                (context['evidence_dir'] / 'fixture-stop').touch()
                responder.wait(timeout=3); self.assert_absent([responder_record])
                if old is None: os.environ.pop('LAB53_FIXTURE_DEPENDENCIES', None)
                else: os.environ['LAB53_FIXTURE_DEPENDENCIES'] = old
        for guard in guards:
            fd = os.open(guard['path'], os.O_RDWR)
            try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally: os.close(fd)

    def test_full_fixed_harness_admin_capture_roles_all_logout_process_and_final_response(self): self.run_linked_harness('normal')
    def test_fixed_harness_incomplete_identity_stays_unknown(self): self.run_linked_harness('identity')
    def test_fixed_harness_incomplete_rights_stays_unknown(self): self.run_linked_harness('rights')
    def test_fixed_harness_incomplete_logout_stays_unknown(self): self.run_linked_harness('logout')
    def test_fixed_harness_incomplete_final_readback_stays_unknown(self): self.run_linked_harness('readback')
    def test_ready_write_failure_preserves_history_and_blocks_partial_pair(self): self.run_linked_harness('ready-write-failure')
    def test_first_archive_success_second_link_failure_restores_exact_unknown_markers_and_planned_pair(self): self.run_linked_harness('archive-second-fault')
    def test_recreated_marker_cannot_reuse_an_earlier_same_operation_proof(self): self.run_linked_harness('archive-stale')
    def test_timeout_cleans_exact_children_without_erasing_unknown(self): self.run_child('timeout')
    def test_cancel_cleans_exact_children_without_erasing_unknown(self): self.run_child('cancel')
    def test_success_with_orphan_cleans_but_does_not_accept(self): self.run_child('orphan')

    def test_new_private_evidence_is_mandatory_and_not_reused(self):
        with self.guard(): pass
        before = sorted((self.root / 'attempt').iterdir())
        with self.assertRaises(FileExistsError):
            with self.guard(): self.fail('attempt directory reused')
        self.assertEqual(sorted((self.root / 'attempt').iterdir()), before)
        self.assertEqual((self.root / 'attempt').stat().st_mode & 0o777, 0o700)
        for p in before: self.assertEqual(p.stat().st_mode & 0o777, 0o600)

    def test_node_receives_and_checks_four_fds_pair_and_recorded_effects(self):
        node = read_private(Path.home() / '.config/loginom-multica/operator.json')['node']
        with self.guard() as context:
            configs = provision.allocate(self.issue, self.operator, self.cards, held_pair=context['pair_guard'])
            snapshots = [private_snapshot(self.operator), *[private_snapshot(p) for p in configs]]
            attempt = str(uuid4())
            for role, name in context['role_names'].items():
                guard = context['guards'][name]
                guard['configs'] = snapshots
                begin_account_effect(guard, self.issue, role, attempt, 'a' * 40)
            code = '''import {readFileSync} from 'node:fs';
import {verifyPairBindings} from './scripts/qualify-accounts.mjs';
import {verifyInheritedGuards,verifyRecordedEffects} from './scripts/account-lifecycle.mjs';
import {verifyHeldAccountGuard} from './scripts/account-identity.mjs';
const [operatorFile,...files]=process.argv.slice(1);
const operator=JSON.parse(readFileSync(operatorFile));
const configs=files.map(path=>JSON.parse(readFileSync(path)));
verifyPairBindings(configs,operator,operatorFile);
const envelope=verifyInheritedGuards(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE,configs,operator);
verifyRecordedEffects(envelope,configs,operator);
for (const username of [operator.admin_user,...configs.map(config=>config.loginom.username)])
  verifyHeldAccountGuard(envelope.guards.find(guard=>guard.path.endsWith('/'+username+'.lock')),username);
'''
            guards = [context['pair_guard'], *context['guards'].values()]
            command = [node, '--input-type=module', '--eval', code, self.operator, *configs]
            self.assertEqual(provision.run_foreground(command, guards, context['evidence_dir'] / 'node', timeout=5), 0)
            self.assertEqual(provision.run_foreground(command, guards[:-1], context['evidence_dir'] / 'missing-fd', timeout=5), 1)
            for name in ('node', 'missing-fd'):
                receipt = next(json.loads(p.read_text()) for p in (context['evidence_dir'] / name).glob('event-*.json')
                               if json.loads(p.read_text()).get('phase') == 'process-cleanup')
                self.assert_absent(receipt['processes'])
                if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                    write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / (name + '.json'), receipt)

    def run_detached(self, mode):
        # Only the fixture collector becomes a subreaper, so a failing baseline
        # cannot orphan its known escaped PID under init. Restore on every exit.
        libc = ctypes.CDLL(None, use_errno=True)
        previous = ctypes.c_int()
        self.assertEqual(libc.prctl(37, ctypes.byref(previous), 0, 0, 0), 0)
        self.assertEqual(libc.prctl(36, 1, 0, 0, 0), 0)
        foreign = subprocess.Popen([sys.executable, '-c', 'import sys;sys.stdin.read()'], stdin=subprocess.PIPE,
                                   start_new_session=True)
        foreign_record = process_identity(foreign.pid)
        escaped = self.root / 'escaped.json'
        try:
            with self.guard() as context:
                guards = [context['pair_guard'], *context['guards'].values()]
                attempt = str(uuid4())
                for role, name in context['role_names'].items():
                    begin_account_effect(context['guards'][name], self.issue, role, attempt, 'a' * 40)
                markers = {str(p): p.read_bytes() for g in context['guards'].values()
                           for p in marker_paths(g['path']) if p.exists()}
                script = self.root / 'detached.py'
                script.write_text('''import os,sys,json,signal,time
from pathlib import Path
guards=json.loads(Path(os.environ['LOGINOM_ACCOUNTS_GUARDS_FILE']).read_text())['guards']
mode=sys.argv[2]
if os.fork()==0:
 os.setsid()
 if mode=='double-fork' and os.fork()!=0:os._exit(0)
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 for guard in guards:
  info=os.fstat(guard['fd']);assert (info.st_dev,info.st_ino)==(guard['device'],guard['inode'])
 fields=Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()
 fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as stream:json.dump({'pid':os.getpid(),'start_ticks':fields[19],'pgid':int(fields[2]),'sid':int(fields[3]),'fds':len(guards)},stream)
 while True:time.sleep(30)
while not Path(sys.argv[1]).exists():time.sleep(.001)
if mode in ('success','double-fork'):os._exit(0)
if mode=='cancel':os.kill(os.getppid(),signal.SIGTERM)
time.sleep(30)
''')
                run_dir = context['evidence_dir'] / 'detached'
                expected = {'success': 'CHILDREN_REMAINED', 'double-fork': 'CHILDREN_REMAINED',
                            'timeout': 'TIMEOUT', 'cancel': 'CANCELLED'}[mode]
                try:
                    with self.assertRaisesRegex(RuntimeError, expected):
                        provision.run_foreground([sys.executable, script, escaped, mode], guards, run_dir,
                                                 timeout=.5, stop_timeout=.15)
                    leaf = json.loads(escaped.read_text())
                    self.assertEqual(leaf['fds'], 4)
                    receipts = [json.loads(p.read_text()) for p in run_dir.glob('event-*.json')]
                    cleanup = next(r for r in receipts if r.get('phase') == 'process-cleanup')
                    self.assertEqual(cleanup['process_cleanup'], 'PASS')
                    self.assertIsNotNone(cleanup['failure'])
                    self.assertTrue(any(r['pid'] == leaf['pid'] and r['start_ticks'] == leaf['start_ticks']
                                        for r in cleanup['processes']))
                    self.assert_absent(cleanup['processes'])
                    self.assertEqual(process_identity(foreign.pid)['start_ticks'], foreign_record['start_ticks'])
                    self.assertNotIn(foreign.pid, [r['pid'] for r in cleanup['processes']])
                    for path, raw in markers.items(): self.assertEqual(Path(path).read_bytes(), raw)
                    for g in guards: self.assertEqual(os.fstat(g['fd']).st_ino, g['inode'])
                    if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                        write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR']) / ('detached-' + mode + '.json'), cleanup)
                finally:
                    # Safety for expected RED against reviewed source. Signal
                    # only this exact captured leaf, after a fresh daemon check.
                    if escaped.exists():
                        leaf = json.loads(escaped.read_text())
                        current = process_identity(leaf['pid'])
                        if current and current['start_ticks'] == leaf['start_ticks'] and current['state'] not in {'Z', 'X'}:
                            daemon = json.loads(subprocess.check_output(['multica', 'daemon', 'status', '--output', 'json'], text=True))
                            self.assertNotEqual(leaf['pid'], daemon['pid'])
                            fd = os.pidfd_open(leaf['pid'])
                            try:
                                self.assertEqual(process_identity(leaf['pid'])['start_ticks'], leaf['start_ticks'])
                                signal.pidfd_send_signal(fd, signal.SIGKILL)
                            finally: os.close(fd)
                        try: os.waitpid(leaf['pid'], 0)
                        except ChildProcessError: pass
            for g in guards:
                fd = os.open(g['path'], os.O_RDWR)
                try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finally: os.close(fd)
        finally:
            foreign.communicate(timeout=3)
            self.assertEqual(libc.prctl(36, previous.value, 0, 0, 0), 0)

    def test_detached_success_is_rejected_and_exact_child_reaped(self): self.run_detached('success')
    def test_detached_timeout_cleans_exact_child(self): self.run_detached('timeout')
    def test_detached_cancel_cleans_exact_child(self): self.run_detached('cancel')
    def test_rapid_double_fork_is_adopted_and_cleans_exact_child(self): self.run_detached('double-fork')

    def test_exec_failure_does_not_run_supervisor_result_writer_in_child(self):
        with self.guard() as context:
            guards = [context['pair_guard'], *context['guards'].values()]
            directory = context['evidence_dir'] / 'missing-executable'
            self.assertEqual(provision.run_foreground(['/no-such-lab53-fixture-command'], guards, directory,
                                                     timeout=3, stop_timeout=.15), 127)
            receipt = read_private(directory / 'supervisor-result.json')
            self.assertEqual(receipt['process_cleanup'], 'PASS')
            self.assertEqual(receipt['returncode'], 127)
            self.assertEqual(len(receipt['processes']), 1)
            self.assertTrue(receipt['processes'][0]['reaped'])
            self.assert_absent(receipt['processes'])

    def test_unknown_child_provenance_blocks_exec_and_cleanup_pass(self):
        # Fault injection is confined to this isolated fixture process, at the
        # actual child stat read before exec ACK; production has no test flag.
        driver = self.root / 'unknown-provenance.py'
        driver.write_text('''import os,sys,json,importlib.util
from pathlib import Path
sys.path.insert(0,sys.argv[1])
spec=importlib.util.spec_from_file_location('fixture_supervisor',Path(sys.argv[1])/'process-supervisor.py')
supervisor=importlib.util.module_from_spec(spec);spec.loader.exec_module(supervisor)
original=supervisor.record
faulted=False
def record(pid):
 global faulted
 if pid!=os.getpid() and not faulted:
  faulted=True
  raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED')
 return original(pid)
supervisor.record=record
directory=Path(sys.argv[2]);directory.mkdir(mode=0o700)
effect=directory/'must-not-exist'
read_fd,write_fd=os.pipe();os.write(write_fd,b'1');os.close(write_fd)
sys.argv=['fixture',str(read_fd),str(os.getppid()),'3','.15',str(directory),sys.executable,'-c',
          'from pathlib import Path;Path('+repr(str(effect))+').write_text("unexpected effect")']
assert supervisor.main()==1
receipt=json.loads((directory/'supervisor-result.json').read_text())
assert faulted and not effect.exists()
assert receipt['process_cleanup']=='UNKNOWN' and receipt['failure'] is not None
assert receipt['processes'] and all(p['reaped'] for p in receipt['processes'])
for item in receipt['processes']:
 current=original(item['pid'])
 assert current is None or not supervisor.same(current,item) or current['state'] in {'Z','X'}
if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
 from common import write_private
 write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/'unknown-provenance-inner.json',receipt)
''')
        with self.guard() as context:
            guards = [context['pair_guard'], *context['guards'].values()]
            directory = context['evidence_dir'] / 'unknown-provenance-outer'
            self.assertEqual(provision.run_foreground([sys.executable, driver, SCRIPTS,
                context['evidence_dir'] / 'unknown-provenance-inner'], guards, directory, timeout=5), 0)
            receipt = read_private(directory / 'supervisor-result.json')
            self.assert_absent(receipt['processes'])


if __name__ == '__main__': unittest.main()
