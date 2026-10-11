"""Small filesystem/config boundary shared by the operator commands."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess


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
        return {'commit': data['commit'], 'bundle_sha256': data['bundle_sha256']}
    commit = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    return {'commit': commit, 'development': True}


def verify_candidate(worktree, candidate):
    return subprocess.run(['bun', str(Path(worktree) / 'packages/loginom-host/script/verify-cli-candidate.ts'), str(candidate), str(worktree)], capture_output=True, text=True)
