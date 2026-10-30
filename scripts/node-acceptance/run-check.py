#!/usr/bin/env python3
"""Quiet, detached live acceptance runner. Python 3 standard library only."""
import argparse
import csv
from datetime import datetime
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'docs/testing/loginom-ai-agent'
SCENARIOS = {
    'C1': dict(model_timeout=2700),
    '5-REST': dict(model_timeout=2700),
}
D87 = {
    'upload_only': dict(attachment='path', generator=['--min-bytes', '67108864'], heavy=False, upload_only=True),
    'E1': dict(attachment='path', generator=['--min-bytes', '1000000000'], heavy=False),
    'E2': dict(attachment='file', generator=['--min-bytes', '1000000000'], heavy=False),
    'E3': dict(attachment='path', generator=['--boundary', '32'], heavy=True),
    'X1': dict(attachment='path', generator=['--format', 'xlsx', '--rows', '500000'], heavy=True,
               pending='ожидает LAB-413: XLSX-переключение'),
}


def pair_login(config, source):
    directory = config.get('package_directory') or config.get('personal_folder')
    login = config.get('loginom', config)
    if not isinstance(directory, str) or not directory.startswith('/') or not isinstance(login, dict) or not login.get('username'):
        raise ValueError(f'{source}: expected loginom.username and package_directory or personal_folder; keys: ' + ', '.join(sorted(config)))
    return dict(login, package_directory=directory)


def scenario_names(value, case_root=None):
    names = [case for name in value.split(',') for case in (['E1', 'E2'] if name == 'D87' and not case_root else [name])]
    if len(names) != len(set(names)): raise ValueError('Duplicate scenario')
    for name in names:
        if not case_root and D87.get(name, {}).get('pending'): raise ValueError(D87[name]['pending'])
    return names


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def git(*args, cwd=REPO):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def scenario(name, case_root=None, *, cases=None):
    # Operator fixtures (including private large-file oracles) stay outside Git.
    # They use this runner's unchanged model/CSV/Save/cold/cleanup checks.
    if cases and (name in SCENARIOS or re.fullmatch(r'[A-Za-z][A-Za-z0-9-]{0,79}', name)):
        src = Path(cases).resolve() / name
        if (src / 'task.md').is_file():
            assert src.resolve().parent == Path(cases).resolve(), 'Case must stay in its assigned directory'
            return dict(SCENARIOS.get(name, {}), source=src, prompt=src / 'task.md', data=src / 'data', base=None, external=True)
    if case_root is not None:
        if name not in SCENARIOS and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}', name):
            raise ValueError('Invalid external case name')
        src = Path(case_root).resolve() / name
        config = read(src / 'case.json')
        if set(config) - {'source_path', 'attachment', 'upload_only'} or not {'source_path', 'attachment'} <= set(config) or config['attachment'] not in ['path', 'file'] or type(config.get('upload_only', False)) is not bool:
            raise ValueError('External case requires source_path and attachment path/file')
        source = Path(config['source_path'])
        if not source.is_absolute() or not source.is_file():
            raise ValueError('External source must be an existing absolute file')
        return dict(SCENARIOS.get(name, {}), source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    local_file=source, attachment=config['attachment'], upload_only=config.get('upload_only', False))
    if name in ['corr-pairs', 'corr-null', 'corr-age']:
        src = REPO / 'docs/node-development/nodes/research-corranalysis/acceptance'
        task, expected, data = {'corr-pairs': ('task.md', 'expected.json', 'pairs.csv'),
                                'corr-null': ('task-null.md', 'expected-null.json', 'null.csv'),
                                'corr-age': ('age-pressure-task.md', 'expected-age-pressure.json', 'age-pressure.csv')}[name]
        return dict(source=src, prompt=src / task, data=src / 'data', base=None,
                    expected_name=expected, input_files=[data])
    if name in D87:
        return dict(D87[name], base=None, generated=True)
    if name == 'logreg-enter':
        src = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['regex-add', 'regex-replace']:
        node = REPO / 'docs/node-development/nodes/replacement'
        return dict(source=node / 'acceptance/regex',
                    prompt=node / 'acceptance' / ('task-regex.md' if name == 'regex-add' else 'task-regex-replace.md'),
                    data=node / 'fixtures/regex', base=None,
                    expected_name='expected.json' if name == 'regex-add' else 'expected-replace.json')
