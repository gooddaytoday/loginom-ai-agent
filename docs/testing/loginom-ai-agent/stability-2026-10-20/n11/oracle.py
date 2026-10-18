#!/usr/bin/env python3
"""Fixed httpbin GET echo contract plus CSV; deliberately no network access."""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
with (ROOT / 'data/requests.csv').open(encoding='utf-8', newline='') as source:
    reader = csv.DictReader(source)
    assert reader.fieldnames == ['RequestId', 'Key']
    requests = list(reader)
assert len(requests) == 12 and len({r['RequestId'] for r in requests}) == 12
assert all(r['RequestId'] and r['Key'] for r in requests)
# The requested GET /anything echoes query parameters under args and method=GET.
# 200 is the success contract, not evidence of service availability.
rows = [dict(RequestId=r['RequestId'], Key=r['Key'], Method='GET', HttpStatusCode=200)
        for r in requests]
expected = dict(
    package_path=sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/n11.lgp',
    nodes=[dict(type=t) for t in ['imports.text', 'integration.rest_request', 'exports.text']],
    outputs=[dict(output_node_type='export_input', ordered=False, column_order='exact',
                  columns=[dict(name=name, type=kind, label_any=True) for name, kind in
                           [('RequestId', 'string'), ('Key', 'string'), ('Method', 'string'), ('HttpStatusCode', 'integer')]],
                  rows=rows)])
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
