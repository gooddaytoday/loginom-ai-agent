#!/usr/bin/env python3
"""Finite owner archival of the exact two legacy markers, no Loginom login.

Missing retained collector/own-provenance or fresh held-lock proof is UNKNOWN.
Original bytes and missing historical facts are never rewritten.
"""
import argparse
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import time
from uuid import UUID
from common import read_private, process_identity, write_private, new_evidence_directory

LEGACY = {
    '01a11d36-053e-78da-b06c-e313de5319e3': '9595e0bb0d748a5e04a67c62f97c3e59b0c5ce839500eeb56716e1ec77630a90',
    '01a11d36-2811-71ba-a493-0e397e3e60f2': '74f25f19294cc007923e4deb04763a9203fea294d93177d68d4e5a2f548d425e',
}
digest = lambda raw: hashlib.sha256(raw).hexdigest()
compact = lambda data: json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()


def binding(path):
    path = Path(path)
    if not path.is_absolute() or any(p.is_symlink() for p in [path, *path.parents]): raise RuntimeError('HISTORICAL_PRIVATE_PATH_INVALID')
    info = path.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o077 or not path.is_file(): raise RuntimeError('HISTORICAL_PRIVATE_PATH_INVALID')
    return {'path': str(path), 'device': info.st_dev, 'inode': info.st_ino, 'sha256': digest(path.read_bytes())}


def check_absent(records):
    if not records or len({(r['pid'], r['start_ticks']) for r in records}) != len(records): raise RuntimeError('HISTORICAL_PROCESS_RECORDS_REQUIRED')
    for old in records:
        if not isinstance(old['pid'], int) or old['pid'] <= 0 or not isinstance(old['start_ticks'], str) or not old['start_ticks'].isdigit(): raise RuntimeError('HISTORICAL_PROCESS_RECORDS_REQUIRED')
        now = process_identity(old['pid'])
        if now and now['start_ticks'] == old['start_ticks'] and now['state'] not in {'Z', 'X'}: raise RuntimeError('HISTORICAL_WRITER_PRESENT')


def lock_matches(line, target):
    # /proc/locks uses hex major:minor plus decimal inode. Match all three.
    for token in line.split():
        parts = token.split(':')
        if len(parts) == 3:
            try:
                if (int(parts[0], 16), int(parts[1], 16), int(parts[2])) == (
                        os.major(target['device']), os.minor(target['device']), target['inode']): return True
            except ValueError: pass
    return False


def fsync_directory(path):
    handle = os.open(path, os.O_RDONLY)
    try: os.fsync(handle)
    finally: os.close(handle)


def archive_legacy(markers, history, receipt_file, receipt):
    history.mkdir(mode=0o700)
    linked = []
    try:
        # Durably link BOTH exact original inodes before removing either.
        for marker in markers:
            if binding(marker['path']) != {k: marker[k] for k in ['path', 'device', 'inode', 'sha256']}:
                raise RuntimeError('HISTORICAL_MARKER_CHANGED')
            destination = history / Path(marker['path']).name
            os.link(marker['path'], destination, follow_symlinks=False); linked.append((marker, destination))
        fsync_directory(history)
        for marker, destination in linked:
            if binding(marker['path']) != {k: marker[k] for k in ['path', 'device', 'inode', 'sha256']}:
                raise RuntimeError('HISTORICAL_MARKER_CHANGED')
            Path(marker['path']).unlink()
        for parent in {Path(m['path']).parent for m in markers}: fsync_directory(parent)
        # Receipt persistence is part of the SAME rollback boundary.
        write_private(receipt_file, {**receipt, 'markers': [{'file': str(dest), 'sha256': m['sha256']} for m, dest in linked]})
    except BaseException as original:
        failures = []
        for marker, destination in linked:
            try:
                expected = {k: marker[k] for k in ['device', 'inode', 'sha256']}
                actual = binding(str(destination))
                if {k: actual[k] for k in expected} != expected: raise RuntimeError('HISTORICAL_HISTORY_CHANGED')
                if not Path(marker['path']).exists(): os.link(destination, marker['path'], follow_symlinks=False)
                if binding(marker['path']) != {k: marker[k] for k in ['path', 'device', 'inode', 'sha256']}:
                    raise RuntimeError('HISTORICAL_RESTORE_UNKNOWN')
                fsync_directory(Path(marker['path']).parent)
            except Exception as error: failures.append(type(error).__name__)
        if failures: raise RuntimeError('HISTORICAL_RESTORE_UNKNOWN:' + ','.join(failures)) from original
        raise


def validate_fd_proof(request, proof):
    if proof.get('schema') != 'lab53-held-fd-inventory-v1' or proof.get('operation_id') != request['operation_id'] or (
            proof.get('nonce') != request['nonce'] or proof.get('request_sha256') != digest(compact(request))
            or proof.get('source_sha256') != digest(Path(__file__).with_name('own-fd-inventory.py').read_bytes())):
        raise RuntimeError('HISTORICAL_FD_BINDING_UNKNOWN')
    observed = datetime.datetime.fromisoformat(proof['observed_at'])
    age = (datetime.datetime.now(datetime.timezone.utc) - observed).total_seconds()
    if age < 0 or age > 300: raise RuntimeError('HISTORICAL_FD_PROOF_STALE')
    if proof['before']['visible_pids'] != proof['after']['visible_pids']:
        raise RuntimeError('HISTORICAL_FD_CENSUS_CHANGED')
    expected_guard = {**request['guard'], 'pid': request['guardian']['pid']}
    expected_guard = {k: expected_guard[k] for k in ['pid', 'fd', 'device', 'inode']}
    for sample in [proof['before'], proof['after']]:
        if not sample['visible_pids'] or sample['errors'] or sample['targets'] != request['targets'] or sample['control_observed'] is not True:
            raise RuntimeError('HISTORICAL_FD_CENSUS_INCOMPLETE')
        guardian = sample['guardian']
        if not guardian or any(guardian[k] != request['guardian'][k] for k in ['pid', 'start_ticks']): raise RuntimeError('HISTORICAL_GUARDIAN_CHANGED')
        check_absent([sample['control']])
        control = {k: sample['control'][k] for k in ['pid', 'fd', 'device', 'inode']}
        if control not in sample['holders'] or expected_guard not in sample['holders'] or (
                any(h not in [control, expected_guard] for h in sample['holders'])): raise RuntimeError('HISTORICAL_FD_HOLDER_PRESENT')
        if not any('FLOCK' in line and 'ADVISORY' in line and 'WRITE' in line and lock_matches(line, request['guard'])
                   for line in sample['guardian_fdinfo'].splitlines()): raise RuntimeError('HISTORICAL_FLOCK_UNKNOWN')
        for target in request['targets']:
            lines = [l for l in sample['kernel_locks'].splitlines() if lock_matches(l, target)]
            if ((target['device'], target['inode']) != (request['guard']['device'], request['guard']['inode']) and lines) or (
                    (target['device'], target['inode']) == (request['guard']['device'], request['guard']['inode']) and (len(lines) != 1 or str(request['guardian']['pid']) not in lines[0].split())):
                raise RuntimeError('HISTORICAL_KERNEL_LOCK_UNKNOWN')


def historical_targets(grant, operator_user_hash):
    old = []
    if {item['issue_id'] for item in grant['markers']} != set(LEGACY): raise RuntimeError('HISTORICAL_SCOPE_UNKNOWN')
    for item in grant['markers']:
        expected = {k: item[k] for k in ['path', 'device', 'inode', 'sha256']}
        marker = read_private(item['path'])
        if item['sha256'] != LEGACY[item['issue_id']] or binding(item['path']) != expected or (
                marker.get('issue_id') != item['issue_id'] or marker.get('attempt_uuid') != item['attempt_uuid']):
            raise RuntimeError('HISTORICAL_MARKER_CHANGED')
        provenance = item['collector']; source = binding(provenance['source_file']); receipt_binding = binding(provenance['execution_receipt'])
        receipt = read_private(provenance['execution_receipt'])
        if source['sha256'] != provenance['source_sha256'] or receipt_binding['sha256'] != provenance['execution_sha256'] or (
                receipt.get('schema') != 'lab53-retained-guid-collector-v1' or receipt.get('issue_id') != item['issue_id']
                or receipt.get('attempt_uuid') != item['attempt_uuid'] or receipt.get('source_sha256') != source['sha256']
                or receipt.get('guid_sha256') != item['guid_hash'] or receipt.get('user_sha256') != operator_user_hash
                or receipt.get('algorithm') != 'sha256-utf8-exact-guid-string'):
            raise RuntimeError('HISTORICAL_GUID_ALGORITHM_NOT_ESTABLISHED')
        expression = receipt.get('expression')
        if receipt.get('provenance_mode') != 'owner-audited-original-task-chain':
            raise RuntimeError('HISTORICAL_COLLECTOR_EXECUTION_NOT_ESTABLISHED')
        UUID(receipt['original_task_id'])
        if not expression or expression not in Path(provenance['source_file']).read_text(): raise RuntimeError('HISTORICAL_GUID_ALGORITHM_NOT_ESTABLISHED')
        records = receipt.get('execution_bindings', {})
        if set(records) != {'input', 'ack', 'readback'}: raise RuntimeError('HISTORICAL_COLLECTOR_EXECUTION_NOT_ESTABLISHED')
        for record in records.values():
            if binding(record['path'])['sha256'] != record['sha256']: raise RuntimeError('HISTORICAL_COLLECTOR_EXECUTION_NOT_ESTABLISHED')
        old.append({'user_hash': operator_user_hash, 'guid_hash': item['guid_hash'], 'guid_algorithm': receipt['algorithm'],
            'collector_sha256': source['sha256'], 'algorithm_receipt_sha256': receipt_binding['sha256']})
    return old


def reconcile(authorization_file, evidence_dir, source_sha):
    spec = importlib.util.spec_from_file_location('historical_coordinator', Path(__file__).with_name('provision-accounts.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    source = module.clean_candidate(source_sha); authorization = binding(authorization_file); grant = read_private(authorization_file)
    if grant.get('schema') != 'lab53-historical-owner-binding-v1' or grant.get('source') != source or grant.get('issue_id') != '01a11e17-b869-7550-8450-35e5e17119d4':
        raise RuntimeError('HISTORICAL_OWNER_BINDING_REQUIRED')
    operation_id = str(UUID(grant['operation_id'])); directory = new_evidence_directory(evidence_dir)
    targets = [*grant['configs'], *grant['locks'], *[{k: x[k] for k in ['path', 'device', 'inode', 'sha256']} for x in grant['markers']]]
    if len(grant['configs']) != 7 or len(grant['locks']) != 5 or len(grant['markers']) != 2 or len({t['path'] for t in targets}) != 14:
        raise RuntimeError('HISTORICAL_TARGET_SCOPE_REQUIRED')
    operator = read_private(grant['configs'][0]['path']); user_hash = digest(operator['admin_user'].encode())
    lock = grant['lock']; path = Path(lock['path'])
    if lock not in grant['locks'] or {m['path'] for m in grant['markers']} != {str(path.with_suffix('.active.json')), str(path) + '.active.json'}:
        raise RuntimeError('HISTORICAL_FLOCK_UNKNOWN')
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if (info.st_dev, info.st_ino) != (lock['device'], lock['inode']) or str(path.name) != operator['admin_user'] + '.lock': raise RuntimeError('HISTORICAL_FLOCK_UNKNOWN')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for target in targets:
            if binding(target['path']) != target: raise RuntimeError('HISTORICAL_TARGET_CHANGED')
        check_absent(grant['previous_processes'])
        historical = historical_targets(grant, user_hash)
        input_data = {k: grant[k] for k in ['issue_id', 'operation_id', 'source', 'expected_observer']}
        input_data.update(directory=str(directory), stand=operator['url'], configs=grant['configs'], historical=historical)
        input_file = directory / 'input.json'; write_private(input_file, input_data)
        collector = [operator['node'], Path(__file__).with_name('historical-readback.mjs')]
        if module.run_foreground([*collector, 'request', input_file], [], directory / 'request', timeout=10): raise RuntimeError('HISTORICAL_REQUEST_UNKNOWN')
        def wait(path):
            deadline = time.monotonic() + 300
            while not path.exists():
                if time.monotonic() > deadline: raise RuntimeError('HISTORICAL_HANDOFF_TIMEOUT')
                time.sleep(.05)
        response = directory / 'parent-response.json'; wait(response)
        input_data.update(requestFile=str(directory / 'parent-request.json'), responseFile=str(response)); write_private(input_file, input_data)
        if module.run_foreground([*collector, 'verify', input_file], [], directory / 'verify', timeout=10): raise RuntimeError('HISTORICAL_SERVER_PROOF_UNKNOWN')
        request = read_private(directory / 'parent-request.json')
        consumed = directory / ('historical-consumed-' + request['nonce'] + '.json')
        consumed_hash = digest(consumed.read_bytes()); proof = read_private(consumed)
        if proof['input_sha256'] != digest(input_file.read_bytes()) or proof['response_sha256'] != digest(response.read_bytes()): raise RuntimeError('HISTORICAL_SERVER_PROOF_CHANGED')
        fd_request = {'operation_id': operation_id, 'source': source, 'nonce': secrets.token_hex(32),
            'guardian': process_identity(os.getpid()), 'guard': {**lock, 'fd': fd}, 'targets': targets}
        write_private(directory / 'fd-request.json', fd_request)
        fd_proof = directory / 'fd-response.json'; wait(fd_proof); validate_fd_proof(fd_request, read_private(fd_proof))
        check_absent(grant['previous_processes'])
        if module.clean_candidate(source_sha) != source or binding(authorization_file) != authorization: raise RuntimeError('HISTORICAL_SOURCE_CHANGED')
        for target in targets:
            if binding(target['path']) != target: raise RuntimeError('HISTORICAL_TARGET_CHANGED')
        if digest(response.read_bytes()) != proof['response_sha256'] or digest(input_file.read_bytes()) != proof['input_sha256']:
            raise RuntimeError('HISTORICAL_SERVER_PROOF_CHANGED')
        if digest(consumed.read_bytes()) != consumed_hash or digest((directory / 'parent-request.json').read_bytes()) != proof['request_sha256']:
            raise RuntimeError('HISTORICAL_SERVER_PROOF_CHANGED')
        observed = datetime.datetime.fromisoformat(proof['readback']['refreshed_at'].replace('Z', '+00:00'))
        if not 0 <= (datetime.datetime.now(datetime.timezone.utc) - observed).total_seconds() <= 300:
            raise RuntimeError('HISTORICAL_SERVER_PROOF_STALE')
        if historical_targets(grant, user_hash) != historical: raise RuntimeError('HISTORICAL_COLLECTOR_CHANGED')
        own_fd = Path(f'/proc/self/fdinfo/{fd}').read_text()
        if not any('FLOCK' in line and 'WRITE' in line and lock_matches(line, lock) for line in own_fd.splitlines()):
            raise RuntimeError('HISTORICAL_FLOCK_UNKNOWN')
        archive_legacy(grant['markers'], directory / 'immutable-history', directory / 'current-owner-reconciled.json', {
            'operation_id': operation_id, 'source': source, 'history_facts_modified': False,
            'history_state': 'UNKNOWN_PRESERVED', 'current_proof': 'BOUND_HELD_FLOCK_AND_FRESH_PARENT',
            'server_receipt_sha256': consumed_hash, 'fd_receipt_sha256': digest(fd_proof.read_bytes())})
    finally: os.close(fd)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--authorization', type=Path, required=True)
    parser.add_argument('--evidence-dir', type=Path, required=True); parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    try: reconcile(args.authorization, args.evidence_dir, args.source_sha)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'HISTORICAL_RECONCILIATION_UNKNOWN', file=__import__('sys').stderr)
        raise SystemExit(1)
