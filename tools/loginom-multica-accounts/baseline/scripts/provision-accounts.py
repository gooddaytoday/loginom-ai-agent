#!/usr/bin/env python3
"""Persist a pair before UI creation; retries reuse identities and reconcile uncertainty."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import time
from uuid import UUID
from common import read_private, write_private


def process_group_alive(pid):
    try:
        os.killpg(pid, 0)
    except ProcessLookupError:
        return False
    # An exited orphan can remain a zombie until init reaps it. Zombies have
    # closed their descriptors and cannot retain the accounts lock or browser.
    try:
        result = subprocess.run(['ps', '-e', '-o', 'pgid=', '-o', 'stat='], stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, text=True, timeout=2)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED') from None
    if result.returncode:
        raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED')
    return any(len(fields) == 2 and fields[0] == str(pid) and not fields[1].startswith('Z')
               for fields in (line.split() for line in result.stdout.splitlines()))


def stop_process_group(process, grace):
    try:
        had_children = process_group_alive(process.pid)
    except RuntimeError:
        # A failed inspection must not prevent best-effort group termination.
        had_children = True
    for signum in [signal.SIGTERM, signal.SIGKILL]:
        try:
            os.killpg(process.pid, signum)
        except ProcessLookupError:
            break
        deadline = time.monotonic() + grace
        while True:
            process.poll()
            try:
                if not process_group_alive(process.pid):
                    break
            except RuntimeError:
                break
            if time.monotonic() >= deadline:
                break
            time.sleep(0.02)
        try:
            if not process_group_alive(process.pid):
                break
        except RuntimeError:
            continue
    if process_group_alive(process.pid):
        raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED')
    try:
        process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED') from None
    return had_children


def run_foreground(command, lock, timeout=300, stop_timeout=10):
    process = None
    cancelled = None
    previous = {}

    def interrupt(signum, _frame):
        nonlocal cancelled
        cancelled = signum
        if process is not None:
            try:
                os.killpg(process.pid, signum)
            except ProcessLookupError:
                pass

    try:
        for signum in [signal.SIGTERM, signal.SIGINT]:
            previous[signum] = signal.signal(signum, interrupt)
        if cancelled:
            raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')
        try:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, pass_fds=(lock,), start_new_session=True)
        except OSError:
            raise RuntimeError('ACCOUNT_PROVISION_PROCESS_START_FAILED') from None
        deadline = time.monotonic() + timeout
        while True:
            if cancelled:
                raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError('ACCOUNT_PROVISION_TIMEOUT')
            try:
                code = process.wait(timeout=min(0.1, remaining))
                break
            except subprocess.TimeoutExpired:
                pass
    finally:
        try:
            # The caller still owns the lock throughout group shutdown. The
            # inherited descriptor also protects it if the caller is killed.
            had_children = stop_process_group(process, stop_timeout) if process is not None else False
        finally:
            for signum, handler in previous.items():
                signal.signal(signum, handler)
    if cancelled:
        raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')
    if code == 0 and had_children:
        raise RuntimeError('ACCOUNT_PROVISION_CHILDREN_REMAINED')
    return code


def allocate(issue, operator_path, directory, stage='full'):
    if stage not in {'full', 'stage0'}:
        raise RuntimeError('ACCOUNT_STAGE_INVALID')
    issue = str(UUID(issue))
    operator = read_private(operator_path)
    auth_files = None
    if stage == 'full':
        auth_files = operator.get('provider_auth_files')
        if (not isinstance(auth_files, list) or len(auth_files) != 8 or
                any(not isinstance(path, str) or not Path(path).is_absolute() for path in auth_files) or
                len(set(auth_files)) != 8):
            raise RuntimeError('EIGHT_PROVIDER_AUTH_FILES_REQUIRED')
    directory = Path(directory) / issue
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = os.open(directory / '.accounts.lock', os.O_RDWR | os.O_CREAT, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX)
    configs = []
    try:
        existing = {}
        # Validate both roles before writing either: a retry must not reclassify
        # a partial pair or change its persisted account/operator bindings.
        for role in ['worker', 'reviewer']:
            path = directory / (role + '.json')
            if path.exists():
                config = read_private(path)
                if config['issue_id'] != issue or config['role'] != role or config['agent_id'] != operator['agents'][role]:
                    raise RuntimeError('ACCOUNT_BINDING_MISMATCH')
                if config['workspace_id'] != operator['workspace_id']:
                    raise RuntimeError('WORKSPACE_MISMATCH')
                if config.get('operator_file') != str(operator_path):
                    raise RuntimeError('OPERATOR_BINDING_MISMATCH')
                if config.get('stage', 'full') != stage:
                    raise RuntimeError('ACCOUNT_STAGE_MISMATCH')
                if config.get('account_state') not in {'planned', 'creating', 'ready'}:
                    raise RuntimeError('ACCOUNT_STATE_INVALID')
                if stage == 'stage0' and any(key in config for key in ['provider_auth_file', 'provider_auth_files']):
                    raise RuntimeError('STAGE0_PROVIDER_AUTH_FORBIDDEN')
                existing[role] = config
        for role in ['worker', 'reviewer']:
            path = directory / (role + '.json')
            if role in existing:
                config = existing[role]
                updated = {**config, 'stage': stage}
                if stage == 'full':
                    updated['provider_auth_files'] = auth_files
                    updated.pop('provider_auth_file', None)
                if updated != config:
                    write_private(path, updated)
            else:
                config = {'workspace_id': operator['workspace_id'], 'issue_id': issue, 'agent_id': operator['agents'][role], 'role': role,
                          'stage': stage, 'marker': 'Multica ' + issue + ' ' + role, 'account_state': 'planned',
                          'loginom': {'url': operator['url'], 'username': 'mc-' + issue.replace('-', '')[:20] + '-' + role[0], 'password': secrets.token_urlsafe(18), 'api_key': operator['api_key']},
                          'operator_file': str(operator_path)}
                if stage == 'full':
                    config.update({'model': operator.get('model', 'openai/gpt-6.1-sol'), 'variant': 'low',
                                   'provider_auth_files': auth_files, 'model_cache_file': operator.get('model_cache_file')})
                write_private(path, config)
            configs.append(path)
    finally:
        os.close(lock)
    return configs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--issue', required=True)
    parser.add_argument('--operator', type=Path, default=Path.home() / '.config/loginom-multica/operator.json')
    parser.add_argument('--directory', type=Path, default=Path.home() / '.config/loginom-multica/cards')
    parser.add_argument('--stage', choices=['full', 'stage0'], default='full',
                        help='stage0 provisions only native research Loginom accounts; full requires eight model authorizations')
    parser.add_argument('--allocate-only', action='store_true')
    args = parser.parse_args()
    configs = allocate(args.issue, args.operator, args.directory, args.stage)
    operator = read_private(args.operator)
    if not args.allocate_only:
        lock = os.open(configs[0].parent / '.accounts.lock', os.O_RDWR)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX)
            for config in configs:
                code = run_foreground([operator['node'], Path(__file__).with_name('provision-account.mjs'), '--config', config, '--operator', args.operator], lock)
                if code:
                    raise RuntimeError('ACCOUNT_PROVISION_FAILED: ' + config.name)
        finally:
            os.close(lock)
    print(json.dumps({'issue_id': str(UUID(args.issue)), 'stage': args.stage, 'configs': [str(path) for path in configs], 'verified': not args.allocate_only}))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'ACCOUNT_PROVISION_TIMEOUT', file=__import__('sys').stderr)
        raise SystemExit(1)
