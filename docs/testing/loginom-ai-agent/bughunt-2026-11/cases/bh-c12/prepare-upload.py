#!/usr/bin/env python3
"""Adapt this case to run-check's existing --case-root upload_only contract."""
import argparse
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()
source = Path(__file__).resolve().parent
target = args.out.resolve() / source.name
target.mkdir(parents=True, exist_ok=True)
(target / 'data').mkdir(exist_ok=True)
for name in ('task.md', 'expected.json'):
    shutil.copyfile(source / name, target / name)
shutil.copyfile(source / 'data/upload.csv', target / 'data/upload.csv')
(target / 'case.json').write_text(json.dumps({
    'source_path': str(target / 'data/upload.csv'),
    'attachment': 'file',
    'upload_only': True,
}, indent=2) + '\n', encoding='utf-8')
print(args.out.resolve())
