import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
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
            if mode == 'normal':
                self.assertEqual(provision.run_foreground([sys.executable, script, capture, mode], guards, run_dir,
                                                        timeout=3, stop_timeout=.15), 0)
            else:
                expected = {'cancel': 'CANCELLED', 'orphan': 'CHILDREN_REMAINED', 'timeout': 'TIMEOUT'}[mode]
                with self.assertRaisesRegex(RuntimeError, expected):
                    provision.run_foreground([sys.executable, script, capture, mode], guards, run_dir,
                                             timeout=.4, stop_timeout=.15)
            self.assertEqual(len(json.loads(capture.read_text())), 4)
            receipts = [json.loads(p.read_text()) for p in run_dir.glob('event-*.json')]
            cleanup = next(r for r in receipts if r.get('phase') == 'process-cleanup')
            self.assertEqual(cleanup['process_cleanup'], 'PASS')
            self.assertEqual(cleanup['state'], 'UNKNOWN')
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
const [operatorFile,...files]=process.argv.slice(1);
const operator=JSON.parse(readFileSync(operatorFile));
const configs=files.map(path=>JSON.parse(readFileSync(path)));
verifyPairBindings(configs,operator,operatorFile);
verifyRecordedEffects(verifyInheritedGuards(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE,configs,operator),configs,operator);
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


if __name__ == '__main__': unittest.main()
