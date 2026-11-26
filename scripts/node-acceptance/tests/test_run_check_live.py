from concurrent.futures import ThreadPoolExecutor
import json
import os
import socket
from pathlib import Path
import runpy
import subprocess
import sys
import time
from tempfile import TemporaryDirectory
from threading import Event
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_check_live import LiveChain, browser_owner, write_events


class LiveChainTest(unittest.TestCase):
    def test_owner_guard_rejects_changed_browser_and_nonce(self):
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            chain = LiveChain(profile, profile, profile, 'test-user', '/test-user/sample.lgp', 'p/m', '', lambda: -1, Path(sys.executable))
            chain.owner_file.parent.mkdir()
            chain.owner_file.write_bytes(b'expected nonce')
            chain.owner = b'expected nonce'
            chain.child = Mock(pid=42)
            chain.child.poll.return_value = None
            chain.browser = (11, '1000', profile / 'attempt')
            with patch('run_check_live.browser_owner', return_value=chain.browser) as browser:
                chain.verify_owner()
                browser.return_value = (11, '1001', profile / 'attempt')
                with self.assertRaisesRegex(AssertionError, 'LIVE_CHAIN_BROWSER_OWNER_CHANGED'):
                    chain.verify_owner()
                chain.owner_file.write_bytes(b'new nonce')
                with self.assertRaisesRegex(AssertionError, 'LIVE_CHAIN_PROFILE_OWNER_CHANGED'):
                    chain.verify_owner()

    def test_browser_spawned_by_worker_thread_is_owned(self):
        with TemporaryDirectory() as directory, ThreadPoolExecutor(1) as executor:
            profile = Path(directory)
            browser_dir = profile / 'loginom/runtime/generations/1/chats/chat/attempts/attempt/browser-profile'
            browser_dir.mkdir(parents=True)
            released = Event()
            started = Event()
            children = []

            def spawn():
                with subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)']) as child:
                    (browser_dir / 'SingletonLock').symlink_to(f'{socket.gethostname()}-{child.pid}')
                    children.append(child.pid)
                    started.set()
                    released.wait(5)
                    child.terminate()

            task = executor.submit(spawn)
            try:
                self.assertTrue(started.wait(5))
                executable = Path(sys.executable).resolve()
                found = browser_owner(os.getpid(), profile, executable)
                self.assertIsNone(browser_owner(os.getpid(), profile, executable.with_name('different-browser')))
                self.assertIsNone(browser_owner(-1, profile, executable))
                self.assertIsNotNone(found)
                self.assertEqual((found[0], found[2]), (children[0], browser_dir.parent))
            finally:
                released.set()
                task.result()

    def test_live_turn_stops_as_soon_as_operator_input_is_required(self):
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            chain = LiveChain(profile, profile, profile, 'test-user', '/test-user/sample.lgp', 'p/m', '', lambda: -1, Path(sys.executable))
            chain.child = Mock(pid=42)
            chain.child.poll.return_value = None
            chain.verify_owner = Mock()
            chain.send = Mock()
            chain.pump = Mock()
            messages = [
                dict(id='user', sessionID='chat', role='user', model=dict(providerID='p', modelID='m')),
                dict(id='assistant', sessionID='chat', role='assistant', parentID='user'),
            ]
            parts = [
                (1, 1, dict(type='text', text='Prompt', sessionID='chat', messageID='user')),
                (2, 2, dict(type='tool', tool='question', state={'status': 'running'}, sessionID='chat', messageID='assistant')),
            ]
            with patch('run_check_live.transcript', side_effect=[([], []), (messages, parts)]):
                with self.assertRaisesRegex(RuntimeError, 'LIVE_CHAIN_INTERACTION_REQUIRED'):
                    chain.turn(profile, 'unused', {}, None, 'Prompt', [], time.monotonic() + 10)
            event = json.loads((profile / 'model.stdout').read_text())
            self.assertEqual((event['type'], event['part']['tool']), ('interaction_required', 'question'))

    def test_live_close_requires_fresh_runtime_ack_even_with_native_receipt(self):
        runner_module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        runner = runner_module['Runner'].__new__(runner_module['Runner'])
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            attempt = profile / 'loginom/runtime/attempt'
            attempt.mkdir(parents=True)
            live = Mock(profile=profile, browser=(42, '100', attempt), previous_acks=set(), account='test-user',
                        package='/test-user/sample.lgp', saved={'document_id': 'document'})
            (attempt / 'package-cleanup.json').write_text(json.dumps(dict(
                status='SUCCEEDED', package_closed=True, logged_out=True, unsaved_changes_discarded=False,
                account=live.account, package_path=live.package, document_id='document'
            )))
            runner.current = {'turns': [{'cleanup': 'pending live shutdown'}]}
            with self.assertRaisesRegex(runner_module['PackageCloseUnconfirmed'], 'LIVE_CHAIN_RUNTIME_ACK_MISSING'):
                runner.close_live(live)
            self.assertEqual(runner.current['turns'][0]['cleanup'], 'FAIL')
            ack = attempt.parent / 'runtime-close-current.json'
            ack.write_text(json.dumps({'closed_ack': True}))
            runner.current['turns'][0]['cleanup'] = 'pending live shutdown'
            runner.close_live(live)
            self.assertEqual(runner.current['turns'][0]['cleanup'], 'main PASS')

    def test_turn_events_exclude_previous_turn_and_pending_tool(self):
        def part(kind, message, **fields):
            return dict(type=kind, sessionID='chat', messageID=message, **fields)

        with TemporaryDirectory() as directory:
            folder = Path(directory)
            write_events(folder, [dict(id='current')], [
                (2, 4, part('tool', 'previous', state=dict(status='completed', time=dict(end=4)))),
                (5, 5, part('step-start', 'current')),
                (7, 9, part('tool', 'current', state=dict(status='running'))),
                (6, 11, part('tool', 'current', state=dict(status='completed', time=dict(end=10)))),
                (12, 12, part('step-finish', 'current')),
                (13, 13, part('tool', 'current', tool='question', state=dict(status='running'))),
            ])
            events = [json.loads(line) for line in (folder / 'model.stdout').read_text().splitlines()]
            self.assertEqual([(event['type'], event['timestamp']) for event in events],
                             [('step_start', 5), ('tool_use', 10), ('step_finish', 12), ('interaction_required', 13)])
