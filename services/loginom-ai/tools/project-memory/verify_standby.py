#!/usr/bin/env python3
"""Check all five canonical hooks against existing coordinator/worker states.

Only valid before cutover. Verifies quiet standby without changing captured state.
"""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
generation = '20260913.3'
registry = json.loads((root / '.dock/node-streams-20260912/state.json').read_text())
tasks = [{'node': 'coordinator', 'thread_id': registry['coordinator_thread'], 'worktree': str(root)}] + registry['lanes']
state_dir = Path.home() / '.openviking/project-states/loginom-dock'
assert not list(state_dir.rglob('*.json')), 'Standby verification must precede every cutover'
results = []
for task in tasks:
    state = Path.home() / '.openviking/codex-plugin-state' / f"{task['thread_id']}.json"
    before = hashlib.sha256(state.read_bytes()).hexdigest()
    for event in ('SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact', 'SessionEnd'):
        answer = subprocess.run(['/Users/kartamyshev/.local/bin/node',
                                 str(root / f'.dock/shared-project-memory/runtime/{generation}/hook-router.mjs'), event],
                                cwd=task['worktree'], input=json.dumps({'session_id': task['thread_id'],
                                'cwd': task['worktree'], 'source': 'resume', 'trigger': 'manual'}),
                                text=True, capture_output=True, timeout=10)
        assert answer.returncode == 0 and not answer.stdout and not answer.stderr, (task['node'], event, answer.returncode)
    results.append({'node': task['node'], 'eventsPassed': 5,
                    'legacyStateUnchanged': before == hashlib.sha256(state.read_bytes()).hexdigest()})
assert all(x['legacyStateUnchanged'] for x in results), 'A concurrent writer changed legacy state; reconcile before claiming verification'
assert not list(state_dir.rglob('*.json'))
receipt = {'generation': generation, 'standbyEventsPassed': 25, 'sharedStateCreated': False, 'results': results}
output = root / f'.dock/shared-project-memory/rollout-{generation}/standby-live-verified.json'
output.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
