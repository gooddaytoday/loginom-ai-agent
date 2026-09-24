"""Local deployment identity; never inferred from a migrated service directory."""
import json
import os
import re
import subprocess
from pathlib import Path

GENERATION = '20260924.1'
NAMESPACE = 'loginom-ai-agent'


def project_root(value=None):
    root = Path(value) if value is not None else Path(subprocess.check_output(
        ['git', '-C', str(Path(__file__).resolve().parent), 'rev-parse', '--show-toplevel'], text=True).strip())
    if not root.is_absolute() or root.is_symlink() or root.resolve(strict=True) != root:
        raise ValueError('Use the exact canonical Git root')
    actual = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--show-toplevel'], text=True).strip()
    common = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--path-format=absolute', '--git-common-dir'], text=True).strip()
    if actual != str(root) or Path(common) != root / '.git':
        raise ValueError('Use the main Git checkout, not a service directory or linked worktree')
    return root


def locations(root, generation=GENERATION):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,127}', generation):
        raise ValueError('Use an explicit generation without path separators')
    base = root / '.local/project-memory'
    return base / 'runtime' / generation, base / 'rollouts' / generation


def deployment(root, generation=GENERATION, home=None):
    locations(root, generation)
    home = Path.home() if home is None else Path(home)
    return {'version': 1, 'projectRoot': str(root), 'namespace': NAMESPACE, 'generation': generation,
            'enrollmentsDir': str(home / '.openviking/project-memory-enrollments' / NAMESPACE),
            'stateDir': str(home / '.openviking/project-states' / NAMESPACE)}


def read_manifest(root, generation=GENERATION):
    runtime, rollout = locations(root, generation)
    path = rollout / 'manifest.json'
    stat = path.lstat()
    if path.is_symlink() or path.resolve() != path or stat.st_uid != os.getuid() or stat.st_mode & 0o777 != 0o600:
        raise ValueError('Prepared manifest must be a private owner-controlled file')
    data = json.loads(path.read_text())
    if data['deployment'] != deployment(root, generation) or data['runtime'] != str(runtime):
        raise ValueError('Prepared deployment differs from this checkout/user; reconcile before use')
    return runtime, rollout, data
