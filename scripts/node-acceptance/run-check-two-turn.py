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


def shutdown_signature(profile, exit_code, complete):
    """Owner waiver 2026-11-16: only the known late ACK, after real cleanup."""
    if exit_code != 1 or not complete: return None
    cleanups = [json.loads(p.read_text()) for p in profile.rglob('package-cleanup.json')]
    acks = [json.loads(p.read_text()) for p in profile.rglob('runtime-close-*.json')]
    if not cleanups or not all(c.get('status') == 'SUCCEEDED' and c.get('package_closed') is True
       and c.get('logged_out') is True and c.get('unsaved_changes_discarded') is False for c in cleanups): return None
    def known(a):
        return a.get('closed_ack') is False and a.get('request_error') == 'LOGINOM_RUNTIME_TIMEOUT' and a.get('exit_code') == 0 and a.get('exit_signal') is None
    if not acks or not any(known(a) for a in acks) or not all(a.get('closed_ack') is True or known(a) for a in acks): return None
    return dict(kind='known_two_turn_shutdown_ack_timeout', cleanup_confirmed=True, runtime_exit=0,
                failed_ack_count=sum(known(a) for a in acks))


def exchange(config, prompt):
    """Yield each completed turn and receive the next prompt in the same CLI."""
    folder, profile = Path(config['folder']), Path(config['profile'])
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 140, 0, 0))
    child = subprocess.Popen([config['executable'], config['workspace'], '--headless', '--model',
                              config.get('model', 'openai/gpt-6.1-sol'),
                              '--dangerously-skip-permissions', '--prompt', prompt],
                             stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                             env=dict(config.get('env', os.environ), TERM='xterm-256color'))
    os.close(slave)
    turn, session, finishing, exit_sent, recorded = 1, None, None, False, False
    end = config.get('deadline', float('inf'))
    deadline = min(end, time.time() + 1800)
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
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
                if time.time() > deadline: raise TimeoutError('INTERACTIVE_MODEL_TIMEOUT')
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
                if config.get('require_medium') or config.get('model'):
                    provider, model = config.get('model', 'openai/gpt-6.1-sol').split('/', 1)
                    variant = config.get('variant') or ('medium' if config.get('require_medium') else None)
                    for message in messages:
                        if message.get('role') == 'user':
                            actual = message.get('model', {})
                            assert (actual.get('providerID'), actual.get('modelID'), actual.get('variant')) == (provider, model, variant), 'INTERACTIVE_MODEL_CHANGED'
                if not completed_turn(messages, turn): continue
                if not recorded:
                    boundary('completed', parts); recorded = True
                needs_native = turn == 1 and config.get('kind') == 'read-wait-running'
                native = pending_execution(profile) if needs_native else None
                if needs_native and native is None: continue
                user = [m for m in messages if m.get('role') == 'user'][-1]
                ids = {m['id'] for m in messages if m.get('parentID') == user['id']}
                prompt = yield [event for event in transcript_events(parts) if event['part']['messageID'] in ids]
                if prompt is not None:
                    turn += 1
                    recorded = False
                    boundary('submitted', parts, native)
                    # Bracketed paste keeps newlines inside this one user message.
                    os.write(master, b'\x1b[200~' + prompt.encode() + b'\x1b[201~')
                    time.sleep(.2)
                    os.write(master, b'\r')
                    if config.get('model'): deadline = min(end, time.time() + 1800)
                else:
                    os.write(master, b'\x1b')
                    finishing = time.monotonic()
    finally:
        for sig, handler in previous.items(): signal.signal(sig, handler)
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
    messages, _ = transcript(profile)
    complete = completed_turn(messages, turn)
    signature = shutdown_signature(profile, child.returncode, complete) if not config.get('model') else None
    if signature: (folder / 'shutdown-signature.json').write_text(json.dumps(signature) + '\n')
    assert (child.returncode == 0 or signature) and complete and finishing is not None, 'INTERACTIVE_MODEL_INCOMPLETE'


def transcript_events(parts):
    for part in parts:
        if part['type'] in ['tool', 'text']:
            yield dict(type='tool_use' if part['type'] == 'tool' else 'text', sessionID=part['sessionID'], part=part)


def run(config):
    prompts = config['prompts']
    with closing(exchange(config, prompts[0])) as turns:
        try:
            next(turns)
            for prompt in prompts[1:]:
                turns.send(prompt)
            assert next(turns, None) is None, 'TWO_TURN_INCOMPLETE'
        finally:
            _, parts = transcript(Path(config['profile']))
            for event in transcript_events(parts):
                print(json.dumps(event, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    run(json.loads(Path(sys.argv[1]).read_text()))
