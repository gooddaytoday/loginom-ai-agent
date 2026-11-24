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

rows = [dict(Id=int(r['Id']), Qty=int(r['Qty']), Price=float(r['Price']), Gross=int(r['Qty'])*float(r['Price']), Net=int(r['Qty'])*float(r['Price'])*0.9) for r in read('orders.csv')]
expected = dict(nodes=[dict(type=t) for t in ['imports.text', 'programming.javascript', 'exports.text']], outputs=[])

if [('Id', 'integer'), ('Qty', 'integer'), ('Price', 'real'), ('Gross', 'real'), ('Net', 'real')]:
    expected['outputs'] = [dict(output_node_type='export_input',
        export_destination='result.csv', ordered=True,
        columns=[dict(name=n, type=t, label_any=True) for n,t in [('Id', 'integer'), ('Qty', 'integer'), ('Price', 'real'), ('Gross', 'real'), ('Net', 'real')]], rows=rows)]
text = json.dumps(expected, ensure_ascii=False, indent=2) + '\n'
if '--check' in sys.argv:
    assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'oracle drift'
else:
    (HERE / 'expected.json').write_text(text, encoding='utf-8')
