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

rows = []
for r in read('dirty.csv'):
    sku = re.search(r'SKU\s*[:=]\s*([A-Z]+-\d+)', r['Raw'])
    qty = re.search(r'qty\s*[:=]\s*(\d+)', r['Raw'])
    rows.append(dict(Id=int(r['Id']), SKU=sku.group(1) if sku else None, Qty=int(qty.group(1)) if qty else None))
expected = dict(nodes=[dict(type=t) for t in ['imports.text', 'programming.python', 'exports.text']], outputs=[])

if [('Id', 'integer'), ('SKU', 'string'), ('Qty', 'integer')]:
    expected['outputs'] = [dict(output_node_type='export_input',
        export_destination='result.csv', ordered=True,
        columns=[dict(name=n, type=t, label_any=True) for n,t in [('Id', 'integer'), ('SKU', 'string'), ('Qty', 'integer')]], rows=rows)]
text = json.dumps(expected, ensure_ascii=False, indent=2) + '\n'
if '--check' in sys.argv:
    assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'oracle drift'
else:
    (HERE / 'expected.json').write_text(text, encoding='utf-8')
