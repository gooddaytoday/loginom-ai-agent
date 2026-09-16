#!/usr/bin/env python3
"""Install one explicitly approved, prepared task configuration at an idle boundary."""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('node', type=int, choices=(11, 12, 13, 14))
parser.add_argument('--generation', default='20260913.3')
args = parser.parse_args()
rollout = root / f'.dock/shared-project-memory/rollout-{args.generation}'
manifest = json.loads((rollout / 'manifest.json').read_text())
assert manifest['generation'] == args.generation
assert manifest['disablement_method'] == 'project-plugin-disabled'
registry = json.loads((root / '.dock/node-streams-20260912/state.json').read_text())
task = next(x for x in manifest['tasks'] if x['node'] == args.node)
lane = next(x for x in registry['lanes'] if x['node'] == args.node)
assert lane['phase'].startswith('awaiting-'), 'A completed phase must be recorded first'
assert task['thread_id'] == lane['thread_id'] and task['cwd'] == lane['worktree']
target = Path(task['cwd']) / '.codex'
pending = Path(task['pending_directory'])
original = (target / 'config.toml').read_bytes()
assert hashlib.sha256(original).hexdigest() == task['source_config_sha256'], 'Source config drift'
assert not (target / 'hooks.json').exists(), 'Existing hooks need reconciliation'
updated = (pending / 'config.toml.pending').read_bytes()
assert hashlib.sha256(updated).hexdigest() == task['target_config_sha256'], 'Prepared config drift'
hooks = (rollout / 'hooks.json.pending').read_bytes()
assert (root / '.codex/hooks.json').read_bytes() == hooks, 'Canonical hooks must be installed and reviewed first'
trust = json.loads((rollout / 'hooks-trust-verified.json').read_text())
assert trust['generation'] == args.generation and trust['trusted_hooks'] == 5
backup = root / '.dock/shared-project-memory/activation' / args.generation / f'node{args.node}'
backup.mkdir(mode=0o700, parents=True, exist_ok=True)
def exclusive(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
exclusive(backup / 'config.toml.before', original)
temporary = target / 'config.toml.shared-memory.tmp'
exclusive(temporary, updated)
os.replace(temporary, target / 'config.toml')
receipt = {'node': args.node, 'threadId': task['thread_id'], 'cwd': task['cwd'],
           'checkedAt': datetime.now(timezone.utc).isoformat(),
           'configSha256': hashlib.sha256((target / 'config.toml').read_bytes()).hexdigest(),
           'hooksSha256': hashlib.sha256(hooks).hexdigest(), 'generation': args.generation,
           'trustVerified': True, 'runtimeReloadVerified': False, 'captureStateMoved': False}
exclusive(backup / 'configuration-installed.json', (json.dumps(receipt, indent=2) + '\n').encode())
print(json.dumps(receipt))
