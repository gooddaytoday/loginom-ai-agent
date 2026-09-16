#!/usr/bin/env python3
"""Install memory configuration for one fresh permanent worktree, before creating its app task."""
import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import tomllib
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATION = '20260913.5'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(cwd, *args):
    return subprocess.check_output(['git', '-C', str(cwd), *args], text=True).strip()


def private(path, directory=False):
    stat = path.lstat()
    if path.is_symlink() or path.resolve() != path or stat.st_uid != os.getuid() or \
            (stat.st_mode & 0o777) != (0o700 if directory else 0o600):
        raise ValueError('Expected private owner-controlled path: ' + str(path))


def atomic(path, data):
    fd, name = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def prepare(cwd, branch, base, install=False):
    if cwd.is_symlink() or cwd.resolve(strict=True) != cwd or cwd.parent != ROOT / '.worktrees':
        raise ValueError('Use one exact permanent worktree directly below this project/.worktrees')
    if Path(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir')) != ROOT / '.git' or \
            git(cwd, 'rev-parse', '--show-toplevel') != str(cwd):
        raise ValueError('The folder is not a linked worktree of this repository')
    if git(cwd, 'branch', '--show-current') != branch or git(cwd, 'rev-parse', 'HEAD') != base:
        raise ValueError('Branch or fresh accepted base differs from the recorded preparation')
    legacy = json.loads((Path.home() / '.openviking/project-memory-routing.json').read_text())
    if any(str(cwd) in x['workspaces'] for x in legacy['projects']):
        raise ValueError('Existing legacy routes are immutable; this helper only prepares fresh workspaces')
    directory = Path.home() / '.openviking/project-memory-enrollments/loginom-dock'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    private(directory, True)
    record_path = directory / (sha(str(cwd).encode()) + '.json')
    runtime = ROOT / '.dock/shared-project-memory/runtime' / GENERATION
    rollout = ROOT / '.dock/shared-project-memory' / ('rollout-' + GENERATION)
    manifest = json.loads((rollout / 'manifest.json').read_text())
    for name, digest in manifest['runtime_files'].items():
        if (runtime / name).is_symlink() or sha((runtime / name).read_bytes()) != digest:
            raise ValueError('Prepared immutable runtime differs from its installation manifest')
    hooks = (ROOT / '.codex/hooks.json').read_bytes()
    if hooks != (rollout / 'hooks.json.pending').read_bytes():
        raise ValueError('Compatible enrollment hooks are not installed')
    config = cwd / '.codex/config.toml'
    if config.is_symlink() or config.parent.is_symlink():
        raise ValueError('Project config must not use symlinks')
    original = config.read_bytes() if config.exists() else b''
    if record_path.exists():
        private(record_path)
        record = json.loads(record_path.read_text())
        if record['cwd'] != str(cwd) or record['prepared']['configSha256'] != sha(original) or \
                record['prepared']['hooksSha256'] != sha(hooks):
            raise ValueError('Existing registration/configuration differs; preserve state and reconcile')
        return {'status': 'already-prepared', 'cwd': str(cwd), 'registrationId': record['registrationId'],
                'lifecycle': record['status'], 'state_reset': False}
    parsed = tomllib.loads(original.decode())
    if 'openviking' in parsed.get('mcp_servers', {}) or 'openviking-memory@openviking' in parsed.get('plugins', {}) or \
            'hooks' in parsed or (config.parent / 'hooks.json').exists():
        raise ValueError('Existing memory configuration requires reconciliation, not fresh enrollment')
    addition = '\n# Shared project memory: coordinator enrollment before development.\n'
    addition += '[mcp_servers.openviking]\ncommand = ' + json.dumps(manifest['node']) + '\n'
    addition += 'args = ' + json.dumps([str(runtime / 'server.mjs')]) + '\n'
    addition += 'enabled = true\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n'
    addition += '[plugins."openviking-memory@openviking"]\nenabled = false\n'
    updated = original + addition.encode()
    tomllib.loads(updated.decode())
    route_spec = dict(manifest['new_task_route'])
    route_spec['workspaces'] = [str(cwd)]
    # Use the same validator and stable single-workspace hash as the runtime.
    source = "import {validateProjectRouting} from " + json.dumps((runtime / 'project-routing.mjs').as_uri()) + ";let s='';for await(const b of process.stdin)s+=b;console.log(JSON.stringify(validateProjectRouting(JSON.parse(s)).projects[0]));"
    route = json.loads(subprocess.check_output([manifest['node'], '--input-type=module', '-e', source],
                        input=json.dumps({'version': 1, 'projects': [route_spec]}), text=True))
    record = {'version': 1, 'cwd': str(cwd), 'registrationId': str(uuid.uuid4()), 'routeSpec': route_spec,
              'routeHash': route['routeHash'], 'status': 'pending', 'threadId': None,
              'createdAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
              'prepared': {'configSha256': sha(updated), 'hooksSha256': sha(hooks), 'runtime': str(runtime),
                           'baseSha': base, 'branch': branch, 'originalConfigSha256': sha(original)}}
    if not install:
        return {'status': 'preview', 'cwd': str(cwd), 'config_changed': False, 'route_hash': route['routeHash']}
    # Reservation is installed before config: a crash never enables capture to
    # an unregistered own-worktree Peer. No app task may start until ready.
    with record_path.open('xb') as stream:
        os.chmod(record_path, 0o600)
        stream.write((json.dumps(record, indent=2) + '\n').encode())
    backup = directory / (record_path.stem + '.config-before')
    with backup.open('xb') as stream:
        os.chmod(backup, 0o600)
        stream.write(original)
    config.parent.mkdir(parents=True, exist_ok=True)
    atomic(config, updated)
    return {'status': 'prepared', 'cwd': str(cwd), 'registrationId': record['registrationId'],
            'routeHash': record['routeHash'], 'state_created': False, 'task_must_bootstrap': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cwd', type=Path, required=True)
    parser.add_argument('--branch', required=True)
    parser.add_argument('--base', required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prepare(args.cwd, args.branch, args.base, args.install), ensure_ascii=False))
