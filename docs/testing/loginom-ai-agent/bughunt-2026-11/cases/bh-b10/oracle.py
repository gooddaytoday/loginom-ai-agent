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

source = sorted(read('readings.csv'), key=lambda r:(r['Group'],int(r['Seq'])))
rows = []
previous = {}
for r in source:
    group, value = r['Group'], float(r['Value'])
    rows.append(dict(Group=group, Seq=int(r['Seq']), Value=value, Mean2=statistics.mean([previous[group],value]) if group in previous else value))
    previous[group] = value
expected = dict(nodes=[dict(type=t) for t in ['imports.text', 'programming.python', 'exports.text']], outputs=[])

if [('Group', 'string'), ('Seq', 'integer'), ('Value', 'real'), ('Mean2', 'real')]:
    expected['outputs'] = [dict(output_node_type='export_input',
        export_destination='result.csv', ordered=True,
        columns=[dict(name=n, type=t, label_any=True) for n,t in [('Group', 'string'), ('Seq', 'integer'), ('Value', 'real'), ('Mean2', 'real')]], rows=rows)]
text = json.dumps(expected, ensure_ascii=False, indent=2) + '\n'
if '--check' in sys.argv:
    assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'oracle drift'
else:
    (HERE / 'expected.json').write_text(text, encoding='utf-8')
