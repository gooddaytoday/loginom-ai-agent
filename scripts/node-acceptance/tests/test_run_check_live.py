from concurrent.futures import ThreadPoolExecutor
import errno
import os
import runpy
import socket
import subprocess
import sys
from threading import Event
import time
from unittest.mock import Mock, patch
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

from run_check_live import LiveChain, attachment_matches, browser_owner, package_save_states, read_turn, tool_failure, transcript, write_events


class SessionV2TranscriptTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.profile = Path(directory.name)
        (self.profile / 'data').mkdir()
        database = sqlite3.connect(self.profile / 'data/loginom-ai-agent.db')
        self.addCleanup(database.close)
        database.executescript("""
            CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT,
                time_busy INTEGER, time_idle INTEGER, idle_outcome TEXT);
            CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
                seq INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
            CREATE TABLE session_part (message_id TEXT NOT NULL, session_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
                type TEXT NOT NULL, call_id TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
                data TEXT NOT NULL, PRIMARY KEY(message_id, ordinal));
            INSERT INTO session_v2 VALUES ('chat', NULL, 5, 9, 'succeeded');
            INSERT INTO session_v2 VALUES ('child', 'chat', 6, 7, 'succeeded');
        """)
        self.db = database

    def message(self, id, kind, seq, *, session='chat', **data):
        self.db.execute('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (id, session, kind, seq, 1, 1, json.dumps(data)))

    def part(self, message, ordinal, kind, *, session='chat', **data):
        self.db.execute('INSERT INTO session_part VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        (message, session, ordinal, kind, data.get('id'), 1, 7, json.dumps(dict(type=kind, **data))))

    def test_projects_only_current_turn_even_when_message_timestamps_tie(self):
        self.message('first', 'user', 1, text='First prompt', time={'created': 1})
        self.message('previous', 'assistant', 2, time={'created': 2, 'completed': 3},
                     content=[dict(type='tool', name='invalid', id='old-call',
                                   state={'status': 'error', 'error': {'type': 'tool.error', 'message': 'old failure'}})])
        self.db.commit()
        previous, _, _ = transcript(self.profile)
        self.message('synthetic', 'synthetic', 3, text='Browser recovery')
        self.message('second', 'user', 4, text='Second prompt', time={'created': 5})
        self.message('child-user', 'user', 1, session='child', text='Subagent prompt')
        self.message('child-assistant', 'assistant', 2, session='child')
        self.message('current', 'assistant', 5, time={'created': 6, 'completed': 8}, finish='stop',
                     model={'providerID': 'test', 'id': 'acceptance', 'variant': 'medium'}, content=[
                         dict(type='tool', name='loginom_dock_node_read', id='read-call',
                              state={'status': 'completed', 'content': [{'type': 'text', 'text': '{"status":"SUCCEEDED"}'}]},
                              time={'created': 6, 'completed': 7}),
                         dict(type='text', text='Finished'),
                     ])
        self.part('child-assistant', 0, 'text', session='child', text='Subagent output')
        self.db.commit()

        messages, parts, activity = transcript(self.profile)
        user, assistants = read_turn(messages, previous[:1], 'chat')
        self.assertEqual((user['text'], assistants[0]['model']['variant']), ('Second prompt', 'medium'))
        self.assertEqual(activity, {'chat': (5, 9, 'succeeded')})
        self.assertIsNone(write_events(self.profile, assistants, parts, finished_session='chat'))
        events = [json.loads(line) for line in (self.profile / 'model.stdout').read_text().splitlines()]
        self.assertEqual([event['type'] for event in events], ['step_start', 'tool_use', 'text', 'step_finish'])
        self.assertEqual(events[1]['part']['state']['output'], '{"status":"SUCCEEDED"}')
        self.assertEqual(events[2]['part']['text'], 'Finished')

    def test_running_question_is_read_from_streaming_parts(self):
        self.message('prompt', 'user', 1, text='Ask me')
        self.message('answer', 'assistant', 2, time={'created': 6}, content=[])
        self.part('answer', 1, 'tool', name='question', id='call', state={'status': 'running'})
        self.part('answer', 0, 'text', text='Before asking')
        self.db.commit()
        messages, parts, _ = transcript(self.profile)
        _, assistants = read_turn(messages, [], None)
        write_events(self.profile, assistants, parts)
        events = [json.loads(line) for line in (self.profile / 'model.stdout').read_text().splitlines()]
        self.assertEqual([event['type'] for event in events], ['step_start', 'text', 'interaction_required'])
        self.assertEqual(events[-1]['part']['tool'], 'question')

    def test_rejects_two_new_user_prompts(self):
        self.message('one', 'user', 1)
        self.message('two', 'user', 2)
        self.db.commit()
        messages, _, _ = transcript(self.profile)
        with self.assertRaisesRegex(AssertionError, 'LIVE_CHAIN_UNEXPECTED_PROMPT'):
            read_turn(messages, [], None)

    def test_checks_attachment_bytes_for_inline_data_and_blob_references(self):
        file = self.profile / 'orders.csv'
        file.write_bytes(b'abc')
        sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        self.assertTrue(attachment_matches(dict(name=file.name, data='YWJj'), file))
        self.assertTrue(attachment_matches(dict(name=file.name, uri='media:' + sha), file))
        self.assertFalse(attachment_matches(dict(name=file.name, data='ZGVm'), file))
        self.assertFalse(attachment_matches(dict(name='customers.csv', data='YWJj'), file))


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
                live = LiveChain(profile, profile, profile, 'test-user', '/test-user/sample.lgp',
                                 'p/m', '', lambda: 99, executable)
                self.assertEqual(live.remaining_browsers(), {children[0]})
            finally:
                released.set()
                task.result()
            self.assertEqual(live.remaining_browsers(), set())

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
                dict(id='user', sessionID='chat', type='user', text='Prompt'),
                dict(id='assistant', sessionID='chat', type='assistant', model=dict(providerID='p', id='m'), time=dict(created=1)),
            ]
            parts = [
                (1, 1, dict(type='text', text='Prompt', sessionID='chat', messageID='user')),
                (2, 2, dict(type='tool', tool='question', state={'status': 'running'}, sessionID='chat', messageID='assistant')),
            ]
            with patch('run_check_live.transcript', side_effect=[([], [], {}), (messages, parts, {})]):
                with self.assertRaisesRegex(RuntimeError, 'LIVE_CHAIN_INTERACTION_REQUIRED'):
                    chain.turn(profile, 'unused', {}, None, 'Prompt', [], time.monotonic() + 10)
            event = next(event for event in map(json.loads, (profile / 'model.stdout').read_text().splitlines())
                         if event['type'] == 'interaction_required')
            self.assertEqual((event['type'], event['part']['tool']), ('interaction_required', 'question'))

    def test_idle_provider_failure_preserves_workspace_refusal(self):
        for workspace_changed in (True, False):
            with self.subTest(workspace_changed=workspace_changed), TemporaryDirectory() as directory:
                profile = Path(directory)
                chain = LiveChain(profile, profile, profile, 'worker', '/worker/sample.lgp', 'p/m', '',
                                  lambda: 99, Path(sys.executable))
                chain.child = Mock(pid=42)
                chain.child.poll.return_value = None
                chain.verify_owner = Mock()
                chain.send = Mock()
                chain.pump = Mock()
                messages = [dict(id='user', sessionID='chat', type='user', text='Prompt', time=dict(created=1)),
                            dict(id='answer', sessionID='chat', type='assistant', model=dict(providerID='p', id='m'),
                                 time=dict(created=2, completed=3), error=dict(type='provider.http', message='ECONNRESET'))]
                refusal = dict(workspace=dict(status='NOT_READY', reason='WORKFLOW_CHANGED'))
                parts = [(1, 2, dict(type='tool', tool='loginom_dock_prepare', id='prepare', sessionID='chat',
                    messageID='answer', state=dict(status='completed', output=json.dumps(refusal))))] if workspace_changed else []
                with patch('run_check_live.transcript', side_effect=[([], [], {}), (messages, parts, {'chat': (1, 3, 'failed')})]), \
                        patch('run_check_live.browser_owner', return_value=None):
                    if workspace_changed:
                        self.assertEqual(chain.turn(profile, 'unused', {}, None, 'Prompt', [], time.monotonic() + 1), 'chat')
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'LIVE_CHAIN_MODEL_ERROR'):
                            chain.turn(profile, 'unused', {}, None, 'Prompt', [], time.monotonic() + 1)
                errors = [event['error']['name'] for event in map(json.loads, (profile / 'model.stdout').read_text().splitlines())
                          if event['type'] == 'error']
                self.assertEqual(errors, ['APIError', 'WORKFLOW_CHANGED'] if workspace_changed else ['APIError'])

    def test_live_close_requires_fresh_runtime_ack_even_with_native_receipt(self):
        runner_module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        runner = runner_module['Runner'].__new__(runner_module['Runner'])
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            attempt = profile / 'loginom/runtime/attempt'
            attempt.mkdir(parents=True)
            live = Mock(profile=profile, browser=(42, '100', attempt), previous_acks=set(), port_readbacks=[], account='test-user',
                        package='/test-user/sample.lgp', saved={'document_id': 'document'})
            (attempt / 'saved-package-cleanup.json').write_text(json.dumps(dict(
                status='SUCCEEDED', package_closed=True, logged_out=True, unsaved_changes_discarded=False,
                account=live.account, package_path=live.package, document_id='document'
            )))
            live.segment_attempts.return_value = {attempt}
            live.browsers_seen = {live.browser}
            live.remaining_browsers.return_value = set()
            live.turn_log = profile / 'live-turns.jsonl'
            runner.current = {'turns': [{'status': 'PASS', 'cleanup': 'pending live shutdown'}]}
            with self.assertRaisesRegex(runner_module['PackageCloseUnconfirmed'], 'LIVE_CHAIN_RUNTIME_ACK_MISSING'):
                runner.close_live(live)
            self.assertEqual(runner.current['turns'][0]['cleanup'], 'FAIL')
            self.assertEqual(runner.current['turns'][0]['status'], 'UNKNOWN')
            self.assertEqual(runner.current['live_cleanup_error'], 'LIVE_CHAIN_RUNTIME_ACK_MISSING')
            ack = attempt.parent / 'runtime-close-current.json'
            ack.write_text(json.dumps({'closed_ack': True, 'exit_code': 0, 'exit_signal': None}))
            runner.current['turns'][0]['cleanup'] = 'pending live shutdown'
            runner.close_live(live)
            self.assertEqual(runner.current['turns'][0]['cleanup'], 'main PASS')

    def test_interrupted_close_retains_handle_and_drains_on_retry(self):
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            live = LiveChain(profile, profile, profile, 'test-user', '/test-user/sample.lgp', 'p/m', '',
                             Mock(side_effect=OSError('daemon unavailable')), Path(sys.executable))
            child = live.child = Mock(pid=42, returncode=None)
            child.poll.side_effect = lambda: child.returncode
            terminal = live.terminal = Mock()
            live.master, slave = os.openpty()
            master = live.master
            try:
                with patch.object(live, 'send', side_effect=InterruptedError('cancelled')):
                    with self.assertRaises(InterruptedError):
                        live.close()
                self.assertIs(live.child, child)
                self.assertEqual(live.master, master)
                terminal.close.assert_not_called()
                os.fstat(master)

                # The daemon PID was verified at startup. Shutdown does not
                # depend on contacting the daemon again.
                live.checked_daemon_pid = 99
                child.terminate.side_effect = lambda: setattr(child, 'returncode', 0)
                with patch.object(live, 'send', side_effect=OSError('terminal gone')):
                    live.close()
                child.terminate.assert_called_once()
                live.daemon_pid.assert_not_called()
                self.assertIsNone(live.child)
                self.assertIsNone(live.master)
                terminal.close.assert_called_once()
            finally:
                os.close(slave)
                if live.master is not None:
                    os.close(live.master)

    def test_daemon_lookup_failure_prevents_spawn(self):
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            live = LiveChain(profile, profile, profile, 'test-user', '/test-user/sample.lgp', 'p/m', '',
                             Mock(side_effect=OSError('daemon unavailable')), Path(sys.executable))
            with patch('run_check_live.subprocess.Popen') as spawn:
                with self.assertRaises(OSError):
                    live.start('unused', None, {}, time.monotonic() + 10)
            spawn.assert_not_called()
            self.assertIsNone(live.child)
            self.assertIsNone(live.master)

    def test_failed_first_turn_checks_native_cleanup_and_chromium_without_a_completed_turn(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        runner = module['Runner'].__new__(module['Runner'])
        runner.current = {'turns': [{'status': 'FAIL', 'cleanup': 'pending live shutdown'}]}
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            attempt = profile / 'loginom/runtime/attempt'
            attempt.mkdir(parents=True)
            live = Mock(profile=profile, browser=None, saved=None, previous_acks=set(), port_readbacks=[],
                        account='test-user', package='/test-user/sample.lgp', turn_log=profile / 'live-turns.jsonl')
            live.segment_attempts.return_value = {attempt}
            live.remaining_browsers.return_value = {42}
            receipt = attempt / 'saved-package-cleanup.json'
            body = dict(status='SUCCEEDED', package_closed=True, logged_out=True, unsaved_changes_discarded=False,
                        account=live.account, package_path=live.package, document_id='document')
            receipt.write_text(json.dumps(body))
            (attempt.parent / 'runtime-close-current.json').write_text(json.dumps(dict(closed_ack=True, exit_code=0)))
            with patch.object(module['time'], 'monotonic', side_effect=[0, 6]):
                with self.assertRaisesRegex(module['PackageCloseUnconfirmed'], 'LIVE_CHAIN_CHROMIUM_EXIT_UNCONFIRMED'):
                    runner.close_live(live)
            proof = json.loads(live.turn_log.read_text().splitlines()[-1])
            self.assertEqual([proof[key] for key in ('chromium_exited', 'package_closed', 'logged_out')], [False, True, True])
            live.remaining_browsers.return_value = set()
            receipt.write_text(json.dumps(dict(body, logged_out=False)))
            with self.assertRaisesRegex(module['PackageCloseUnconfirmed'], 'LIVE_CHAIN_PACKAGE_CLEANUP_UNCONFIRMED'):
                runner.close_live(live)
            receipt.write_text(json.dumps(body))
            runner.close_live(live)
            self.assertEqual(runner.current['cleanup'], 'main PASS')

            def cancel_during_close():
                self.assertTrue(runner.closing_live)
                runner.cancel_requested = True

            live.close.side_effect = cancel_during_close
            with self.assertRaisesRegex(InterruptedError, 'LIVE_CHAIN_CANCELLED'):
                runner.close_live(live)
            self.assertEqual(runner.current['cleanup'], 'main PASS')
            self.assertTrue(json.loads(live.turn_log.read_text().splitlines()[-1])['logged_out'])

    def test_cli_failure_policy_matches_standalone_for_current_tool_events(self):
        def event(tool, *, status='completed', args=None, error=None, metadata=None, output=None, id='tool'):
            return dict(type='tool_use', part=dict(tool=tool, id=id, sessionID='chat',
                state=dict(status=status, input=args or {}, error=error, metadata=metadata or {}, output=json.dumps(output))))

        refused = event('loginom_dock_prepare', status='error', args={'intent': 'open_package'},
                        error='LOGINOM_ACCOUNT_MISMATCH')
        config = event('loginom_dock_prepare', status='error', error='LOGINOM_CONFIG_REQUIRED')
        retry = event('loginom_dock_prepare', args={'intent': 'open_package'})
        pending = event('loginom_dock_prepare', args={'intent': 'open_package'}, metadata={'loginomPending': True})
        changed = event('loginom_dock_prepare', output=dict(workspace=dict(status='NOT_READY', reason='WORKFLOW_CHANGED')))
        ready = event('loginom_dock_prepare', output=dict(workspace=dict(status='READY')))
        invalid = event('invalid')
        denied = event('loginom_node', status='error', metadata={'permissionDenied': True})
        model_error = event('loginom_node', status='error', error='REQUEST_REJECTED')
        old = {'path': '/test/missing.txt', 'limit': 4}
        new = {'path': '/test/found.txt', 'limit': 4}
        read_error = event('read', status='error', args=old, error='File not found: /test/missing.txt')
        for events, expected in [
            ([invalid, retry], 'CLI_TOOL_FAILED'),
            ([refused, invalid, pending], 'LOGINOM_CONNECTION_NOT_READY'),
            ([refused, event('loginom_dock_prepare')], 'LOGINOM_CONNECTION_NOT_READY'),
            ([config], 'LOGINOM_CONFIG_REQUIRED'),
            ([refused, retry], None),
            ([refused, denied, retry], 'CLI_PERMISSION_REJECTED'),
            ([model_error], None),
            ([changed], 'WORKFLOW_CHANGED'),
            ([ready, changed], 'WORKFLOW_CHANGED'),
            ([changed, ready], None),
            ([read_error, event('read', args=new)], None),
            ([read_error, event('read', args=dict(new, limit=3))], 'CLI_TOOL_FAILED'),
        ]:
            with self.subTest(expected=expected, events=events):
                self.assertEqual(tool_failure(events), expected)

    def test_manual_edit_exits_verified_segment_and_resumes_same_chat(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        Runner, write = module['Runner'], module['write']
        edit = dict(kind='rename', node=dict(label='Before'), label='After')
        persisted = dict(complete=True, links=[], nodes=[
            dict(ref=dict(node_id='node'), label='After', type='imports.text', position=dict(x=64, y=64))])
        for acknowledged, version_known, evidence_unmoved in (
                (True, True, False), (True, False, False), (False, True, False), (True, True, True)):
            with self.subTest(acknowledged=acknowledged, version_known=version_known,
                              evidence_unmoved=evidence_unmoved), TemporaryDirectory() as directory:
                root = Path(directory)
                pair, cases = root / 'pair', root / 'cases'
                pair.mkdir()
                write(pair / 'worker.json', dict(url='https://example.invalid', username='test-user',
                                                password='synthetic', package_directory='/test-user'))
                for name, config in [('first', dict(manual_edit=edit)), ('second', dict(base='first'))]:
                    case = cases / name
                    case.mkdir(parents=True)
                    (case / 'task.md').write_text(name)
                    write(case / 'case.json', config)
                resources = root / 'build/resources/loginom'
                resources.mkdir(parents=True)
                (resources / 'chromium').touch()
                write(resources / 'resource-manifest.json', {'browser': 'chromium'})

                runner = Runner.__new__(Runner)
                auth = root / 'oauth-source.json'
                auth.write_text('{}')
                runner.out, runner.env, runner.auth_source = root, {}, auth
                runner.options = dict(pair=str(pair), cases=str(cases), cold=False, live_chain=True)
                runner.report = dict(phase='setup', runs=[dict(scenario='second', status='PENDING')])
                runner.deadline = time.time() + 60
                calls, commands = [], []
                version = dict(mtime='2026-11-28T00:00:00.000Z', size=100, hash='a' * 64) if version_known else None
                rename = Path.rename

                def move(source, target):
                    if evidence_unmoved and Path(target).name == 'live-evidence':
                        raise OSError(errno.ENOSPC, 'No space left')
                    return rename(source, target)

                def phase(name, command, folder, **kwargs):
                    calls.append(name)
                    if name == 'setup':
                        for child in ('data', 'config', 'state'):
                            (folder / 'profile' / child).mkdir(parents=True)
                        write(folder / 'setup.stdout', dict(browser=dict(state='verified')))
                        return
                    if name == 'case-port-readback':
                        self.assertEqual(calls, ['setup', 'first', 'exit', 'case-port-readback'])
                        saved = json.loads(Path(command[command.index('--saved') + 1]).read_text())
                        self.assertEqual(saved['file_version'], version)
                        (folder / 'case-port-readback').mkdir()
                        write(folder / 'case-port-readback/result.json', dict(status='PASS', path=saved['path'], file_version=version,
                            cleanup=dict(package_closed=True, logged_out=True), correspondence=[dict(node=dict(node_id='node'))]))
                        return
                    if name == 'case-port-sample-oracle':
                        return
                    self.assertEqual(name, 'manual-edit')
                    proof = json.loads((folder.parent / 'live-turns.jsonl').read_text().splitlines()[-1])
                    self.assertEqual(proof['event'], 'cleanup_verified')
                    self.assertTrue(all(proof[name] for name in
                                        ('cli_exited', 'chromium_exited', 'package_closed', 'logged_out', 'runtime_ack')))
                    closed = dict(package_closed=True, logged_out=True, unsaved_changes_discarded=False)
                    write(folder / 'manual/result.json',
                          dict(status='PASS', persisted=persisted, cleanup=closed, reopen_cleanup=closed))

                def spawn(command, **kwargs):
                    commands.append(command)
                    child = Mock(pid=len(commands) + 100, returncode=None)
                    child.poll.side_effect = lambda: child.returncode
                    return child

                def model(case, stage, profile, workspace, package, login, build, session, *, live, baseline=None):
                    calls.append(case)
                    self.assertIsNone(live.child)
                    if case == 'second':
                        self.assertEqual(session, 'same-chat')
                        self.assertEqual(baseline['nodes']['node']['label'], 'After')
                    live.start('cli', session, {'LOGINOM_AI_AGENT_CLI_PROFILE': str(profile)}, time.monotonic() + 10)
                    attempt = profile / f'loginom/runtime/generations/1/chats/chat/attempts/{case}'
                    attempt.mkdir(parents=True)
                    live.browser = (200, 'start', attempt)
                    live.browsers_seen.add(live.browser)
                    live.saved = dict(document_id='document')
                    if case == 'first':
                        live.saved['file_version'] = version
                        write(stage / 'case-port-expected.json', dict(case_port_node_ids=['node']))
                        live.port_readbacks.append((stage, package, login, build, version))
                        runner.current['csv'] = 'pending native port readback'
                    runner.current['cleanup'] = 'pending live shutdown'
                    return 'same-chat', dict(graph={}, outputs=[]), None, None

                def send(live, key):
                    if key != b'\x04':
                        return
                    calls.append('exit')
                    (live.browser[2] / 'execution-events.jsonl').write_text('{}\n')
                    live.child.returncode = 0
                    write(live.browser[2] / 'saved-package-cleanup.json',
                          dict(status='SUCCEEDED', package_closed=True, logged_out=True, unsaved_changes_discarded=False,
                               account=live.account, package_path=live.package, document_id='document'))
                    if acknowledged:
                        ack = live.profile / 'loginom/runtime' / f'runtime-close-{live.child.pid}.json'
                        write(ack, dict(closed_ack=True, exit_code=0, exit_signal=None))

                with patch.dict(module['daemon_pid'].__globals__, daemon_pid=lambda: 99), \
                        patch.object(Path, 'rename', autospec=True, side_effect=move), \
                        patch.object(runner, 'build', return_value=root / 'build'), \
                        patch.object(runner, 'save', side_effect=lambda: write(root / 'results.json', runner.report)), \
                        patch.object(runner, 'phase', side_effect=phase), patch.object(runner, 'model', side_effect=model), \
                        patch.object(LiveChain, 'send', autospec=True, side_effect=send), patch.object(LiveChain, 'pump'), \
                        patch.object(LiveChain, 'wait_for', return_value=b'nonce'), patch('run_check_live.process_alive', return_value=False), \
                        patch('run_check_live.subprocess.Popen', side_effect=spawn):
                    runner.run()

                result = json.loads((root / 'results.json').read_text())['runs'][0]
                self.assertNotIn('--session', commands[0])
                self.assertTrue(auth.is_file())
                profile = root / 'second/profile'
                self.assertEqual(profile.exists(), evidence_unmoved)
                self.assertFalse((profile / 'data').exists())
                evidence = Path(result['live_evidence'])
                if evidence_unmoved:
                    self.assertEqual(result['profile'], str(profile))
                    self.assertEqual(evidence, profile / 'loginom/runtime')
                    self.assertEqual(result['status_before_evidence_failure'], 'PASS')
                    self.assertEqual(result['failure_class'], 'EVIDENCE_UNMOVED')
                self.assertTrue(list(evidence.rglob('execution-events.jsonl')))
                self.assertTrue(list(evidence.rglob('saved-package-cleanup.json')))
                self.assertFalse(list(evidence.rglob('auth.json')))
                if acknowledged:
                    port_checks = ['case-port-readback', 'case-port-sample-oracle'] if version_known else []
                    self.assertEqual(calls, ['setup', 'first', 'exit', *port_checks, 'manual-edit', 'second', 'exit'])
                    self.assertEqual(commands[1][-2:], ['--session', 'same-chat'])
                    self.assertEqual(result['status'], 'EVIDENCE_UNMOVED' if evidence_unmoved else 'PASS' if version_known else 'UNKNOWN')
                    if not version_known:
                        self.assertEqual(result['failure_class'], 'CASE_PORT_SAVE_VERSION_UNKNOWN')
                    self.assertEqual(result['turns'][0]['manual_edit']['status'], 'PASS')
                else:
                    self.assertEqual(calls, ['setup', 'first', 'exit'])
                    self.assertEqual(result['turns'][0]['status'], 'UNKNOWN')
                    self.assertEqual(result['turns'][0]['csv'], 'UNKNOWN')
                    self.assertEqual(result['live_cleanup_error'], 'LIVE_CHAIN_RUNTIME_ACK_MISSING')
                    self.assertEqual(result['turns'][0]['manual_edit']['failure_category'], 'product')
                    self.assertEqual(result['turns'][1]['status'], 'NOT_RUN')

    def test_deferred_readback_matches_only_the_last_saved_file_version(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        with TemporaryDirectory() as directory:
            folder = Path(directory)
            runner = module['Runner'].__new__(module['Runner'])
            runner.current = dict(turns=[dict(case=name, status='PASS') for name in ('first', 'unknown', 'last')])
            version = dict(mtime='2026-11-28T00:00:00.000Z', size=100, hash='a' * 64)
            older_version = dict(version, hash='b' * 64)
            arguments = ('/worker/sample.lgp', dict(username='worker'), folder / 'build')
            live = Mock(profile=folder, previous_acks=set(), browsers_seen=set(), saved=dict(file_version=version),
                        turn_log=folder / 'turns.jsonl', port_readbacks=[
                            (folder / 'first', *arguments, older_version),
                            (folder / 'unknown', *arguments, None),
                            (folder / 'last', *arguments, version),
                        ])
            live.segment_attempts.return_value = []
            live.remaining_browsers.return_value = set()
            with patch.object(runner, 'case_port_readback', return_value=None) as reader:
                runner.close_live(live)
            reader.assert_called_once_with(folder / 'last', *arguments, version=version)
            first, unknown, last = runner.current['turns']
            self.assertEqual((first['status'], first['failure_class']), ('UNKNOWN', 'CASE_PORT_SAVE_VERSION_CHANGED'))
            self.assertEqual((unknown['status'], unknown['failure_class']), ('UNKNOWN', 'CASE_PORT_SAVE_VERSION_UNKNOWN'))
            self.assertEqual((last['status'], last['csv']), ('PASS', '— (native outputs PASS)'))

    def test_save_version_requires_a_successful_receipt_for_this_operation_and_path(self):
        version = dict(mtime='2026-11-28T00:00:00.000Z', size=100, hash='a' * 64)
        path = '/worker/sample.lgp'
        evidence = [dict(kind='saved', path=path), dict(kind='savedFileRead', scope='package', file=version)]
        receipt = dict(v=1, kind='save', state='settled', status='SUCCEEDED', operationId='current', evidence=evidence)
        observed = dict(phase='saved_package_state_observed', operation_id='current',
                        recorded_at='2026-11-28T00:01:00Z', state=dict(package_path=path))
        since = '2026-11-28T00:00:30Z'

        def part(metadata, tool='loginom_dock_action_run'):
            return dict(tool=tool, state=dict(status='completed', metadata=dict(loginom=metadata)))

        for tool in ('loginom_dock_action_run', 'loginom_dock_operation_inspect'):
            self.assertEqual(list(package_save_states(iter([observed]), since, [part(receipt, tool)])),
                             [dict(package_path=path, file_version=version)])
        for parts in ([], [part(dict(receipt, operationId='previous'))], [part(dict(receipt, status='FAILED'))],
                      [part(dict(receipt, evidence=[dict(kind='saved', path='/other.lgp'), evidence[1]]))],
                      [part(dict(receipt, evidence=[evidence[0]]))]):
            with self.subTest(parts=parts):
                self.assertEqual(list(package_save_states([observed], since, parts)), [dict(package_path=path, file_version=None)])
        self.assertEqual(list(package_save_states([observed], '2026-11-28T00:02:00Z', [part(receipt)])), [])

    def test_evidence_survives_rename_enospc_and_keeps_only_receipts(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        for blocked in (False, True):
            with self.subTest(blocked=blocked), TemporaryDirectory() as directory:
                folder = Path(directory)
                profile = folder / 'profile'
                runtime = profile / 'loginom/runtime'
                attempt = runtime / 'attempt'
                attempt.mkdir(parents=True)
                destination = folder / 'live-evidence'
                destination.mkdir()
                for name in ('attempt/execution-events.jsonl', 'attempt/saved-package-cleanup.json', 'runtime-close-proof.json'):
                    (runtime / name).write_text('{}\n')
                (attempt / 'browser-cookie').write_text('synthetic credential')
                (profile / 'data').mkdir()
                (profile / 'data/auth.json').write_text('synthetic credential')
                (attempt / 'foreign-cleanup.json').symlink_to(profile / 'data/auth.json')
                inode = (attempt / 'execution-events.jsonl').stat().st_ino
                runner = module['Runner'].__new__(module['Runner'])
                runner.current = {}

                if blocked:
                    with patch.object(Path, 'rename', side_effect=OSError(errno.ENOSPC, 'No space left')):
                        runner.preserve_live_evidence(profile, folder)
                    self.assertIn('live_evidence_error', runner.current)
                    self.assertFalse((profile / 'data').exists())
                else:
                    runner.preserve_live_evidence(profile, folder)
                    self.assertFalse(runtime.exists())

                evidence = Path(runner.current['live_evidence'])
                self.assertEqual((evidence / 'attempt/execution-events.jsonl').stat().st_ino, inode)
                self.assertEqual({path.name for path in evidence.rglob('*') if not path.is_dir()},
                                 {'execution-events.jsonl', 'saved-package-cleanup.json', 'runtime-close-proof.json'})

    def test_port_readback_removes_password_config_on_phase_failure(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        for error in (TimeoutError('readback deadline'), InterruptedError('cancelled')):
            with self.subTest(error=error), TemporaryDirectory() as directory:
                folder = Path(directory)
                runner = module['Runner'].__new__(module['Runner'])
                login = dict(url='https://example.invalid', username='worker', password='synthetic')

                def phase(name, command, stage):
                    config = Path(command[command.index('--config') + 1])
                    self.assertEqual(config.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(json.loads(config.read_text())['workflow_profile']['password'], 'synthetic')
                    raise error

                with patch.object(runner, 'phase', side_effect=phase), self.assertRaises(type(error)):
                    runner.case_port_readback(folder, '/worker/sample.lgp', login, folder / 'build',
                        version=dict(mtime='2026-11-28T00:00:00.000Z', size=100, hash='a' * 64))
                self.assertEqual([entry.name for entry in folder.iterdir()], ['case-port-save-version.json'])

    def test_port_readback_cannot_promote_path_only_or_changed_file_to_pass(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        version = dict(mtime='2026-11-28T00:00:00.000Z', size=100, hash='a' * 64)
        path = '/worker/sample.lgp'
        for observed, reason in ((None, 'CASE_PORT_OPENED_FILE_VERSION_UNKNOWN'),
                                 (dict(version, hash='b' * 64), 'CASE_PORT_OPENED_FILE_VERSION_CHANGED')):
            with self.subTest(observed=observed), TemporaryDirectory() as directory:
                folder = Path(directory)
                runner = module['Runner'].__new__(module['Runner'])
                login = dict(url='https://example.invalid', username='worker', password='synthetic')

                def phase(name, command, stage):
                    self.assertEqual(name, 'case-port-readback')
                    saved = Path(command[command.index('--saved') + 1])
                    self.assertEqual(module['read'](saved), dict(path=path, file_version=version))
                    output = stage / 'case-port-readback'
                    output.mkdir()
                    module['write'](output / 'result.json', dict(status='PASS', path=path, file_version=observed,
                        cleanup=dict(package_closed=True, logged_out=True)))

                with patch.object(runner, 'phase', side_effect=phase) as run:
                    self.assertEqual(runner.case_port_readback(folder, path, login, folder / 'build', version=None),
                                     'CASE_PORT_SAVE_VERSION_UNKNOWN')
                    run.assert_not_called()
                    self.assertEqual(runner.case_port_readback(folder, path, login, folder / 'build', version=version), reason)
                    run.assert_called_once()

    def test_terminal_tool_failure_is_scoped_to_the_completed_turn(self):
        def tool(message):
            return dict(type='tool', id=message + '-tool', messageID=message, sessionID='chat',
                        tool='invalid', state=dict(status='completed'))

        with TemporaryDirectory() as directory:
            folder = Path(directory)
            current = [dict(id='current', sessionID='chat', time=dict(created=2, completed=3))]
            history = [(1, 1, tool('previous'))]
            self.assertIsNone(write_events(folder, current, history, finished_session='chat'))
            self.assertNotIn('tool_use', (folder / 'model.stdout').read_text())
            self.assertEqual(write_events(folder, current, history + [(2, 2, tool('current'))],
                                          finished_session='chat'), 'CLI_TOOL_FAILED')
            events = [json.loads(line) for line in (folder / 'model.stdout').read_text().splitlines()]
            self.assertEqual([event['type'] for event in events], ['step_start', 'tool_use', 'step_finish', 'error'])
            self.assertEqual(events[-1]['error']['name'], 'CLI_TOOL_FAILED')

    def test_runner_stops_graph_only_turn_on_reconstructed_cli_failure(self):
        from contextlib import nullcontext

        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run-check.py'))
        Runner = module['Runner']
        with TemporaryDirectory() as directory:
            folder = Path(directory)
            workspace = folder / 'workspace'
            workspace.mkdir()
            runner = Runner.__new__(Runner)
            case = folder / 'cases/bh-g101-t1'
            case.mkdir(parents=True)
            (case / 'task.md').write_text('Graph-only case')
            module['write'](case / 'expected.json', dict(graph=dict(nodes=[dict(id='orders', type='imports.text')]), outputs=[]))
            runner.options = {'cases': case.parent}
            runner.current = {'scenario': 'bh-g101-t4'}
            runner.out, runner.env = folder, {}
            runner.deadline = time.time() + 60
            live = Mock()

            def turn(*args):
                (folder / 'model.stdout').write_text(json.dumps(
                    dict(type='error', sessionID='chat', error=dict(name='CLI_TOOL_FAILED'),
                         source='standalone_tool_outcome')) + '\n')
                return 'chat'

            live.turn.side_effect = turn
            login = {'username': 'test-user', 'package_directory': '/test-user'}
            with patch.object(runner, 'timed_phase', return_value=nullcontext()):
                with self.assertRaisesRegex(RuntimeError, 'CLI_TOOL_FAILED: .*model.stdout:1'):
                    runner.model('bh-g101-t1', folder, folder / 'profile', workspace, '/test-user/sample.lgp',
                                 login, folder / 'build', live=live)

    def test_turn_events_exclude_previous_turn_and_pending_tool(self):
        def part(kind, message, **fields):
            return dict(type=kind, sessionID='chat', messageID=message, **fields)

        with TemporaryDirectory() as directory:
            folder = Path(directory)
            write_events(folder, [dict(id='current', sessionID='chat', time=dict(created=5, completed=12))], [
                (2, 4, part('tool', 'previous', state=dict(status='completed', time=dict(end=4)))),
                (5, 5, part('step-start', 'current')),
                (7, 9, part('tool', 'current', state=dict(status='running'))),
                (6, 11, part('tool', 'current', time=dict(completed=10), state=dict(status='completed'))),
                (12, 12, part('step-finish', 'current')),
                (13, 13, part('tool', 'current', tool='question', state=dict(status='running'))),
            ])
            events = [json.loads(line) for line in (folder / 'model.stdout').read_text().splitlines()]
            self.assertEqual([(event['type'], event['timestamp']) for event in events],
                             [('step_start', 5), ('tool_use', 10), ('step_finish', 12), ('interaction_required', 13)])
