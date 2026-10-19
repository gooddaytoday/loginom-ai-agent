#!/usr/bin/env python3
"""Independent calculation from delivered input only; no generator/expected/network."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / 'data' / name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


raw = read('checks.csv')
assert len(raw) == 12 and len({r['Code'] for r in raw}) == len(raw)
# Successful GET /anything echoes args and method; no external state is inferred.
rows = [dict(Code=r['Code'], Route=r['Route'], Method='GET', HttpStatusCode=200) for r in raw]

columns = [('Code', 'string'), ('Route', 'string'), ('Method', 'string'), ('HttpStatusCode', 'integer')]
expected = {
    'package_path': sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/p13.lgp',
    'nodes': [{'type': kind} for kind in ['imports.text', 'integration.rest_request', 'exports.text']],
    'outputs': [{
        'output_node_type': 'export_input',
        'export_destination': '/stability-2026-10-20/checked-routes.csv',
        'ordered': False,
        'column_order': 'any',
        'columns': [{'name': name, 'type': kind, 'label_any': True,
                     **({'tolerance': {'abs': 1e-8, 'rel': 1e-10}} if kind == 'real' else {})}
                    for name, kind in columns],
        'rows': rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
