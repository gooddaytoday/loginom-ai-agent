#!/usr/bin/env python3
"""Independent expectation, computed from inputs before any model run."""
import csv
import datetime
import json
import re
import statistics
import sys
from http import HTTPStatus
from pathlib import Path

HERE = Path(__file__).resolve().parent

def read(name):
    with (HERE / 'data' / name).open(encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))

rows = json.loads((HERE/'data'/'response.json').read_text(encoding='utf-8'))['items']
expected = dict(nodes=[dict(type=t) for t in ['integration.rest_request', 'exports.text']], outputs=[])

if [('Code', 'string'), ('Amount', 'real'), ('Active', 'boolean')]:
    expected['outputs'] = [dict(output_node_type='export_input',
        export_destination='result.csv', ordered=True,
        columns=[dict(name=n, type=t, label_any=True) for n,t in [('Code', 'string'), ('Amount', 'real'), ('Active', 'boolean')]], rows=rows)]
text = json.dumps(expected, ensure_ascii=False, indent=2) + '\n'
if '--check' in sys.argv:
    assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'oracle drift'
else:
    (HERE / 'expected.json').write_text(text, encoding='utf-8')
