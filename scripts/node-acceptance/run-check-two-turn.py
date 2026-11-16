"""Private run-check transport: two prompts, one real interactive CLI and runtime.

Only reads the CLI transcript database; all Loginom actions remain product actions.
"""
import fcntl
from contextlib import closing
from datetime import datetime
import json
import os
from pathlib import Path
import pty
import select
import signal
import sqlite3
import struct
import subprocess
import sys
import termios
import time


def transcript(profile):
    database = profile / 'data/loginom-ai-agent.db'
    if not database.exists(): return [], []
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as db:
        messages = [dict(json.loads(data), id=id, sessionID=session) for id, session, data in
                    db.execute('select id,session_id,data from message order by time_created,id')]
        parts = [dict(json.loads(data), id=id, sessionID=session, messageID=message) for id, session, message, data in
                 db.execute('select id,session_id,message_id,data from part order by time_created,id')]
    return messages, parts


def completed_turn(messages, count):
    users = [m for m in messages if m.get('role') == 'user']
    if len(users) != count: return False
    return any(m.get('role') == 'assistant' and m.get('parentID') == users[-1]['id']
               and m.get('time', {}).get('completed') and m.get('finish') not in [None, 'tool-calls', 'unknown']
               for m in messages)


def pending_execution(profile):
    """Gate turn two on an owned native process, not an asynchronous job ID."""
    for journal in profile.rglob('execution-events.jsonl'):
        events = []
        for line in journal.read_text().splitlines():
            try: events.append(json.loads(line))
            except ValueError: pass  # The append writer may still be finishing a line.
        operations = {e['operation_id'] for e in events if e.get('phase') == 'node_apply_prepared'
                      and e.get('request', {}).get('target', {}).get('type') == 'programming.javascript'}
        for event in reversed(events):
            if event.get('operation_id') not in operations: continue
            snapshot = event.get('outcome', {}).get('output', {}).get('node_processes', {})
            context = snapshot.get('node_context', {})
            if snapshot.get('verified') is not True or context.get('verified') is not True: continue
            owned = [p for p in snapshot.get('processes', []) if p.get('owner', {}).get('verified') is True
                     and p['owner'].get('source') == 'native_process_model_identity' and p['owner'].get('node_id') == context.get('node_id')]
            if not owned: continue
            latest = max(int(p['process_id'].split('.')[0]) for p in owned)
            for process in owned:
                if int(process['process_id'].split('.')[0]) != latest: continue
                owner, progress = process.get('owner', {}), process.get('progress_state', {})
                if owner.get('verified') is not True or owner.get('source') != 'native_process_model_identity' or owner.get('node_id') != context.get('node_id'): continue
                if progress.get('verified') is not True or progress.get('source') != 'native_progress_record' or progress.get('state') not in ['not_started','running','not_responding']: continue
                if time.time()-datetime.fromisoformat(event['recorded_at'].replace('Z','+00:00')).timestamp()>5: return None
                group = process['process_id'].split('.')[0]
                return dict(execution_id=context['document_id']+':'+snapshot['root_id']+':'+group,
                            node_id=context['node_id'], journal=str(journal))
            return None  # Never reuse an older pending frame after completion.
    return None


def run(config):
    folder, profile = Path(config['folder']), Path(config['profile'])
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 140, 0, 0))
    child = subprocess.Popen([config['executable'], config['workspace'], '--headless', '--model', 'openai/gpt-6.1-sol',
                              '--dangerously-skip-permissions', '--prompt', config['prompts'][0]],
                             stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                             env=dict(os.environ, TERM='xterm-256color'))
    os.close(slave)
    turn, session, finishing, exit_sent, first_completed = 1, None, None, False, False
    deadline = time.monotonic() + 1800
    error = None
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    def boundary(kind, parts=(), native_execution=None):
        execution_ids = set()
        def visit(value):
            if isinstance(value, dict):
                if isinstance(value.get('execution_id'), str): execution_ids.add(value['execution_id'])
                for child in value.values(): visit(child)
            elif isinstance(value, list):
                for child in value: visit(child)
        for part in parts:
            try: visit(json.JSONDecoder().raw_decode(part.get('state', {}).get('output', ''))[0])
            except (ValueError, TypeError): pass
        if native_execution: execution_ids.add(native_execution['execution_id'])
        with (folder / 'turns.jsonl').open('a') as out:
            out.write(json.dumps(dict(event=kind, turn=turn, sessionID=session, cli_pid=child.pid,
                                      execution_ids=sorted(execution_ids), native_execution=native_execution, at=time.time()), ensure_ascii=False) + '\n')
    boundary('submitted')
    try:
        with (folder / 'terminal.log').open('wb') as terminal:
            while child.poll() is None:
                ready, _, _ = select.select([master], [], [], .2)
                if ready:
                    try: chunk = os.read(master, 65536)
                    except OSError: break
                    terminal.write(chunk); terminal.flush()
                    if b'\x1b[6n' in chunk: os.write(master, b'\x1b[1;1R')
                    if b'\x1b[c' in chunk: os.write(master, b'\x1b[?1;2c')
                if finishing is not None:
                    if not exit_sent and time.monotonic() - finishing > 1:
                        os.write(master, b'\x04'); exit_sent = True
                    if time.monotonic() - finishing > 60: raise TimeoutError('TWO_TURN_EXIT_TIMEOUT')
                    continue
                if time.monotonic() > deadline: raise TimeoutError('TWO_TURN_MODEL_TIMEOUT')
                try: messages, parts = transcript(profile)
                except sqlite3.OperationalError: continue
                sessions = {m['sessionID'] for m in messages}
                assert len(sessions) <= 1, 'TWO_TURN_CHAT_CHANGED'
                if sessions:
                    actual = next(iter(sessions))
                    assert session is None or session == actual, 'TWO_TURN_CHAT_CHANGED'
                    session = actual
                if any(m.get('role') == 'assistant' and m.get('error') for m in messages):
                    raise RuntimeError('TWO_TURN_MODEL_ERROR')
                if config.get('require_medium'):
                    for message in messages:
                        if message.get('role') == 'user':
                            assert message.get('model') == dict(providerID='openai', modelID='gpt-6.1-sol', variant='medium'), 'TWO_TURN_MODEL_VARIANT_CHANGED'
                if not completed_turn(messages, turn): continue
                if turn == 1:
                    if not first_completed:
                        boundary('completed', parts); first_completed = True
                    native = pending_execution(profile) if config.get('kind') == 'read-wait-running' else None
                    if config.get('kind') == 'read-wait-running' and native is None: continue
                    turn = 2; boundary('submitted', parts, native)
                    # Bracketed paste keeps newlines inside this one user message.
                    os.write(master, b'\x1b[200~' + config['prompts'][1].encode() + b'\x1b[201~')
                    time.sleep(.2)
                    os.write(master, b'\r')
                else:
                    boundary('completed', parts)
                    os.write(master, b'\x1b')
                    finishing = time.monotonic()
    except BaseException as exc:
        error = exc
    finally:
        if child.poll() is None:
            # Only our exact child, never a process name or a workspace daemon.
            assert child.pid != config['daemon_pid'], 'Cannot terminate daemon'
            try: os.write(master, b'\x1b\x04')
            except OSError: pass
            try: child.wait(timeout=100)
            except subprocess.TimeoutExpired:
                child.send_signal(signal.SIGTERM)
                try: child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill(); child.wait()
        os.close(master)
        messages, parts = transcript(profile)
        for part in parts:
            if part['type'] not in ['tool', 'text']: continue
            print(json.dumps(dict(type='tool_use' if part['type'] == 'tool' else 'text',
                                  sessionID=part['sessionID'], part=part), ensure_ascii=False), flush=True)
    if error: raise error
    assert child.returncode == 0 and completed_turn(messages, 2), 'TWO_TURN_INCOMPLETE'


if __name__ == '__main__':
    run(json.loads(Path(sys.argv[1]).read_text()))
