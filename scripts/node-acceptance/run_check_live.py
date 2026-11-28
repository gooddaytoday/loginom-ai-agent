"""Drive the shipped Loginom TUI in a private PTY and project its chat store into JSONL."""
import base64
from contextlib import closing
from datetime import datetime, timezone
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import socket
import sqlite3
import struct
import subprocess
import termios
import time


def transcript(profile):
    database = profile / 'data/loginom-ai-agent.db'
    if not database.exists():
        return [], [], {}
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=0.2)) as db:
        db.execute('BEGIN')
        messages = [dict(json.loads(data), id=id, sessionID=session, type=kind) for id, session, kind, data in
                    db.execute("""
                        SELECT m.id, m.session_id, m.type, m.data
                        FROM session_message m JOIN session_v2 s ON s.id = m.session_id
                        WHERE s.parent_id IS NULL
                        ORDER BY m.session_id, m.seq
                    """)]
        streaming = {}
        for message, ordinal, created, updated, data in db.execute("""
            SELECT p.message_id, p.ordinal, p.time_created, p.time_updated, p.data
            FROM session_part p JOIN session_v2 s ON s.id = p.session_id
            WHERE s.parent_id IS NULL
            ORDER BY p.message_id, p.ordinal
        """):
            streaming.setdefault(message, []).append((ordinal, created, updated, json.loads(data)))
        parts = []
        for message in messages:
            if message['type'] != 'assistant':
                continue
            clock = message['time']
            # v2 folds the streaming rows into session_message on step completion.
            rows = streaming.get(message['id'], [])
            if 'completed' in clock:
                rows = [(ordinal, clock['created'], clock['completed'], part)
                        for ordinal, part in enumerate(message['content'])]
            for ordinal, created, updated, content in rows:
                part = dict(content, sessionID=message['sessionID'], messageID=message['id'],
                            partID=f"{message['id']}:{ordinal}")
                part.setdefault('id', part['partID'])
                if part['type'] == 'tool':
                    part['tool'] = part.pop('name')
                    state = part['state'] = dict(part['state'])
                    if state['status'] == 'completed':
                        state['output'] = '\n'.join(item['text'] for item in state.pop('content') if item['type'] == 'text')
                    elif state['status'] == 'error':
                        error = state['error']
                        state.update(error=error['message'], type=error['type'])
                parts.append((created, updated, part))
        activity = {id: (busy, idle, outcome) for id, busy, idle, outcome in db.execute(
            'SELECT id, time_busy, time_idle, idle_outcome FROM session_v2 WHERE parent_id IS NULL')}
    return messages, parts, activity


def posted_users(messages):
    return [message for message in messages if message['type'] == 'user']


def read_turn(messages, previous_users, expected_session):
    users = posted_users(messages)
    assert len(users) <= len(previous_users) + 1, 'LIVE_CHAIN_UNEXPECTED_PROMPT'
    assert users[:len(previous_users)] == previous_users, 'LIVE_CHAIN_CHAT_CHANGED'
    if len(users) == len(previous_users):
        return None, []
    user = users[-1]
    session = user['sessionID']
    assert {m['sessionID'] for m in messages} == {session} and expected_session in (None, session), 'LIVE_CHAIN_CHAT_CHANGED'
    return user, [m for m in messages[messages.index(user) + 1:] if m['type'] == 'assistant']


def attachment_matches(part, file):
    if part.get('name') != file.name:
        return False
    data = part.get('data')
    if data is not None:
        return base64.b64decode(data, validate=True) == file.read_bytes()
    return part.get('uri') == 'media:' + hashlib.sha256(file.read_bytes()).hexdigest()


def awaiting_question(part):
    return part['type'] == 'tool' and part.get('tool') == 'question' and part['state'].get('status') == 'running'


def tool_failure(events):
    """Mirror the standalone CLI's runToolOutcome on this turn's persisted tool events."""
    connection_errors = {
        'LOGINOM_CONNECTION_NOT_READY', 'LOGINOM_LOGIN_REJECTED', 'LOGINOM_ACCOUNT_MISMATCH',
        'LOGINOM_LOGIN_UNAVAILABLE', 'LOGINOM_BROWSER_START_FAILED',
    }
    connections, unresolved = {}, {}
    workspace_failure = None
    permission_denied = recovery_required = False

    def key(value):
        return json.dumps(value, sort_keys=True)

    for event in events:
        if event['type'] != 'tool_use':
            continue
        part = event['part']
        tool, state = part['tool'], part['state']
        args, metadata = state.get('input', {}), state.get('metadata') or {}
        error = state.get('error')
        failed = state['status'] == 'error'
        permission_denied |= failed and (state.get('type') == 'permission.rejected'
                                         or metadata.get('permissionDenied') is True)
        recovery_required |= failed and tool.startswith('loginom_') and bool(
            re.match(r'^LOGINOM_(CALL_UNCERTAIN|RECOVERY_REQUIRED)\b', error or ''))
        if tool == 'loginom_dock_prepare':
            identity = key(args)
            if failed and error == 'LOGINOM_CONFIG_REQUIRED':
                connections[identity] = error
            elif failed and isinstance(error, str) and error in connection_errors:
                connections[identity] = 'LOGINOM_CONNECTION_NOT_READY'
            elif not failed and not metadata.get('isError') and not metadata.get('loginomPending'):
                connections.pop(identity, None)
                try:
                    reply = json.JSONDecoder().raw_decode(state.get('output', ''))[0]
                except (TypeError, ValueError):
                    reply = None
                workspace = reply.get('workspace') if isinstance(reply, dict) else None
                if isinstance(workspace, dict):
                    if workspace.get('status') == 'READY':
                        workspace_failure = None
                    elif workspace.get('status') == 'NOT_READY':
                        reason = workspace.get('reason')
                        workspace_failure = reason if isinstance(reason, str) and re.fullmatch(r'[A-Z][A-Z0-9_]*', reason) else 'LOGINOM_WORKSPACE_NOT_READY'
            continue
        if tool.startswith('loginom_') or tool == 'question':
            continue
        identity = (tool, part['id'] if tool == 'invalid' else key(args))
        if failed or tool == 'invalid' or metadata.get('isError') is True:
            unresolved.pop(identity, None)
            unresolved[identity] = part
            continue
        if unresolved.pop(identity, None) is not None:
            continue
        for previous in reversed(unresolved):
            if corrected_read(unresolved[previous], part):
                del unresolved[previous]
                break

    if permission_denied:
        return 'CLI_PERMISSION_REJECTED'
    if connections:
        return connections[next(reversed(connections))]
    if recovery_required:
        return 'LOGINOM_RECOVERY_REQUIRED'
    if workspace_failure:
        return workspace_failure
    if unresolved:
        return 'CLI_TOOL_FAILED'


def corrected_read(failure, success):
    before, after = failure['state'], success['state']
    if failure['tool'] != 'read' or before['status'] != 'error' or failure['sessionID'] != success['sessionID']:
        return False
    old, new = before['input'].get('path'), after['input'].get('path')
    if (success['tool'] != 'read' or not isinstance(old, str) or not isinstance(new, str)
            or before.get('type') == 'permission.rejected' or (before.get('metadata') or {}).get('permissionDenied')):
        return False
    return (before['error'].startswith(f'File not found: {old}')
            and os.path.dirname(old) == os.path.dirname(new) and os.path.splitext(old)[1] == os.path.splitext(new)[1]
            and {k: v for k, v in before['input'].items() if k != 'path'}
            == {k: v for k, v in after['input'].items() if k != 'path'})


def write_events(folder, assistants, parts, *, finished_session=None):
    ids = {m['id'] for m in assistants}
    kinds = {'text': 'text', 'tool': 'tool_use'}
    events = []
    for _, updated, part in parts:
        kind = kinds.get(part['type'])
        if not kind or part['messageID'] not in ids:
            continue
        if kind == 'tool_use' and part['state']['status'] not in ('completed', 'error'):
            if not awaiting_question(part):
                continue
            kind = 'interaction_required'
        timestamp = part.get('time', {}).get('completed') or updated
        events.append(dict(type=kind, timestamp=timestamp,
                           sessionID=part['sessionID'], part=part))
    for message in assistants:
        clock = message['time']
        session, id = message['sessionID'], message['id']
        events.append(dict(type='step_start', timestamp=clock['created'], sessionID=session,
                           part=dict(type='step-start', sessionID=session, messageID=id)))
        if 'completed' in clock:
            events.append(dict(type='step_finish', timestamp=clock['completed'], sessionID=session,
                               part=dict(type='step-finish', sessionID=session, messageID=id, reason=message.get('finish'))))
        if error := message.get('error'):
            kinds = {'provider.auth': 'ProviderAuthError', 'provider.no-route': 'ProviderModelNotFoundError'}
            name = kinds.get(error['type'], 'APIError' if error['type'].startswith('provider.') else error['type'])
            events.append(dict(type='error', timestamp=clock.get('completed', clock['created']),
                               sessionID=session, error=dict(name=name, data=dict(message=error['message']))))
    order = {'step_start': 0, 'step_finish': 2, 'error': 3}
    events.sort(key=lambda event: (event['timestamp'], order.get(event['type'], 1)))
    failure = tool_failure(events) if finished_session else None
    if failure:
        events.append(dict(type='error', timestamp=int(time.time() * 1000), sessionID=finished_session,
                           error=dict(name=failure, data=dict(message=failure)), source='standalone_tool_outcome'))
    with (folder / 'model.stdout').open('w') as log:
        for event in events:
            print(json.dumps(event, ensure_ascii=False), file=log)
    return failure


def process_stat(pid):
    return (Path('/proc') / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()


def runtime_attempts(profile):
    return {path for path in (profile / 'loginom/runtime').glob('generations/*/chats/*/attempts/*') if path.is_dir()}


def browser_owners(attempts, executable, cli_pid=None):
    """Bind Chromium's profile lock to the shipped binary and, while live, to the CLI."""
    owners = set()
    for attempt in attempts:
        try:
            host, _, pid_text = os.readlink(attempt / 'browser-profile/SingletonLock').rpartition('-')
            if host != socket.gethostname() or not pid_text.isdecimal():
                continue
            pid = int(pid_text)
            if (Path('/proc') / pid_text / 'exe').resolve(strict=True) != executable:
                continue
            state = process_stat(pid)
            parent = int(state[1])
            while cli_pid is not None and parent > 1 and parent != cli_pid:
                parent = int(process_stat(parent)[1])
            if (cli_pid is None or parent == cli_pid) and state[0] not in ('Z', 'X'):
                owners.add((pid, state[19], attempt))
        except (FileNotFoundError, ProcessLookupError):
            continue  # A transient browser attempt may have closed.
    return owners


def browser_owner(cli_pid, profile, executable):
    owners = browser_owners(runtime_attempts(profile), executable, cli_pid)
    assert len(owners) <= 1, 'LIVE_CHAIN_BROWSER_AMBIGUOUS'
    return next(iter(owners), None)


def process_alive(pid, started):
    try:
        state = process_stat(pid)
        return state[19] == started and state[0] not in ('Z', 'X')
    except (FileNotFoundError, ProcessLookupError):
        return False


def json_lines(path):
    if path.is_file():
        for line in path.read_text().splitlines():
            try:
                yield json.loads(line)
            except ValueError:
                continue  # The writer may be appending its last record.


class LiveChain:
    def __init__(self, profile, workspace, folder, account, package, model, variant, daemon_pid, browser_executable):
        self.profile, self.workspace = profile, workspace
        self.account, self.package = account, package
        self.model, self.variant = model, variant
        self.daemon_pid = daemon_pid
        self.browser_executable = browser_executable
        self.child = None
        self.terminal = None
        self.master = None
        self.owner_file = profile / '.writer/owner'
        self.owner = None
        self.browser = None
        self.screen = b''
        self.saved = self.turn_saved = None
        self.port_readbacks = []
        self.previous_acks = set()
        self.previous_attempts = set()
        self.browsers_seen = set()
        self.checked_daemon_pid = None
        self.turn_log = folder / 'live-turns.jsonl'
        self.terminal_path = folder / 'live-terminal.log'

    def pump(self, delay=0.15):
        ready, _, _ = select.select([self.master], [], [], delay)
        if not ready:
            return b''
        try:
            chunk = os.read(self.master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:  # PTY hangup on Linux
                return b''
            raise
        self.terminal.write(chunk)
        self.screen = (self.screen + chunk)[-65536:]
        if b'\x1b[6n' in chunk:
            self.send(b'\x1b[1;1R')
        if b'\x1b[c' in chunk:
            self.send(b'\x1b[?1;2c')
        return chunk

    def send(self, data):
        while data:
            data = data[os.write(self.master, data):]

    def wait_for(self, predicate, deadline, stage):
        while self.child.poll() is None:
            if time.monotonic() >= deadline:
                raise TimeoutError('LIVE_CHAIN_' + stage + '_DEADLINE')
            self.pump()
            result = predicate()
            if result:
                return result
        raise RuntimeError(f'LIVE_CHAIN_CLI_EXIT: {self.child.returncode} during {stage}')

    def log(self, event, **fields):
        with self.turn_log.open('a') as log:
            print(json.dumps(dict(event=event, at=time.time(), cli_pid=self.child.pid, **fields)), file=log)

    def start(self, executable, session, env, deadline):
        assert not self.owner_file.parent.exists(), 'LIVE_CHAIN_PROFILE_ALREADY_OWNED'
        # Check before allocating a child, so daemon RPC failure cannot strand it at shutdown.
        self.checked_daemon_pid = self.daemon_pid()
        assert type(self.checked_daemon_pid) is int and self.checked_daemon_pid > 0, 'LIVE_CHAIN_DAEMON_PID_UNVERIFIED'
        self.previous_acks = set((self.profile / 'loginom/runtime').glob('runtime-close-*.json'))
        self.previous_attempts = runtime_attempts(self.profile)
        self.browsers_seen.clear()
        self.browser = None
        self.master, slave = pty.openpty()
        try:
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 160, 0, 0))
            self.terminal = self.terminal_path.open('ab', buffering=0)
            command = [executable, self.workspace, '--standalone', '--dangerously-skip-permissions']
            environment = dict(env, TERM='xterm-256color', PWD=str(self.workspace), LOGINOM_AI_AGENT_HEADLESS='1',
                               LOGINOM_AI_AGENT_CLOSE_SAVED_PACKAGE='1')
            if session:
                command += ['--session', session]
            self.child = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                                          cwd=self.workspace, env=environment)
        except BaseException:
            self.close()
            raise
        finally:
            os.close(slave)
        self.screen = b''
        self.saved = None

        def ready():
            _, enabled, render = self.screen.partition(b'\x1b[?2004h')
            if enabled and b'\x1b[?25h' in render and self.owner_file.is_file():
                return self.owner_file.read_bytes()

        self.owner = self.wait_for(ready, deadline, 'TERMINAL_READY')
        self.log('started', sessionID=session)

    def verify_owner(self):
        try:
            nonce = self.owner_file.read_bytes()
        except FileNotFoundError:
            nonce = None
        assert self.child.poll() is None and self.owner and nonce == self.owner, 'LIVE_CHAIN_PROFILE_OWNER_CHANGED'
        current = browser_owner(self.child.pid, self.profile, self.browser_executable)
        if current:
            self.browsers_seen.add(current)
        if self.browser:
            assert current == self.browser, 'LIVE_CHAIN_BROWSER_OWNER_CHANGED'

    def segment_attempts(self):
        return runtime_attempts(self.profile) - self.previous_attempts

    def remaining_browsers(self):
        # A browser could spawn between the last sample and a CLI crash. A lock
        # in this segment's private profile still identifies it after reparenting.
        self.browsers_seen.update(browser_owners(self.segment_attempts(), self.browser_executable))
        return {pid for pid, started, _ in self.browsers_seen if process_alive(pid, started)}

    def paste(self, text):
        assert all(char in '\n\t' or ord(char) >= 32 and ord(char) != 127 for char in text), 'LIVE_CHAIN_CONTROL_IN_PROMPT'
        self.send(b'\x1b[200~' + text.encode() + b'\x1b[201~')

    def turn(self, folder, executable, env, expected_session, prompt, files, deadline):
        self.turn_saved = None
        (folder / 'model.stderr').write_text(f'Terminal transcript: {self.terminal_path}\n')
        if not self.child:
            self.start(executable, expected_session, env, deadline)
        self.verify_owner()
        before, _, activity_before = transcript(self.profile)
        users_before = posted_users(before)
        assert {m['sessionID'] for m in before} == ({expected_session} if expected_session else set()), 'LIVE_CHAIN_CHAT_CHANGED'
        # Supply a regular TUI attachment using its actual file autocomplete.
        # Wait for the matching file menu before selecting it or sending Enter.
        for file in files:
            relative = file.relative_to(self.workspace).as_posix()
            assert re.fullmatch(r'[\w./-]+', relative), 'LIVE_CHAIN_UNSUPPORTED_ATTACHMENT_NAME'
            self.screen = b''
            self.send(b'@')
            self.pump(0.10)
            self.send(relative.encode())
            name = file.name.encode()
            self.wait_for(lambda: self.screen.count(name) >= 2,
                          min(deadline, time.monotonic() + 8), 'ATTACHMENT_MENU')
            self.send(b'\t')
            self.pump(0.25)
        self.paste(prompt)
        self.pump(0.20)
        self.verify_owner()
        assert f'Model {self.model} is not valid'.encode() not in self.screen, 'LIVE_CHAIN_MODEL_UNAVAILABLE'
        submitted = time.time()
        self.send(b'\r')
        self.log('submitted', case=folder.name, sessionID=expected_session, browser_pid=self.browser[0] if self.browser else None)
        assistants, parts = [], []
        finished_session = None
        model_failed = False
        try:
            def completed():
                nonlocal assistants, parts, model_failed
                self.verify_owner()
                try:
                    messages, parts, activity = transcript(self.profile)
                except sqlite3.OperationalError as error:
                    if error.sqlite_errorcode & 0xff not in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
                        raise
                    return
                user, assistants = read_turn(messages, users_before, expected_session)
                if user is None:
                    return
                session = user['sessionID']
                assert user['text'].strip().endswith(prompt.strip()), 'LIVE_CHAIN_PROMPT_MISMATCH'
                attachments = user.get('files', [])
                assert len(attachments) == len(files), 'LIVE_CHAIN_ATTACHMENT_MISSING'
                assert all(attachment_matches(part, file) for part, file in zip(attachments, files)), 'LIVE_CHAIN_ATTACHMENT_MISMATCH'
                for message in assistants:
                    selected = message['model']
                    assert (f"{selected['providerID']}/{selected['id']}" == self.model
                            and (selected.get('variant') or 'default') == (self.variant or 'default')), 'LIVE_CHAIN_MODEL_CHANGED'
                assistant_ids = {message['id'] for message in assistants}
                if any(part['messageID'] in assistant_ids and awaiting_question(part) for _, _, part in parts):
                    raise RuntimeError('LIVE_CHAIN_INTERACTION_REQUIRED: ' + str(folder / 'model.stdout'))
                busy, idle, outcome = activity[session]
                previous_idle = activity_before.get(session, (None, None, None))[1]
                if idle and idle > (previous_idle or 0) and idle >= (busy or 0) and idle >= user['time']['created']:
                    model_failed = outcome != 'succeeded' or any(m.get('error') for m in assistants)
                    if not model_failed:
                        assert assistants and assistants[-1]['time'].get('completed'), 'LIVE_CHAIN_ASSISTANT_MISSING'
                    return session

            finished_session = self.wait_for(completed, deadline, 'MODEL')
        finally:
            failure = write_events(folder, assistants, parts, finished_session=finished_session)
        if model_failed and not failure:
            raise RuntimeError('LIVE_CHAIN_MODEL_ERROR: ' + str(folder / 'model.stdout'))
        current_browser = browser_owner(self.child.pid, self.profile, self.browser_executable)
        if current_browser:
            assert self.browser in (None, current_browser), 'LIVE_CHAIN_BROWSER_OWNER_CHANGED'
            self.browser = current_browser
            self.browsers_seen.add(current_browser)
        saved = []
        if current_browser:
            receipts = json_lines(current_browser[2] / 'execution-events.jsonl')
            since = datetime.fromtimestamp(submitted, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
            saved = [event['state'] for event in receipts if event.get('phase') == 'saved_package_state_observed'
                     and event.get('recorded_at', '') >= since]
            if saved and all(state.get('account') == self.account and state.get('package_path') == self.package
                             for state in saved):
                self.saved = self.turn_saved = saved[-1]
        # Terminal tool evidence takes precedence when the tool refused the operation before Save.
        if failure:
            self.log('turn_failed', case=folder.name, sessionID=finished_session, code=failure)
            return finished_session
        if not current_browser:
            raise AssertionError('LIVE_CHAIN_BROWSER_OWNER_CHANGED' if self.browser else 'LIVE_CHAIN_BROWSER_OWNER_UNVERIFIED')
        assert saved, 'LIVE_CHAIN_SAVE_MISSING'
        assert all(state.get('account') == self.account for state in saved), 'LIVE_CHAIN_ACCOUNT_UNVERIFIED'
        assert self.turn_saved, 'LIVE_CHAIN_PACKAGE_UNVERIFIED'
        model_finished = max(m.get('time', {}).get('completed') or 0 for m in assistants)
        self.log('completed', case=folder.name, sessionID=finished_session, browser_pid=self.browser[0],
                 model_finished=model_finished / 1000, owner_verified=True)
        return finished_session

    def sample_shutdown_browsers(self):
        try:
            self.browsers_seen.update(browser_owners(self.segment_attempts(), self.browser_executable, self.child.pid))
        except InterruptedError:
            raise
        except OSError:
            pass  # A diagnostic read must not stop the CLI shutdown.

    def close(self):
        child = self.child
        try:
            if child is None:
                return
            try:
                self.log('close_requested')
            except InterruptedError:
                raise
            except OSError:
                pass
            self.sample_shutdown_browsers()
            for data, timeout in ((b'\x1b', 0.25), (b'\x1b', 0.25), (b'\x04', 100)):
                if child.poll() is not None:
                    break
                self.sample_shutdown_browsers()
                try:
                    self.send(data)
                except InterruptedError:
                    raise
                except OSError:
                    break
                end = time.monotonic() + timeout
                while child.poll() is None and time.monotonic() < end:
                    try:
                        self.pump()
                    except InterruptedError:
                        raise
                    except OSError:
                        break
                    self.sample_shutdown_browsers()
            if child.poll() is None:
                daemon = self.checked_daemon_pid
                assert daemon is not None and child.pid != daemon, 'LIVE_CHAIN_SIGNAL_OWNER_UNVERIFIED'
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    # Popen targets only its exact direct child. Chromium and
                    # the runtime have independent shutdown checks below.
                    child.kill()
                    child.wait(timeout=10)
            assert child.returncode == 0 and not self.owner_file.parent.exists(), 'LIVE_CHAIN_CLI_CLOSE_UNCONFIRMED'
            self.log('closed')
        finally:
            # On interruption the outer cleanup must be able to retry with the
            # same PTY and exact child. Clear resources only after poll reaps it.
            if child is None or child.poll() is not None:
                self.child = None
                self.owner = None
                terminal, self.terminal = self.terminal, None
                master, self.master = self.master, None
                try:
                    if terminal:
                        terminal.close()
                finally:
                    if master is not None:
                        os.close(master)
