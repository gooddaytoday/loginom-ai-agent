"""Private run-check transport: two prompts, one real interactive CLI and runtime.

Only reads the CLI transcript database; all Loginom actions remain product actions.
"""
import fcntl
from contextlib import closing
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


def run(config):
    folder, profile = Path(config['folder']), Path(config['profile'])
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 140, 0, 0))
    child = subprocess.Popen([config['executable'], config['workspace'], '--headless', '--model', 'openai/gpt-6.1-sol',
                              '--dangerously-skip-permissions', '--prompt', config['prompts'][0]],
                             stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                             env=dict(os.environ, TERM='xterm-256color'))
    os.close(slave)
    turn, session, finishing = 1, None, None
    deadline = time.monotonic() + 1800
    error = None
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    def boundary(kind, parts=()):
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
        with (folder / 'turns.jsonl').open('a') as out:
            out.write(json.dumps(dict(event=kind, turn=turn, sessionID=session, cli_pid=child.pid,
                                      execution_ids=sorted(execution_ids), at=time.time()), ensure_ascii=False) + '\n')
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
                boundary('completed', parts)
                if turn == 1:
                    turn = 2; boundary('submitted', parts)
                    # Bracketed paste keeps newlines inside this one user message.
                    os.write(master, b'\x1b[200~' + config['prompts'][1].encode() + b'\x1b[201~')
                    time.sleep(.2)
                    os.write(master, b'\r')
                else:
                    os.write(master, b'/exit\r')
                    finishing = time.monotonic()
    except BaseException as exc:
        error = exc
    finally:
        if child.poll() is None:
            # Only our exact child, never a process name or a workspace daemon.
            daemon = json.loads(subprocess.check_output(['multica', 'daemon', 'status', '--output', 'json']))
            assert child.pid != daemon['pid'], 'Cannot terminate daemon'
            child.send_signal(signal.SIGINT)
            try: child.wait(timeout=100)
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
