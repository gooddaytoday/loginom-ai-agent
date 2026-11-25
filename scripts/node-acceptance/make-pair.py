#!/usr/bin/env python3
"""Build a run-check account pair from environment variables (B6.1-T7).

Writes worker.json and reviewer.json into a fresh 0700 directory and prints only
its path. Values come from `kit secret-exec`; they are never printed. Remove the
directory with `make-pair.py --remove DIR` after `run-check.py wait`.

Variables: LOGINOM_WORKER_USER, LOGINOM_WORKER_PASS, LOGINOM_REVIEWER_USER,
LOGINOM_REVIEWER_PASS; optional LOGINOM_URL (default https://app.loginom.ai).
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROLES = ('worker', 'reviewer')


def build(env=os.environ):
    missing = [f'LOGINOM_{role.upper()}_{field}' for role in ROLES for field in ('USER', 'PASS') if not env.get(f'LOGINOM_{role.upper()}_{field}')]
    if missing:
        raise SystemExit('make-pair: missing environment variables: ' + ', '.join(missing))
    directory = Path(tempfile.mkdtemp(prefix='loginom-pair-'))
    directory.chmod(0o700)
    for role in ROLES:
        user = env[f'LOGINOM_{role.upper()}_USER']
        document = dict(loginom=dict(url=env.get('LOGINOM_URL') or 'https://app.loginom.ai', username=user, password=env[f'LOGINOM_{role.upper()}_PASS']), package_directory='/' + user)
        descriptor = os.open(directory / (role + '.json'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as handle:
            json.dump(document, handle)
    return directory


def remove(directory):
    path = Path(directory)
    # Only a directory made by this script: exactly the two role files.
    if not path.is_dir() or sorted(p.name for p in path.iterdir()) != sorted(role + '.json' for role in ROLES):
        raise SystemExit('make-pair: refusing to remove a directory that is not a pair')
    shutil.rmtree(path)


if __name__ == '__main__':
    if sys.argv[1:2] == ['--remove'] and len(sys.argv) == 3:
        remove(sys.argv[2])
    elif len(sys.argv) == 1:
        print(build())
    else:
        raise SystemExit('usage: make-pair.py [--remove DIR]')
