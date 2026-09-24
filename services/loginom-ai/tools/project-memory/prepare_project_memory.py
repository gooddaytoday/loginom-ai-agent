#!/usr/bin/env python3
"""Prepare five project hooks; --install explicitly installs this new project only."""
import argparse
import hashlib
import json
import os
import shlex
import subprocess
import tempfile
from pathlib import Path
from project_context import GENERATION, deployment, locations, project_root

EVENTS = {'SessionStart': ('clear|startup|resume', 70), 'UserPromptSubmit': ('*', 130),
          'Stop': ('*', 30), 'PreCompact': ('*', 60), 'SessionEnd': ('*', 3)}


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    stat = path.lstat()
    if path.is_symlink() or path.resolve() != path or stat.st_uid != os.getuid() or stat.st_mode & 0o777 != 0o700:
        raise ValueError('Expected private owner-controlled directory: ' + str(path))


def save_prepared(path, data):
    if path.exists():
        stat = path.lstat()
        if path.is_symlink() or path.resolve() != path or stat.st_uid != os.getuid() or stat.st_mode & 0o777 != 0o600 or path.read_bytes() != data:
            raise ValueError('Prepared files changed; use a fresh generation, never overwrite active evidence')
        return
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)


def prepare(root, node, plugin, generation=GENERATION, install=False):
    root = project_root(root)
    runtime, rollout = locations(root, generation)
    identity = deployment(root, generation)
    if json.loads((runtime / 'deployment.json').read_text()) != identity:
        raise ValueError('Assembled runtime belongs to another deployment')
    for directory in (runtime, node.parent, plugin):
        if directory.resolve(strict=True) != directory:
            raise ValueError('Use canonical runtime, Node and official plugin paths')
    if node.resolve(strict=True) != node or not node.is_file():
        raise ValueError('Use the actual Node executable, not a symlink')
    source = 'import {computeOfficialPluginPin} from ' + json.dumps((runtime / 'project-routing.mjs').as_uri()) + ';console.log(JSON.stringify(computeOfficialPluginPin(' + json.dumps(str(plugin)) + ')));'
    plugin_pin = json.loads(subprocess.check_output([str(node), '--input-type=module', '-e', source], text=True))
    runtime_files = {str(p.relative_to(runtime)): hashlib.sha256(p.read_bytes()).hexdigest()
                     for p in runtime.rglob('*') if p.is_file()}
    if not {'server.mjs', 'hook-router.mjs', 'deployment.mjs', 'deployment.json'} <= runtime_files.keys():
        raise ValueError('Assemble the reviewed runtime first')
    hooks = {'description': 'Loginom AI Agent shared memory; registered worktrees only', 'hooks': {}}
    for event, (matcher, timeout) in EVENTS.items():
        command = shlex.join([str(node), str(runtime / 'hook-router.mjs'), event, '--enrollments-only'])
        hooks['hooks'][event] = [{'matcher': matcher, 'hooks': [{'type': 'command', 'command': command, 'timeout': timeout}]}]
    content = (json.dumps(hooks, indent=2) + '\n').encode()
    target = root / '.codex/hooks.json'
    manifest = {'generation': generation, 'deployment': identity, 'runtime': str(runtime), 'node': str(node),
                'canonical_hooks_path': str(target), 'runtime_files': runtime_files, 'tasks': [],
                'official_plugin_pin': plugin_pin,
                'hooks_sha256': hashlib.sha256(content).hexdigest(), 'expected_hook_count': 5,
                'new_task_route': {'projectRoot': str(root), 'stateDir': identity['stateDir'],
                                   'pluginRoot': str(plugin), 'generation': generation}}
    private_directory(rollout)
    save_prepared(rollout / 'hooks.json.pending', content)
    save_prepared(rollout / 'manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())
    if target.is_symlink() or target.parent.is_symlink():
        raise ValueError('Project hook path must not use symlinks')
    if target.exists() and target.read_bytes() != content:
        raise ValueError('Existing project hooks need reconciliation; no files replaced')
    if install:
        for name in ('stateDir', 'enrollmentsDir'):
            private_directory(Path(identity[name]))
        target.parent.mkdir(exist_ok=True)
        if not target.exists():
            fd, temporary = tempfile.mkstemp(prefix='memory-hooks-', dir=target.parent)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(content)
                os.replace(temporary, target)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
    return {'status': 'installed' if install else 'preview', 'projectRoot': str(root), 'runtime': str(runtime),
            'rollout': str(rollout), 'main_plugin_unchanged': True, 'legacy_routes_unchanged': True,
            'trusted': False, 'capture_verified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', type=Path)
    parser.add_argument('--generation', default=GENERATION)
    parser.add_argument('--node', type=Path, required=True)
    parser.add_argument('--plugin', type=Path, required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prepare(args.project_root, args.node, args.plugin, args.generation, args.install)))
