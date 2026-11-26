"""Drive the shipped Loginom TUI in a private PTY and project its chat store into JSONL."""
import base64
from contextlib import closing
from datetime import datetime, timezone
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import sqlite3
import struct
import subprocess
import termios
import time


def transcript(profile):
    database = profile / 'data/loginom-ai-agent.db'
    if not database.exists():
        return [], []
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=0.2)) as db:
        db.execute('BEGIN')
        root = ' join session s on s.id = t.session_id where s.parent_id is null'
        messages = [dict(json.loads(data), id=id, sessionID=session) for id, session, data in
                    db.execute('select t.id,t.session_id,t.data from message t' + root + ' order by t.time_created,t.id')]
        parts = [(created, updated, dict(json.loads(data), id=id, sessionID=session, messageID=message))
                 for id, session, message, created, updated, data in db.execute(
                     'select t.id,t.session_id,t.message_id,t.time_created,t.time_updated,t.data from part t'
                     + root + ' order by t.time_created,t.id')]
    return messages, parts


def posted_users(messages, parts):
    # Browser recovery and compaction can also insert synthetic user rows.
    posted = {part['messageID'] for _, _, part in parts
              if part['type'] == 'text' and not part.get('synthetic')}
    return [m for m in messages if m['role'] == 'user' and m['id'] in posted]


def write_events(folder, assistants, parts):
    ids = {m['id'] for m in assistants}
    kinds = {'text': 'text', 'tool': 'tool_use', 'step-start': 'step_start', 'step-finish': 'step_finish'}
    events = []
    for created, updated, part in parts:
        kind = kinds.get(part['type'])
        if not kind or part['messageID'] not in ids:
            continue
        state = part.get('state', {})
        if kind == 'tool_use' and state.get('status') not in ('completed', 'error'):
            continue
        timestamp = state.get('time', part.get('time', {})).get('end')
        events.append(dict(type=kind, timestamp=timestamp or (created if kind == 'step_start' else updated),
                           sessionID=part['sessionID'], part=part))
    for message in assistants:
        if message.get('error'):
            events.append(dict(type='error', timestamp=message['time'].get('completed') or message['time']['created'],
                               sessionID=message['sessionID'], error=message['error']))
    with (folder / 'model.stdout').open('w') as log:
        for event in sorted(events, key=lambda event: event['timestamp']):
            print(json.dumps(event, ensure_ascii=False), file=log)


def browser_owner(pid, profile):
    """Read the process tree of this exact CLI, including Chromium's profile argument."""
    todo = [pid]
    owners = []
    while todo:
        child = todo.pop()
        proc = Path('/proc') / str(child)
        try:
            args = (proc / 'cmdline').read_bytes().split(b'\0')
            todo.extend(map(int, (proc / 'task' / str(child) / 'children').read_text().split()))
            started = (proc / 'stat').read_text().rsplit(')', 1)[1].split()[19]
        except OSError:
            continue
        for arg in args:
            if arg.startswith(b'--user-data-dir=') and b'--remote-debugging-pipe' in args:
                browser_profile = Path(os.fsdecode(arg.split(b'=', 1)[1]))
                if browser_profile.name == 'browser-profile' and browser_profile.is_relative_to(profile / 'loginom/runtime'):
                    owners.append((child, started, browser_profile.parent))
    assert len(owners) <= 1, 'LIVE_CHAIN_BROWSER_AMBIGUOUS'
    return owners[0] if owners else None


def json_lines(path):
    if path.is_file():
        for line in path.read_text().splitlines():
            try:
                yield json.loads(line)
            except ValueError:
                continue  # The writer may be appending its last record.


class LiveChain:
    def __init__(self, profile, workspace, folder, account, package, model, variant, daemon_pid):
        self.profile, self.workspace = profile, workspace
        self.account, self.package = account, package
        self.model, self.variant = model, variant
        self.daemon_pid = daemon_pid
        self.child = None
        self.terminal = None
        self.master = None
        self.owner_file = profile / '.writer/owner'
        self.owner = None
        self.browser = None
        self.screen = b''
        self.saved = None
        self.previous_acks = set()
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
        self.previous_acks = set((self.profile / 'loginom/runtime').glob('runtime-close-*.json'))
        self.master, slave = pty.openpty()
        try:
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 160, 0, 0))
            self.terminal = self.terminal_path.open('ab', buffering=0)
            command = [executable, self.workspace, '--headless', '--model', self.model, '--dangerously-skip-permissions']
            environment = dict(env, TERM='xterm-256color')
            environment['LOGINOM_AI_AGENT_ROUTE'] = json.dumps(dict(type='session', sessionID=session) if session else dict(type='home'))
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
        if self.browser:
            assert browser_owner(self.child.pid, self.profile) == self.browser, 'LIVE_CHAIN_BROWSER_OWNER_CHANGED'

    def paste(self, text):
        assert all(char in '\n\t' or ord(char) >= 32 and ord(char) != 127 for char in text), 'LIVE_CHAIN_CONTROL_IN_PROMPT'
        self.send(b'\x1b[200~' + text.encode() + b'\x1b[201~')

    def turn(self, folder, executable, env, expected_session, prompt, files, deadline):
        (folder / 'model.stderr').write_text(f'Terminal transcript: {self.terminal_path}\n')
        if not self.child:
            self.start(executable, expected_session, env, deadline)
        self.verify_owner()
        before, past_parts = transcript(self.profile)
        users_before = posted_users(before, past_parts)
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
        try:
            def completed():
                nonlocal assistants, parts
                self.verify_owner()
                try:
                    messages, parts = transcript(self.profile)
                except sqlite3.OperationalError:
                    return
                users = posted_users(messages, parts)
                assert len(users) <= len(users_before) + 1, 'LIVE_CHAIN_UNEXPECTED_PROMPT'
                if len(users) != len(users_before) + 1:
                    return
                user = users[-1]
                session = user['sessionID']
                assert {m['sessionID'] for m in messages} == {session} and expected_session in (None, session), 'LIVE_CHAIN_CHAT_CHANGED'
                current = messages[messages.index(user):]
                parents = [m['id'] for m in current if m['role'] == 'user']
                assistants = [m for m in current if m['role'] == 'assistant' and m.get('parentID') in parents]
                if not assistants:
                    return  # The CLI writes the user row before its parts.
                selected = user.get('model', {})
                assert (f"{selected.get('providerID')}/{selected.get('modelID')}" == self.model
                        and (selected.get('variant') or '') == self.variant), 'LIVE_CHAIN_MODEL_CHANGED'
                user_parts = [part for _, _, part in parts if part['messageID'] == user['id']]
                text = '\n'.join(part['text'] for part in user_parts if part['type'] == 'text' and not part.get('synthetic'))
                assert text.strip().endswith(prompt.strip()), 'LIVE_CHAIN_PROMPT_MISMATCH'
                attachments = [part for part in user_parts if part['type'] == 'file']
                assert len(attachments) == len(files), 'LIVE_CHAIN_ATTACHMENT_MISSING'
                for part, file in zip(attachments, files):
                    url = part['url']
                    assert Path(part.get('filename', '')).name == file.name and (
                        url == file.as_uri() or url.startswith('data:') and base64.b64decode(url.split(',', 1)[1]) == file.read_bytes()
                    ), 'LIVE_CHAIN_ATTACHMENT_MISMATCH'
                if any(m.get('error') for m in assistants):
                    raise RuntimeError('LIVE_CHAIN_MODEL_ERROR')
                for message in reversed(assistants):
                    if message.get('parentID') != parents[-1]:
                        continue
                    finished = message.get('time', {}).get('completed')
                    if finished and time.time() - finished / 1000 > 0.35 and message.get('finish') not in (None, 'tool-calls', 'unknown'):
                        return session
                    break

            session = self.wait_for(completed, deadline, 'MODEL')
            current_browser = browser_owner(self.child.pid, self.profile)
            assert current_browser and self.browser in (None, current_browser), 'LIVE_CHAIN_BROWSER_OWNER_CHANGED'
            self.browser = current_browser
            receipts = list(json_lines(self.browser[2] / 'execution-events.jsonl'))
            since = datetime.fromtimestamp(submitted, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
            saved = [event['state'] for event in receipts if event.get('phase') == 'saved_package_state_observed'
                     and event.get('recorded_at', '') >= since]
            assert saved and all(state.get('account') == self.account and state.get('package_path') == self.package
                                 for state in saved), 'LIVE_CHAIN_ACCOUNT_UNVERIFIED'
            self.saved = saved[-1]
            model_finished = max(m.get('time', {}).get('completed') or 0 for m in assistants)
            self.log('completed', case=folder.name, sessionID=session, browser_pid=self.browser[0],
                     model_finished=model_finished / 1000, owner_verified=True)
            return session
        finally:
            write_events(folder, assistants, parts)

    def close(self):
        child = self.child
        try:
            if child is None:
                return
            self.log('close_requested')
            for data, timeout in ((b'\x1b', 0.25), (b'\x1b', 0.25), (b'\x04', 100)):
                if child.poll() is not None:
                    break
                try:
                    self.send(data)
                except OSError:
                    break
                end = time.monotonic() + timeout
                while child.poll() is None and time.monotonic() < end:
                    self.pump()
            if child.poll() is None:
                assert child.pid != self.daemon_pid(), 'Cannot terminate daemon'
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    child.wait()
            assert child.returncode == 0 and not self.owner_file.parent.exists(), 'LIVE_CHAIN_CLI_CLOSE_UNCONFIRMED'
            self.log('closed')
        finally:
            self.child = None
            self.owner = self.browser = None
            if self.terminal:
                self.terminal.close()
                self.terminal = None
            if self.master is not None:
                os.close(self.master)
                self.master = None
