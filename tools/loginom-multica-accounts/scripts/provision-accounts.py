#!/usr/bin/env python3
"""Persist a pair before UI creation; retries reuse identities and reconcile uncertainty."""
import argparse
import fcntl
import importlib.util
import json
import hashlib
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


def run_foreground(command, guards, evidence_dir, timeout=300, stop_timeout=10, operation_binding=None, guard_barrier=False, harness_audit=None):
    # Descendant ownership is scoped to a dedicated subreaper, independent of
    # session/process-group changes. The caller never adopts unrelated children.
    if operation_binding is not None:
        if set(operation_binding) != {'issue_id', 'operation_id', 'source_sha'}:
            raise RuntimeError('ACCOUNT_OPERATION_BINDING_INVALID')
        for key in ('issue_id', 'operation_id'):
            if str(UUID(operation_binding[key])) != operation_binding[key]:
                raise RuntimeError('ACCOUNT_OPERATION_BINDING_INVALID')
        source = operation_binding['source_sha']
        if not isinstance(source, str) or len(source) != 40 or any(c not in '0123456789abcdef' for c in source):
            raise RuntimeError('ACCOUNT_OPERATION_BINDING_INVALID')
    module_spec = importlib.util.spec_from_file_location('account_supervisor', Path(__file__).with_name('process-supervisor.py'))
    supervisor = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(supervisor)
    directory = new_evidence_directory(evidence_dir)
    descriptors = tuple(guard['fd'] for guard in guards)
    read_only_collector = not descriptors and len(command) >= 2 and Path(command[1]).resolve() in {
        Path(__file__).with_name(name).resolve() for name in ['finalize-preparation.mjs', 'historical-readback.mjs', 'retired-worker-readback.mjs']}
    if (not descriptors and not read_only_collector) or len(set(descriptors)) != len(descriptors):
        raise RuntimeError('ACCOUNT_FD_BINDING_INVALID')
    for guard in guards:
        current = os.fstat(guard['fd'])
        path = Path(guard['path']).stat()
        if (current.st_dev, current.st_ino) != (guard['device'], guard['inode']) or (
                path.st_dev, path.st_ino) != (guard['device'], guard['inode']):
            raise RuntimeError('ACCOUNT_FD_BINDING_INVALID')
    envelope = append_evidence(directory, {'schema': 'account-inherited-guards-v1',
        **({'audit': harness_audit} if harness_audit is not None else {}),
        'guards': [{key: guard[key] for key in ('fd', 'path', 'device', 'inode', 'previous_processes_absent')
                    if key in guard} for guard in guards]})
    environment = {**os.environ, 'LOGINOM_ACCOUNTS_GUARDS_FILE': str(envelope),
                   'LOGINOM_ACCOUNTS_FLOCK_BARRIER': 'required' if guard_barrier else 'not-requested'}
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
                'returncode': result.get('returncode'), 'parent_guard_fds_retained': list(descriptors),
                'flock_barrier': result.get('flock_barrier'),
                **(operation_binding or {})})


def clean_candidate(source_sha):
    root = Path(__file__).resolve().parents[1]
    version = root / 'VERSION.json'
    data = json.loads(version.read_text())
    for relative, digest in data['files'].items():
        if hashlib.sha256((root / relative).read_bytes()).hexdigest() != digest:
            raise RuntimeError('CAPTURE_SOURCE_CHANGED')
    actual = subprocess.check_output(['git', '-C', root, 'rev-parse', 'HEAD'], text=True).strip()
    changed = subprocess.check_output(['git', '-C', root, 'status', '--porcelain', '--', '.'], text=True)
    if actual != source_sha or changed:
        raise RuntimeError('CAPTURE_SOURCE_NOT_CLEAN_PUBLISHED')
    return {'sha': actual, 'tree': subprocess.check_output(['git', '-C', root, 'rev-parse', 'HEAD^{tree}'], text=True).strip(),
            'manifest_sha256': hashlib.sha256(version.read_bytes()).hexdigest()}


def finish_qualified_pair(context, configs, operation, verify_file, proof_file, markers, processes):
    spec = importlib.util.spec_from_file_location('account_owner_archive', Path(__file__).with_name('owner-archive.py'))
    owner = importlib.util.module_from_spec(spec); spec.loader.exec_module(owner)
    snapshots = [private_snapshot(path) for path in [context['operator_path'], *configs]]
    before = {Path(item['path']): item['data'] for item in snapshots[1:]}
    try:
        # The entire archive/ready transaction is covered by failure handling.
        for name, guard in context['guards'].items():
            owner.archive_owned(guard, markers[name], snapshots, operation, verify_file, proof_file, processes,
                                context['evidence_dir'] / ('history-' + guard['role']))
        for path, config in before.items(): write_private(path, {**config, 'account_state': 'ready'})
        current = [private_snapshot(path) for path in configs]
        for snapshot in current:
            original = before[Path(snapshot['path'])]
            if snapshot['data'] != {**original, 'account_state': 'ready'}: raise RuntimeError('ACCOUNT_READY_WRITE_UNCONFIRMED')
        receipt = append_evidence(context['evidence_dir'], {'phase': 'pair-qualified', 'operation_id': operation['operation_id'],
            'source': operation['source'], 'proof_file': str(proof_file), 'configs': [{key: item[key] for key in ['path', 'device', 'inode', 'sha256']}
            for item in current], 'changed_keys': ['account_state'], 'server_absence': 'BOUND_FINAL_PROOF'})
        return {'status': 'PAIR_QUALIFIED', 'ready': True, 'operation_id': operation['operation_id'], 'receipt': str(receipt)}
    except BaseException:
        # All guards remain held. Restore the exact original UNKNOWN inodes and
        # bytes from immutable history, and restore the planned config values.
        failures = []
        for name, guard in context['guards'].items():
            for item in markers[name]:
                path = Path(item['path'])
                archived = context['evidence_dir'] / ('history-' + guard['role']) / (path.name + '-' + operation['operation_id'])
                try:
                    retained = path if path.exists() else archived
                    stat = retained.lstat()
                    if retained.is_symlink() or (stat.st_dev, stat.st_ino, hashlib.sha256(retained.read_bytes()).hexdigest()) != (
                            item['device'], item['inode'], item['sha256']): raise RuntimeError('ACCOUNT_UNKNOWN_RESTORE_UNCONFIRMED')
                    if not path.exists(): os.link(archived, path, follow_symlinks=False)
                    fd = os.open(path.parent, os.O_RDONLY)
                    try: os.fsync(fd)
                    finally: os.close(fd)
                except Exception as error: failures.append(type(error).__name__)
        for path, config in before.items():
            try: write_private(path, config)
            except Exception as error: failures.append(type(error).__name__)
        append_evidence(context['evidence_dir'], {'phase': 'pair-qualified-write-failed', 'state': 'UNKNOWN',
            'operation_id': operation['operation_id'], 'history_preserved': True, 'restore_failures': failures})
        raise


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


def prepare_pair(issue, operator_path, directory, previous_processes, evidence_dir, source_sha, lock_directory=None,
                 parent_binding_file=None, operation_id=None):
    if not parent_binding_file or not operation_id: raise RuntimeError('PRIVATE_PARENT_BINDING_REQUIRED')
    attempt = str(UUID(operation_id))
    source = clean_candidate(source_sha)
    parent_binding = private_snapshot(parent_binding_file)
    authorization = parent_binding['data']
    if authorization.get('issue_id') != issue or authorization.get('operation_id') != attempt or authorization.get('source') != source:
        raise RuntimeError('PRIVATE_PARENT_BINDING_REQUIRED')
    config_paths = [operator_path, *[Path(directory) / issue / (role + '.json') for role in ['worker', 'reviewer']]]
    initial = [private_snapshot(path) for path in config_paths]
    config_bindings = [{key: item[key] for key in ['path', 'device', 'inode', 'sha256']} for item in initial]
    if authorization.get('configs') != config_bindings: raise RuntimeError('PRIVATE_PARENT_CONFIG_BINDING_REQUIRED')
    with preparation_guard(issue, operator_path, directory, previous_processes, evidence_dir, lock_directory) as context:
        configs = allocate(issue, operator_path, directory, held_pair=context['pair_guard'])
        context['operator_path'] = operator_path
        current_configs = [private_snapshot(operator_path), *[private_snapshot(config) for config in configs]]
        if [{key: item[key] for key in ['path', 'device', 'inode', 'sha256']} for item in current_configs] != config_bindings:
            raise RuntimeError('PRIVATE_PARENT_CONFIG_BINDING_REQUIRED')
        for guard in context['guards'].values():
            for before in guard['configs']:
                after = next(item for item in current_configs if item['path'] == before['path'])
                if any(before[key] != after[key] for key in ('device', 'inode', 'sha256')):
                    raise RuntimeError('ACCOUNT_CONFIG_CHANGED')
            guard['configs'] = current_configs
        markers = {}
        for role, name in context['role_names'].items():
            context['guards'][name]['role'] = role
            begin_account_effect(context['guards'][name], issue, role, attempt, source_sha)
            marker = Path(context['guards'][name]['path']).with_suffix('.active.json')
            info = marker.stat()
            markers[name] = [{'path': str(marker), 'device': info.st_dev, 'inode': info.st_ino,
                             'sha256': hashlib.sha256(marker.read_bytes()).hexdigest()}]
        append_evidence(context['evidence_dir'], {'phase': 'effects-recorded', 'state': 'UNKNOWN', 'attempt_id': attempt})
        guards = [context['pair_guard'], *context['guards'].values()]
        operation = {'schema': 'lab53-preparation-operation-v1', 'issue_id': issue, 'operation_id': attempt,
            'source': source, 'stand': context['operator']['url'], 'expected_observer': authorization['expected_observer'],
            'configs': config_bindings,
            'parent_authorization': {key: parent_binding[key] for key in ['path', 'device', 'inode', 'sha256']}}
        operation_file = append_evidence(context['evidence_dir'], operation)
        receipts, processes = [], []
        for config in configs:
            evidence = context['evidence_dir'] / config.stem
            command = [context['operator']['node'], Path(__file__).with_name('qualify-preparation.mjs'),
                '--config', config, '--operator', operator_path, '--pair-worker', configs[0], '--pair-reviewer', configs[1],
                '--evidence-dir', evidence, '--operation-file', operation_file]
            audit = {'schema': 'parent-held-audited-harness-v1', 'source_sha': source_sha,
                'manifest_sha256': source['manifest_sha256'], 'entrypoint': 'qualify-preparation.mjs',
                'parent': process_identity(os.getpid()), 'parent_command_sha256': hashlib.sha256(json.dumps(
                    Path('/proc/self/cmdline').read_bytes().decode().split('\0')[:-1], separators=(',', ':')).encode()).hexdigest()}
            if run_foreground(command, guards, evidence, operation_binding={
                    'issue_id': issue, 'operation_id': attempt, 'source_sha': source_sha},
                    guard_barrier=True, harness_audit=audit):
                raise RuntimeError('ACCOUNT_PROVISION_FAILED')
            cleanup = next(read_private(p) for p in evidence.glob('event-*.json') if read_private(p).get('phase') == 'process-cleanup')
            if cleanup['process_cleanup'] != 'PASS' or cleanup['failure'] is not None or cleanup['returncode'] != 0:
                raise RuntimeError('ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED')
            processes.extend(cleanup['processes'])
            completion = read_private(evidence / 'ui-completion.json')
            if completion.get('schema') != 'lab53-ui-completion-v1' or completion.get('operation_id') != attempt or (
                    completion.get('issue_id') != issue or completion.get('source') != source) or completion.get('role') != config.stem or (
                    completion.get('expected_observer') != operation['expected_observer'] or not completion.get('own_browser_closed')):
                raise RuntimeError('ACCOUNT_COMPLETION_BINDING_UNKNOWN')
            receipts.extend(completion['receipts'])
        if clean_candidate(source_sha) != source or private_snapshot(parent_binding_file)['sha256'] != parent_binding['sha256']:
            raise RuntimeError('CAPTURE_SOURCE_CHANGED')
        roles = [item['role'] for item in receipts]
        if roles.count('admin') != 2 or roles.count('worker') != 1 or roles.count('reviewer') != 1:
            raise RuntimeError('ALL_EFFECTS_LOGOUT_UNCONFIRMED')
        if any(item['logout'].get('guid_hash') != item['effect']['guid_hash'] or (
                item['logout'].get('ui_logout_invoked') is not True or item['logout'].get('transport_disconnected') is not True)
                for item in receipts): raise RuntimeError('ALL_EFFECTS_LOGOUT_UNCONFIRMED')
        effects = [item['effect'] for item in receipts]
        binding = {'issue_id': issue, 'operation_id': attempt, 'source_sha': source_sha}
        cleanup_file = append_evidence(context['evidence_dir'], {**binding, 'phase': 'process-cleanup',
            'process_cleanup': 'PASS', 'failure': None, 'returncode': 0, 'processes': processes,
            'own_loginom_fds_absent': True, 'parent_guard_fds_retained': [g['fd'] for g in guards]})
        logout_file = append_evidence(context['evidence_dir'], {**binding, 'effects': effects, 'receipts': receipts,
            'all_ui_logout_invoked': all(item['logout']['ui_logout_invoked'] for item in receipts),
            'all_transports_disconnected': all(item['logout']['transport_disconnected'] for item in receipts)})
        final = context['evidence_dir'] / 'final'; final.mkdir(mode=0o700)
        inputs = {'directory': str(final), 'issueId': issue, 'operationId': attempt, 'source': source,
            'stand': operation['stand'], 'configs': list(map(str, [operator_path, *configs])), 'effects': effects,
            'cleanupFile': str(cleanup_file), 'logoutFile': str(logout_file), 'expectedObserver': operation['expected_observer']}
        input_file = append_evidence(final, inputs)
        collector = [context['operator']['node'], Path(__file__).with_name('finalize-preparation.mjs')]
        if run_foreground([*collector, 'request', input_file], [], final / 'request-collector', timeout=10):
            raise RuntimeError('FINAL_SERVER_REQUEST_UNKNOWN')
        response = final / 'parent-response.json'
        deadline = time.monotonic() + 300
        while not response.exists():
            if time.monotonic() >= deadline: raise RuntimeError('FINAL_SERVER_READBACK_TIMEOUT')
            time.sleep(.05)
        # Closed private parent handoff is the trust boundary. The strict reader
        # consumes a fresh nonce, exact observer, all effects and configs/PIDs.
        expected = {**binding, 'source_tree': source['tree'], 'manifest_sha256': source['manifest_sha256'],
            'config_paths': inputs['configs'], 'cleanup_file': str(cleanup_file), 'logout_file': str(logout_file),
            'expected_observer': operation['expected_observer']}
        verify_file = append_evidence(final, {'directory': str(final), 'requestFile': str(final / 'parent-request.json'),
            'responseFile': str(response), 'expected': expected})
        if run_foreground([*collector, 'verify', verify_file], [], final / 'verify-collector', timeout=10):
            raise RuntimeError('FINAL_SERVER_READBACK_UNKNOWN')
        # Reachable only through the fixed qualification coordinator and ALL
        # strict proofs. Ordinary public gates remain unconditional.
        return finish_qualified_pair(context, configs, operation, verify_file, final / 'final-proof.json', markers, processes)


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
    parser.add_argument('--parent-binding-file', type=Path)
    parser.add_argument('--operation-id')
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
                 args.evidence_dir, args.source_sha, parent_binding_file=args.parent_binding_file, operation_id=args.operation_id)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'ACCOUNT_PROVISION_TIMEOUT', file=__import__('sys').stderr)
        raise SystemExit(1)
