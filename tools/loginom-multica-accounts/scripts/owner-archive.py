"""Exact owner archival, reachable only after complete fresh operation proof.

This route supports canonical own effects. Unbound historical legacy schemas
fail closed; it never repairs or reclassifies their missing provenance.
"""
import hashlib
import json
import os
import datetime
from pathlib import Path
from common import process_identity, marker_paths, private_snapshot, read_private


def validate_archive_proof(operation, verification_file, proof_file):
    verification = read_private(verification_file); proof = read_private(proof_file)
    request = read_private(verification['requestFile']); response = read_private(verification['responseFile'])
    digest = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
    expected = verification['expected']
    if proof.get('input_sha256') != digest(verification_file) or proof.get('request_sha256') != digest(verification['requestFile']) or (
            proof.get('response_sha256') != digest(verification['responseFile']) or proof.get('expected') != expected):
        raise RuntimeError('ARCHIVE_FINAL_PROOF_CHANGED')
    consumed = read_private(Path(verification['directory']) / ('parent-consumed-' + request['nonce'] + '.json'))
    js_digest = hashlib.sha256(json.dumps(request, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    if consumed.get('request_sha256') != js_digest or consumed.get('response_sha256') != digest(verification['responseFile']):
        raise RuntimeError('ARCHIVE_FINAL_PROOF_UNKNOWN')
    if request.get('operation_id') != operation['operation_id'] or request.get('issue_id') != operation['issue_id'] or (
            request.get('source') != operation['source'] or request.get('expected_observer') != operation['expected_observer']):
        raise RuntimeError('ARCHIVE_FINAL_PROOF_UNKNOWN')
    if proof.get('readback') != response.get('readback') or request.get('phase') != 'post-cleanup' or (
            response.get('nonce') != request['nonce'] or response.get('request_sha256') != js_digest):
        raise RuntimeError('ARCHIVE_FINAL_PROOF_UNKNOWN')
    # Require the exact consumed strict proof plus fresh bytes/PIDs/configs now.
    for item in request['configs']:
        current = private_snapshot(item['path'])
        if any(current[key] != item[key] for key in ['device', 'inode', 'sha256']): raise RuntimeError('ARCHIVE_CONFIG_CHANGED')
    for file_key, hash_key in [('cleanup_file', 'cleanup_sha256'), ('logout_file', 'logout_sha256')]:
        if digest(request[file_key]) != request[hash_key]: raise RuntimeError('ARCHIVE_FINAL_PROOF_CHANGED')
    for record in read_private(request['cleanup_file'])['processes']:
        current = process_identity(record['pid'])
        if current and current['start_ticks'] == record['start_ticks'] and current['state'] not in {'Z', 'X'}:
            raise RuntimeError('ARCHIVE_WRITER_PRESENT')
    readback = proof['readback']; observer = readback.get('observer', {}); rows = readback.get('rows', [])
    if any(observer.get(key) != value for key, value in operation['expected_observer'].items() if key != 'stand') or (
            readback.get('stand') != operation['stand'] or readback.get('source') != 'existing-authorized-admin'):
        raise RuntimeError('ARCHIVE_OBSERVER_CHANGED')
    if not all(readback.get(key) is True for key in ['loaded', 'refresh_complete', 'packages_complete']) or (
            readback.get('manager_count') != len(rows) or readback.get('store_count') != len(rows)):
        raise RuntimeError('ARCHIVE_FINAL_PROOF_UNKNOWN')
    parse = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
    observed = parse(readback['refreshed_at'])
    age = (datetime.datetime.now(datetime.timezone.utc) - observed).total_seconds()
    if observed < parse(request['after']) or age < 0 or age > 300: raise RuntimeError('ARCHIVE_FINAL_PROOF_STALE')
    for effect in request['effects']:
        if effect['guid_hash'] == observer['guid_hash'] or any(row.get('guid_hash') == effect['guid_hash'] or (
                row['session_id'] == effect['session_id'] and row['create_time'] == effect['create_time']) for row in rows):
            raise RuntimeError('ARCHIVE_OWN_EFFECT_PRESENT')
    return proof


def archive_owned(guard, expected_markers, configs, operation, verification_file, proof_file, previous, history):
    # The current writer may hold its own guard during finalization; every other
    # exact writer/descendant must be absent. Caller holds this permanent OFD.
    fd = os.fstat(guard['fd']); path = Path(guard['path']).lstat()
    kernel = Path(f'/proc/self/fdinfo/{guard["fd"]}').read_text()
    if (fd.st_dev, fd.st_ino) != (guard['device'], guard['inode']) or (path.st_dev, path.st_ino) != (fd.st_dev, fd.st_ino):
        raise RuntimeError('ARCHIVE_FLOCK_UNCONFIRMED')
    if not any('FLOCK  ADVISORY  WRITE' in line and f':{fd.st_ino} ' in line for line in kernel.splitlines()):
        raise RuntimeError('ARCHIVE_FLOCK_UNCONFIRMED')
    for item in previous:
        current = process_identity(item['pid'])
        if current and current['start_ticks'] == item['start_ticks'] and current['state'] not in {'Z', 'X'}:
            raise RuntimeError('ARCHIVE_WRITER_PRESENT')
    for snapshot in configs:
        now = private_snapshot(snapshot['path'])
        if any(now[key] != snapshot[key] for key in ['device', 'inode', 'sha256']): raise RuntimeError('ARCHIVE_CONFIG_CHANGED')
    proof = validate_archive_proof(operation, verification_file, proof_file)
    request = read_private(read_private(verification_file)['requestFile'])
    after = datetime.datetime.fromisoformat(request['after'].replace('Z', '+00:00')).timestamp()
    # Final proof is generated by the fixed strict validator, including exact
    # expected observer/effect absence. A supplied ready/PASS flag cannot admit it.
    present = [p for p in marker_paths(guard['path']) if p.exists() or p.is_symlink()]
    if set(map(str, present)) != {item['path'] for item in expected_markers}: raise RuntimeError('ARCHIVE_MARKER_CHANGED')
    checked = []
    for item in expected_markers:
        p = Path(item['path']); info = p.lstat(); raw = p.read_bytes(); marker = json.loads(raw)
        if p.is_symlink() or info.st_uid != os.getuid() or info.st_mode & 0o077 or (
                info.st_dev, info.st_ino, hashlib.sha256(raw).hexdigest()) != (item['device'], item['inode'], item['sha256']):
            raise RuntimeError('ARCHIVE_MARKER_CHANGED')
        if marker.get('schema') != 'loginom-account-effect-v1' or marker.get('state') != 'UNKNOWN' or (
                marker.get('issue_id'), marker.get('attempt_id'), marker.get('source_sha')) != (
                operation['issue_id'], operation['operation_id'], operation['source']['sha']):
            raise RuntimeError('ARCHIVE_OWNER_NOT_ESTABLISHED')
        if marker.get('writer') != guard['process'] or marker.get('lock') != {'device': guard['device'], 'inode': guard['inode']}:
            raise RuntimeError('ARCHIVE_OWNER_NOT_ESTABLISHED')
        if max(info.st_mtime, info.st_ctime) > after:
            raise RuntimeError('ARCHIVE_FINAL_PROOF_STALE')
        checked.append((p, info, raw))
    history = Path(history)
    if not history.is_absolute() or any(p.is_symlink() for p in [history, *history.parents]): raise RuntimeError('ARCHIVE_PATH_INVALID')
    history.mkdir(mode=0o700)
    if history.stat().st_uid != os.getuid() or history.stat().st_mode & 0o077: raise RuntimeError('ARCHIVE_PATH_INVALID')
    archived = []
    for p, info, raw in checked:
        # Hardlink preserves original bytes/inode. Never overwrite any history.
        destination = history / (p.name + '-' + operation['operation_id'])
        os.link(p, destination, follow_symlinks=False)
        current = p.lstat()
        if (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino) or p.read_bytes() != raw:
            raise RuntimeError('ARCHIVE_MARKER_CHANGED')
        p.unlink()
        archived.append({'path': str(destination), 'sha256': hashlib.sha256(raw).hexdigest()})
    for directory in [history, Path(guard['path']).parent]:
        handle = os.open(directory, os.O_RDONLY)
        try: os.fsync(handle)
        finally: os.close(handle)
    return archived
