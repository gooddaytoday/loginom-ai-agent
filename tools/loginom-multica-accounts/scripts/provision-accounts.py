#!/usr/bin/env python3
"""Persist a pair before UI creation; retries reuse identities and reconcile uncertainty."""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import time
from uuid import UUID, uuid4
from contextlib import ExitStack, contextmanager
from common import (read_private, write_private, private_snapshot, account_guard, begin_account_effect,
                    process_identity, new_evidence_directory, append_evidence)


def run_foreground(command, guards, evidence_dir, timeout=300, stop_timeout=10):
    # Descendant ownership is scoped to a dedicated subreaper, independent of
    # session/process-group changes. The caller never adopts unrelated children.
    module_spec = importlib.util.spec_from_file_location('account_supervisor', Path(__file__).with_name('process-supervisor.py'))
    supervisor = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(supervisor)
    directory = new_evidence_directory(evidence_dir)
    descriptors = tuple(guard['fd'] for guard in guards)
    if not descriptors or len(set(descriptors)) != len(descriptors):
        raise RuntimeError('ACCOUNT_FD_BINDING_INVALID')
    for guard in guards:
        current = os.fstat(guard['fd'])
        path = Path(guard['path']).stat()
        if (current.st_dev, current.st_ino) != (guard['device'], guard['inode']) or (
                path.st_dev, path.st_ino) != (guard['device'], guard['inode']):
            raise RuntimeError('ACCOUNT_FD_BINDING_INVALID')
    envelope = append_evidence(directory, {'schema': 'account-inherited-guards-v1',
        'guards': [{key: guard[key] for key in ('fd', 'path', 'device', 'inode', 'previous_processes_absent')
                    if key in guard} for guard in guards]})
    environment = {**os.environ, 'LOGINOM_ACCOUNTS_GUARDS_FILE': str(envelope)}
    process = None
    owner = None
    cancelled = False
    previous = {}
    read_fd, write_fd = os.pipe()
    failure = None
    cleanup = 'UNKNOWN'
    records = []
    result = {}

    def interrupt(_signum, _frame):
        nonlocal cancelled
        cancelled = True

    try:
        for signum in (signal.SIGTERM, signal.SIGINT):
            previous[signum] = signal.signal(signum, interrupt)
        with open(directory / 'stdout.log', 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as stdout, open(
                directory / 'stderr.log', 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as stderr:
            try:
                process = subprocess.Popen([sys.executable, Path(__file__).with_name('process-supervisor.py'),
                    str(read_fd), str(os.getpid()), str(timeout), str(stop_timeout), str(directory), *map(str, command)],
                    stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, env=environment,
                    pass_fds=(*descriptors, read_fd), start_new_session=True)
            except OSError:
                raise RuntimeError('ACCOUNT_PROVISION_PROCESS_START_FAILED') from None
            owner = process_identity(process.pid)
            if owner is None: raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED')
            records.append(owner)
            append_evidence(directory, {'phase': 'process-start', 'state': 'UNKNOWN', 'process': owner,
                                       'guards_file': str(envelope)})
            if cancelled: raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')
            os.write(write_fd, b'1')
            deadline = time.monotonic() + timeout + 2 * stop_timeout + 5
            while process.poll() is None:
                if cancelled: supervisor.signal_exact(owner, signal.SIGTERM)
                if time.monotonic() >= deadline:
                    supervisor.signal_exact(owner, signal.SIGTERM)
                    raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED')
                time.sleep(.005)
            process.wait()
            result = read_private(directory / 'supervisor-result.json')
            if result.get('schema') != 'account-process-supervisor-v1' or not supervisor.same(result.get('subreaper'), owner):
                raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED')
            records.extend(result['processes'])
            failure = result['failure']
            if cancelled: failure = 'ACCOUNT_PROVISION_CANCELLED'
            if result['process_cleanup'] != 'PASS':
                raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED')
            for item in records:
                current = process_identity(item['pid'])
                if current and current['start_ticks'] == item['start_ticks'] and current['state'] not in {'Z', 'X'}:
                    raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED')
            cleanup = 'PASS'
            if failure: raise RuntimeError(failure)
            if not isinstance(result['returncode'], int): raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED')
            return result['returncode']
    except BaseException as error:
        failure = str(error) if isinstance(error, RuntimeError) else 'ACCOUNT_PROVISION_SUPERVISOR_FAILED'
        raise
    finally:
        try:
            # EOF cancels an owner that never received the durable start ACK.
            os.close(write_fd)
            write_fd = None
            if process is not None and process.poll() is None and owner is not None:
                # Let the isolated owner finish exact descendant cleanup; do not
                # blindly kill its group and lose detached children to init.
                supervisor.signal_exact(owner, signal.SIGTERM)
                process.wait(timeout=2 * stop_timeout + 5)
            elif process is not None:
                process.wait(timeout=2 * stop_timeout + 5)
        finally:
            os.close(read_fd)
            if write_fd is not None: os.close(write_fd)
            for signum, handler in previous.items(): signal.signal(signum, handler)
            append_evidence(directory, {'phase': 'process-cleanup', 'state': 'UNKNOWN', 'process_cleanup': cleanup,
                'processes': records, 'failure': failure, 'server_absence': 'NOT_PROVED',
                'returncode': result.get('returncode'), 'parent_guard_fds_retained': list(descriptors)})


def require_finite_cleanup():
    # Source-only LAB53: a Mac view is calibrated; this lifecycle/transport is
    # still unqualified. Historical receipts cannot admit a future operation.
    # There is deliberately no flag, receipt boolean or config bypass.
    raise RuntimeError('BLOCKED_FINITE_SERVER_CLEANUP')


def planned_username(issue, role):
    return 'mc-' + str(UUID(issue)).replace('-', '')[:20] + '-' + role[0]


@contextmanager
def pair_guard(directory):
    directory = Path(directory)
    if not directory.is_absolute() or any(p.is_symlink() for p in [directory, *directory.parents]):
        raise RuntimeError('PAIR_LOCK_PATH_INVALID')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
        raise RuntimeError('PAIR_LOCK_PERMISSIONS_INVALID')
    path = directory / '.accounts.lock'
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('PAIR_LOCK_PERMISSIONS_INVALID')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('PAIR_BUSY') from None
        if (path.stat().st_dev, path.stat().st_ino) != (info.st_dev, info.st_ino):
            raise RuntimeError('PAIR_LOCK_REPLACED')
        os.set_inheritable(fd, True)
        yield {'fd': fd, 'path': str(path), 'device': info.st_dev, 'inode': info.st_ino}
    finally:
        os.close(fd)


@contextmanager
def preparation_guard(issue, operator_path, directory, previous_processes, evidence_dir, lock_directory=None):
    issue = str(UUID(issue))
    evidence = new_evidence_directory(evidence_dir)
    with ExitStack() as stack:
        pair = stack.enter_context(pair_guard(Path(directory) / issue))
        snapshot = private_snapshot(operator_path)
        operator = snapshot['data']
        existing = [private_snapshot(Path(directory) / issue / (role + '.json'))
                    for role in ['worker', 'reviewer'] if (Path(directory) / issue / (role + '.json')).exists()]
        role_names = {role: next((item['data']['loginom']['username'] for item in existing
                                 if item['data']['role'] == role), planned_username(issue, role))
                      for role in ['worker', 'reviewer']}
        role_names['admin'] = operator['admin_user']
        if len(set(role_names.values())) != 3:
            raise RuntimeError('ACCOUNT_BINDING_MISMATCH')
        if not isinstance(previous_processes, dict) or set(previous_processes) != set(role_names.values()) or any(
                not isinstance(records, list) for records in previous_processes.values()):
            raise RuntimeError('ACCOUNT_HISTORY_PROVENANCE_REQUIRED')
        guards = {name: stack.enter_context(account_guard(name, [snapshot, *existing], lock_directory,
                  previous_processes=previous_processes[name])) for name in sorted(role_names.values())}
        context = {'operator': operator, 'guards': guards, 'pair_guard': pair, 'role_names': role_names,
                   'evidence_dir': evidence, 'previous_processes': previous_processes}
        append_evidence(evidence, {'phase': 'preparation-guard', 'state': 'UNKNOWN',
            'roles': role_names, 'guards': [{key: g[key] for key in ('path', 'device', 'inode', 'previous_processes_absent')}
                                         for g in guards.values()]})
        yield context


def allocate(issue, operator_path, directory, stage='stage0', held_pair=None):
    if stage != 'stage0':
        raise RuntimeError('STAGE0_PROVIDER_AUTH_FORBIDDEN')
    issue = str(UUID(issue))
    operator = read_private(operator_path)
    directory = Path(directory) / issue
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    configs = []
    with ExitStack() as stack:
        pair = held_pair or stack.enter_context(pair_guard(directory))
        info = os.fstat(pair['fd'])
        current = (directory / '.accounts.lock').stat()
        if (info.st_dev, info.st_ino) != (pair['device'], pair['inode']) or (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
            raise RuntimeError('PAIR_LOCK_REPLACED')
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
                if updated != config:
                    write_private(path, updated)
            else:
                config = {'workspace_id': operator['workspace_id'], 'issue_id': issue, 'agent_id': operator['agents'][role], 'role': role,
                          'stage': stage, 'marker': 'Multica ' + issue + ' ' + role, 'account_state': 'planned',
                          'loginom': {'url': operator['url'], 'username': planned_username(issue, role), 'password': secrets.token_urlsafe(18), 'api_key': operator['api_key']},
                          'operator_file': str(operator_path)}
                write_private(path, config)
            configs.append(path)
    return configs


def prepare_pair(issue, operator_path, directory, previous_processes, evidence_dir, source_sha, lock_directory=None):
    attempt = str(uuid4())
    with preparation_guard(issue, operator_path, directory, previous_processes, evidence_dir, lock_directory) as context:
        configs = allocate(issue, operator_path, directory, held_pair=context['pair_guard'])
        current_configs = [private_snapshot(operator_path), *[private_snapshot(config) for config in configs]]
        for guard in context['guards'].values():
            for before in guard['configs']:
                after = next(item for item in current_configs if item['path'] == before['path'])
                if any(before[key] != after[key] for key in ('device', 'inode', 'sha256')):
                    raise RuntimeError('ACCOUNT_CONFIG_CHANGED')
            guard['configs'] = current_configs
        for role, name in context['role_names'].items():
            begin_account_effect(context['guards'][name], issue, role, attempt, source_sha)
        append_evidence(context['evidence_dir'], {'phase': 'effects-recorded', 'state': 'UNKNOWN', 'attempt_id': attempt})
        guards = [context['pair_guard'], *context['guards'].values()]
        for config in configs:
            evidence = context['evidence_dir'] / config.stem
            command = [context['operator']['node'], Path(__file__).with_name('provision-account.mjs'),
                '--config', config, '--operator', operator_path, '--pair-worker', configs[0], '--pair-reviewer', configs[1],
                '--evidence-dir', evidence]
            if run_foreground(command, guards, evidence):
                raise RuntimeError('ACCOUNT_PROVISION_FAILED')
        # No ready write, marker archive or release authorization is possible
        # from local proofs. The existing connected Admin adapter is unfinished.
        raise RuntimeError('FINAL_SERVER_READBACK_NOT_IMPLEMENTED')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--issue', required=True)
    parser.add_argument('--operator', type=Path, default=Path.home() / '.config/loginom-multica/operator.json')
    parser.add_argument('--directory', type=Path, default=Path.home() / '.config/loginom-multica/cards')
    parser.add_argument('--stage', choices=['stage0'], default='stage0')
    parser.add_argument('--allocate-only', action='store_true')
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--previous-processes', type=Path)
    parser.add_argument('--source-sha')
    args = parser.parse_args()
    if args.allocate_only:
        configs = allocate(args.issue, args.operator, args.directory, args.stage)
        print(json.dumps({'issue_id': str(UUID(args.issue)), 'stage': args.stage,
                          'configs': [str(path) for path in configs], 'verified': False}))
        return
    # Unconditional public gate: before configs, allocation, markers or children.
    require_finite_cleanup()
    if not args.evidence_dir or not args.previous_processes or not args.source_sha:
        raise RuntimeError('PRIVATE_LIFECYCLE_INPUTS_REQUIRED')
    prepare_pair(args.issue, args.operator, args.directory, read_private(args.previous_processes),
                 args.evidence_dir, args.source_sha)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'ACCOUNT_PROVISION_TIMEOUT', file=__import__('sys').stderr)
        raise SystemExit(1)
