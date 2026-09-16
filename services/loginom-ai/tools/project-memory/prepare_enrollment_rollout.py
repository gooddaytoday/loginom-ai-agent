#!/usr/bin/env python3
"""Prepare a compatible hook upgrade; --install changes only root project hook definitions."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATION = '20260913.5'
sha = lambda value: hashlib.sha256(value).hexdigest()


def prepare(install=False):
    old = ROOT / '.dock/shared-project-memory/rollout-20260913.3'
    rollout = ROOT / '.dock/shared-project-memory' / ('rollout-' + GENERATION)
    runtime = ROOT / '.dock/shared-project-memory/runtime' / GENERATION
    original = (old / 'hooks.json.pending').read_bytes()
    old_manifest = json.loads((old / 'manifest.json').read_text())
    definitions = json.loads(original)
    for event, groups in definitions['hooks'].items():
        command = groups[0]['hooks'][0]['command']
        if old_manifest['runtime'] not in command:
            raise ValueError('Unknown prior hook command; active files unchanged')
        # Preserve original definitions/indexes/hashes for loaded tasks.
        extra = json.loads(json.dumps(groups[0]))
        extra['hooks'][0]['command'] = command.replace(old_manifest['runtime'], str(runtime)) + ' --enrollments-only'
        groups.append(extra)
    updated = (json.dumps(definitions, indent=2) + '\n').encode()
    active = ROOT / '.codex/hooks.json'
    prior_enrollment = ROOT / '.dock/shared-project-memory/rollout-20260913.4/hooks.json.pending'
    permitted = [original, updated] + ([prior_enrollment.read_bytes()] if prior_enrollment.exists() else [])
    if active.read_bytes() not in permitted:
        raise ValueError('Active hook definitions changed; reconcile before upgrade')
    runtime_files = {str(p.relative_to(runtime)):sha(p.read_bytes()) for p in runtime.rglob('*') if p.is_file()}
    if not all(name in runtime_files for name in ['server.mjs','enrollment-routing.mjs','enrollment-management.mjs','hook-router.mjs']):
        raise ValueError('Assemble and test the new runtime before preparing installation')
    legacy_file = Path.home() / '.openviking/project-memory-routing.json'
    legacy = legacy_file.read_bytes()
    matches = [p for p in json.loads(legacy)['projects'] if p['projectRoot'] == str(ROOT)]
    if len(matches) != 1:
        raise ValueError('Expected exactly the unchanged Loginom Dock legacy project')
    prior = matches[0]
    new_route = {k:v for k,v in prior.items() if k != 'workspaces'}
    new_route['generation'] = GENERATION
    manifest = {'generation':GENERATION,'runtime':str(runtime),'node':old_manifest['node'],
                'canonical_hooks_path':str(active),'tasks':old_manifest['tasks'],
                'new_task_route':new_route,'runtime_files':runtime_files,
                'legacy_registry_sha256':sha(legacy),'previous_hooks_sha256':sha(original),
                'hooks_sha256':sha(updated),'existing_mcp_runtime_unchanged':'20260913.3'}
    rollout.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name, data in [('hooks.json.pending',updated),('manifest.json',(json.dumps(manifest,indent=2)+'\n').encode())]:
        target=rollout/name
        if target.exists() and target.read_bytes()!=data:
            raise ValueError('Prepared rollout differs; use a new generation instead of overwriting')
        if not target.exists():
            with target.open('xb') as stream:
                os.chmod(target,0o600);stream.write(data)
    if install and active.read_bytes()!=updated:
        with (rollout/'hooks-before.json').open('xb') as stream:
            os.chmod(stream.name,0o600);stream.write(active.read_bytes())
        fd, temp = tempfile.mkstemp(dir=active.parent,prefix='memory-hooks-',suffix='.tmp')
        try:
            with os.fdopen(fd,'wb') as stream:stream.write(updated)
            os.replace(temp,active)
        finally:
            if os.path.exists(temp):os.unlink(temp)
    if legacy_file.read_bytes()!=legacy:
        raise ValueError('Legacy registry changed during installation; reconcile immediately')
    return {'generation':GENERATION,'installed':active.read_bytes()==updated,'legacy_registry_unchanged':True,
            'worker_configs_changed':False,'capture_cursors_changed':False,'trust_required':True,
            'rollout':str(rollout)}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--install',action='store_true')
    print(json.dumps(prepare(parser.parse_args().install)))
