#!/usr/bin/env python3
"""Assemble the reviewed local memory adapter without touching active settings."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from project_context import GENERATION, deployment, locations, project_root


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assemble(source, output, definition, identity):
    if output.is_symlink():
        raise ValueError('Runtime output must not be a symlink')
    output = output.resolve()
    manifest = json.loads((definition / 'upstream-manifest.json').read_text())
    source = source.resolve(strict=True)
    for name, expected in manifest['files'].items():
        path = source / name
        if path.is_symlink() or digest(path) != expected:
            raise ValueError('Original adapter changed; reconcile before assembly: ' + name)
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='memory-assembly-', dir=output.parent) as temporary:
        stage = Path(temporary)
        for name in manifest['files']:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / name, target)
        patch = subprocess.run(['patch', '--batch', '-p1', '-i', str((definition / 'adapter.patch').resolve())],
                               cwd=stage, capture_output=True, text=True)
        if patch.returncode:
            raise RuntimeError('Reviewed adapter patch did not apply; active files unchanged')
        for path in (definition / 'overlay').rglob('*'):
            if path.is_file():
                target = stage / path.relative_to(definition / 'overlay')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
        (stage / 'deployment.json').write_text(json.dumps(identity, indent=2) + '\n')
        (stage / 'deployment.json').chmod(0o600)
        expected = {str(path.relative_to(stage)): digest(path) for path in stage.rglob('*') if path.is_file()}
        if output.exists():
            actual = {str(path.relative_to(output)): digest(path) for path in output.rglob('*') if path.is_file()}
            if actual != expected:
                raise ValueError('Existing runtime differs; refusing to overwrite it')
        else:
            shutil.copytree(stage, output)
    print(json.dumps({'runtime': str(output.resolve()), 'files_verified': len(expected),
                      'active_settings_changed': False}, ensure_ascii=False))


if __name__ == '__main__':
    definition = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/Users/kartamyshev/Git/openviking/integrations/codex-mcp-adapter'))
    parser.add_argument('--project-root', type=Path)
    parser.add_argument('--generation', default=GENERATION)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    root = project_root(args.project_root)
    assemble(args.source, args.output or locations(root, args.generation)[0], definition, deployment(root, args.generation))
