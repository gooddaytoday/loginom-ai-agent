#!/usr/bin/env python3
"""Validate fixture bytes and freeze the documented root-array refusal."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--data', type=Path, default=Path(__file__).resolve().parent / 'data')
args = parser.parse_args()
records = json.loads((args.data / 'orders.json').read_text())
assert isinstance(records, list) and len(records) == 3
assert all(list(row) == ['OrderID', 'Region', 'Amount'] for row in records)
assert all(isinstance(row['OrderID'], int) and isinstance(row['Region'], str)
           and isinstance(row['Amount'], (int, float)) for row in records)
# The pinned product card requires a single object, not a top-level array.
print(json.dumps({'nodes': [], 'outputs': [], 'refusal': {'text': 'JSON'}}, indent=2))
