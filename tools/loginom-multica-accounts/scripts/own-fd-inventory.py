#!/usr/bin/env python3
"""Read-only full FD census for the existing privileged parent SSH handoff.

Print private JSON only. A denied/racing proc is UNKNOWN, never an empty census.
No Loginom, signal, permission/profile change, lock or marker mutation.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import sys


def identity(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return {'pid': pid, 'start_ticks': fields[19], 'state': fields[0]}
    except FileNotFoundError: return None


def snapshot(request):
    targets = request['targets']; expected = {(x['device'], x['inode']): x['path'] for x in targets}
    before = identity(request['guardian']['pid'])
    if not before or before['start_ticks'] != request['guardian']['start_ticks']: raise RuntimeError('HISTORICAL_GUARDIAN_CHANGED')
    control_fd = os.open(targets[0]['path'], os.O_RDONLY | os.O_NOFOLLOW)
    try:
        control_stat = os.fstat(control_fd)
        control = {**identity(os.getpid()), 'fd': control_fd, 'device': control_stat.st_dev, 'inode': control_stat.st_ino}
        holders, errors, pids = [], [], sorted(int(p.name) for p in Path('/proc').iterdir() if p.name.isdigit())
        for pid in pids:
            try:
                for path in Path(f'/proc/{pid}/fd').iterdir():
                    info = path.stat()
                    if (info.st_dev, info.st_ino) in expected:
                        holders.append({'pid': pid, 'fd': int(path.name), 'device': info.st_dev, 'inode': info.st_ino})
            except (PermissionError, FileNotFoundError, OSError) as error: errors.append({'pid': pid, 'error': type(error).__name__})
        control_seen = {k: control[k] for k in ['pid', 'fd', 'device', 'inode']} in holders
        if not control_seen: raise RuntimeError('HISTORICAL_FD_CONTROL_UNKNOWN')
    finally: os.close(control_fd)
    states = []
    for item in targets:
        p = Path(item['path']); info = p.lstat()
        if p.is_symlink(): raise RuntimeError('HISTORICAL_TARGET_CHANGED')
        states.append({'path': str(p), 'device': info.st_dev, 'inode': info.st_ino, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    return {'visible_pids': pids, 'holders': holders, 'errors': errors, 'targets': states,
        'guardian': identity(request['guardian']['pid']),
        'guardian_fdinfo': Path(f'/proc/{request["guardian"]["pid"]}/fdinfo/{request["guard"]["fd"]}').read_text(),
        'kernel_locks': Path('/proc/locks').read_text(), 'control': control, 'control_observed': control_seen}


def collect(request):
    before, after = snapshot(request), snapshot(request)
    return {'schema': 'lab53-held-fd-inventory-v1', 'operation_id': request['operation_id'], 'nonce': request['nonce'],
        'request_sha256': hashlib.sha256(json.dumps(request, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest(),
        'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'before': before, 'after': after}


if __name__ == '__main__':
    try: print(json.dumps(collect(json.loads(Path(sys.argv[1]).read_text())), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'status': 'UNKNOWN', 'code': str(error) if isinstance(error, RuntimeError) else type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
