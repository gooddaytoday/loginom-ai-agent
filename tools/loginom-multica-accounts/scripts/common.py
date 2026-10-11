"""Small filesystem/config boundary shared by the operator commands."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
from contextlib import contextmanager
from uuid import UUID, uuid4


def new_evidence_directory(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or any(p.is_symlink() for p in [path, *path.parents]):
        raise RuntimeError('PRIVATE_EVIDENCE_PATH_INVALID')
    path.mkdir(mode=0o700)  # A new attempt must never reuse an old directory.
    if path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise RuntimeError('PRIVATE_EVIDENCE_PERMISSIONS_INVALID')
    return path


def append_evidence(directory, event):
    path = Path(directory) / ('event-' + str(uuid4()) + '.json')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(event, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return path


def read_private(path):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink():
        raise RuntimeError('PRIVATE_CONFIG_PATH_INVALID')
    info = path.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('PRIVATE_CONFIG_PERMISSIONS_INVALID')
    return json.loads(path.read_text())


def write_private(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + '.tmp-' + str(os.getpid()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def checked_path(path, root):
    path, root = Path(path), Path(root).resolve()
    if not path.is_absolute() or '..' in path.parts or not path.is_relative_to(root):
        raise RuntimeError('PATH_OUTSIDE_WORKTREE')
    current = root
    for part in path.relative_to(root).parts:
        current = current / part
        if current.is_symlink():
            raise RuntimeError('LINKED_MANAGED_PATH')
    return path


def managed_root(worktree, config=None):
    worktree = Path(worktree)
    if not worktree.is_absolute() or worktree.resolve() != worktree:
        raise RuntimeError('WORKTREE_PATH_INVALID')
    actual = subprocess.check_output(['git', '-C', str(worktree), 'rev-parse', '--show-toplevel'], text=True).strip()
    if actual != str(worktree):
        raise RuntimeError('WORKTREE_IS_NOT_GIT_ROOT')
    owner = None
    for parent in [worktree, *worktree.parents]:
        marker = parent / '.managed_env.json'
        if marker.exists():
            if marker.is_symlink():
                raise RuntimeError('NATIVE_OWNER_LINKED')
            owner = json.loads(marker.read_text())
            break
    if not owner or owner.get('managed_by') != 'multica-daemon-managed-env':
        raise RuntimeError('NATIVE_OWNER_UNKNOWN')
    if any(not owner.get(key) for key in ['workspace_id', 'issue_id', 'agent_id']):
        raise RuntimeError('NATIVE_OWNER_INCOMPLETE')
    if config and any(owner.get(key) != config.get(key) for key in ['workspace_id', 'issue_id', 'agent_id']):
        raise RuntimeError('NATIVE_OWNER_MISMATCH')
    root = checked_path(worktree / '.multica-node', worktree)
    if root.exists():
        marker = root / 'owner.json'
        if not marker.is_file() or marker.is_symlink() or json.loads(marker.read_text()) != owner:
            raise RuntimeError('ARTIFACT_OWNER_UNKNOWN')
    else:
        root.mkdir(mode=0o700)
        write_private(root / 'owner.json', owner)
    return root, owner


def artifact_lock(root):
    path = checked_path(Path(root) / '.artifacts.lock', root)
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise RuntimeError('ARTIFACT_BUSY') from None
    os.set_inheritable(fd, True)
    return fd


def ops_identity():
    root = Path(__file__).resolve().parents[1]
    version = root / 'VERSION.json'
    if version.is_file():
        data = json.loads(version.read_text())
        for relative, expected in data['files'].items():
            if hashlib.sha256((root / relative).read_bytes()).hexdigest() != expected:
                raise RuntimeError('OPS_FILES_CHANGED')
        if data.get('schema') == 'loginom-lab53-source-version-v1':
            return {key: data[key] for key in ['version', 'scope_sha', 'status']}
        return {'commit': data['commit'], 'bundle_sha256': data['bundle_sha256']}
    commit = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    return {'commit': commit, 'development': True}


def verify_candidate(worktree, candidate):
    return subprocess.run(['bun', str(Path(worktree) / 'packages/loginom-host/script/verify-cli-candidate.ts'), str(candidate), str(worktree)], capture_output=True, text=True)


def private_snapshot(path):
    """Bind the bytes and inode read now, rather than an earlier config cache."""
    path = Path(path)
    data = read_private(path)
    before = path.stat()
    raw = path.read_bytes()
    after = path.stat()
    if (before.st_dev, before.st_ino, before.st_mtime_ns, before.st_size) != (
            after.st_dev, after.st_ino, after.st_mtime_ns, after.st_size):
        raise RuntimeError('PRIVATE_CONFIG_CHANGED')
    if json.loads(raw) != data:
        raise RuntimeError('PRIVATE_CONFIG_CHANGED')
    return {'path': str(path), 'device': after.st_dev, 'inode': after.st_ino,
            'sha256': hashlib.sha256(raw).hexdigest(), 'data': data}


def process_identity(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return {'pid': pid, 'start_ticks': fields[19], 'state': fields[0]}
    except FileNotFoundError:
        return None


def check_previous_processes(records):
    """Check exact per-account provenance; do not infer absence from task APIs.

    This is not a machine-wide PID census. Unrelated non-dumpable systemd/sshd
    processes are not owned account effects. History discovery and independent
    receipts remain required before admitting any future live adapter.
    """
    absent = []
    for record in records:
        if not isinstance(record, dict) or type(record.get('pid')) is not int or record['pid'] <= 0 or not str(
                record.get('start_ticks', '')).isdigit():
            raise RuntimeError('ACCOUNT_PROCESS_PROVENANCE_INVALID')
        try:
            current = process_identity(record['pid'])
        except (OSError, ValueError, IndexError):
            raise RuntimeError('ACCOUNT_PROCESS_CHECK_UNCONFIRMED') from None
        if current and current['state'] != 'Z' and current['start_ticks'] == str(record['start_ticks']):
            # Even an unlocked fd or a live process that has dropped its fd
            # must not be reused while its own previous writer is still alive.
            raise RuntimeError('ACCOUNT_WRITER_PRESENT')
        absent.append(record)
    return absent


def marker_paths(lock_path):
    """Both historical spellings share one permanent account lock."""
    lock_path = Path(lock_path)
    return [lock_path.with_suffix('.active.json'), Path(str(lock_path) + '.active.json')]


@contextmanager
def account_guard(username, expected_configs=(), lock_directory=None, previous_processes=()):
    if not isinstance(username, str) or not username or username in {'.', '..'} or any(
            not (character.isalnum() or character in '._-') for character in username):
        raise RuntimeError('ACCOUNT_LOCK_NAME_INVALID')
    directory = Path(lock_directory or Path.home() / '.local/state/loginom-multica/account-locks')
    if not directory.is_absolute() or any(p.is_symlink() for p in [directory, *directory.parents]):
        raise RuntimeError('ACCOUNT_LOCK_PATH_INVALID')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = directory.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('ACCOUNT_LOCK_PERMISSIONS_INVALID')
    path = directory / (username + '.lock')
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('ACCOUNT_LOCK_PERMISSIONS_INVALID')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('ACCOUNT_BUSY') from None
        if (path.stat().st_dev, path.stat().st_ino) != (info.st_dev, info.st_ino):
            raise RuntimeError('ACCOUNT_LOCK_REPLACED')
        current = [private_snapshot(item['path']) for item in expected_configs]
        for before, after in zip(expected_configs, current):
            if any(before[key] != after[key] for key in ['device', 'inode', 'sha256']):
                raise RuntimeError('ACCOUNT_CONFIG_CHANGED')
        # Always read under the acquired flock. Presence blocks even if a
        # marker claims completion: only its owner may reconcile and archive it.
        markers = []
        for marker in marker_paths(path):
            if marker.is_symlink():
                raise RuntimeError('ACCOUNT_MARKER_LINKED')
            if marker.exists():
                raw = marker.read_bytes()
                markers.append({'path': str(marker), 'sha256': hashlib.sha256(raw).hexdigest()})
        if markers:
            raise RuntimeError('ACCOUNT_EFFECT_UNRESOLVED')
        absent = check_previous_processes(previous_processes)
        os.set_inheritable(fd, True)
        yield {'fd': fd, 'path': str(path), 'device': info.st_dev, 'inode': info.st_ino,
               'configs': current, 'process': process_identity(os.getpid()), 'previous_processes_absent': absent}
    finally:
        # Never unlink a permanent flock; inherited children retain protection.
        os.close(fd)


def begin_account_effect(guard, issue, role, attempt, source_sha):
    """Canonical writer; unresolved markers survive failures and cancellation."""
    if role not in {'admin', 'worker', 'reviewer'} or len(source_sha) != 40 or any(
            character not in '0123456789abcdef' for character in source_sha):
        raise RuntimeError('ACCOUNT_EFFECT_OWNER_INVALID')
    info = os.fstat(guard['fd'])
    if (info.st_dev, info.st_ino) != (guard['device'], guard['inode']):
        raise RuntimeError('ACCOUNT_LOCK_REPLACED')
    current = Path(guard['path']).stat()
    if (current.st_dev, current.st_ino) != (guard['device'], guard['inode']):
        raise RuntimeError('ACCOUNT_LOCK_REPLACED')
    path = marker_paths(guard['path'])[0]
    if any(marker.exists() or marker.is_symlink() for marker in marker_paths(guard['path'])):
        raise RuntimeError('ACCOUNT_EFFECT_UNRESOLVED')
    payload = {'schema': 'loginom-account-effect-v1', 'issue_id': str(UUID(issue)),
               'attempt_id': str(UUID(attempt)), 'role': role, 'source_sha': source_sha,
               'state': 'UNKNOWN', 'writer': guard['process'],
               'previous_processes_absent': guard['previous_processes_absent'],
               'lock': {key: guard[key] for key in ['device', 'inode']},
               'configs': [{key: config[key] for key in ['path', 'device', 'inode', 'sha256']}
                           for config in guard['configs']]}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(json.dumps(payload, indent=2) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return path
