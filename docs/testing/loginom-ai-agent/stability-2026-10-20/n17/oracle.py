#!/usr/bin/env python3
"""Independent CSV export oracle; no product, pandas, generator or expected imports."""
import csv
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def read(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as source:
        sample = source.read(8192)
        source.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
        reader = csv.DictReader(source, dialect=dialect)
        fields = reader.fieldnames
        rows = list(reader)
    assert fields and len(fields) == len(set(fields)), 'Missing/duplicate headers'
    assert all(None not in r and None not in r.values() for r in rows), 'Malformed CSV'
    return fields, rows

def number(value):
    parsed = float(value.replace(',', '.'))
    assert math.isfinite(parsed), 'Non-finite numeric value'
    return parsed

def same(actual, expected):
    assert actual[0] == list(expected[0]), f'Columns: {actual[0]}'
    assert len(actual[1]) == len(expected), f'Row count: {len(actual[1])} != {len(expected)}'
    for index, (got, want) in enumerate(zip(actual[1], expected), 1):
        for field, value in want.items():
            if isinstance(value, (int, float)):
                assert math.isclose(number(got[field]), value, abs_tol=TOLERANCE, rel_tol=1e-9), f'Row {index}, {field}'
            else:
                assert got[field] == value, f'Row {index}, {field}: {got[field]!r} != {value!r}'

TOLERANCE = 1e-8

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: oracle.py EXPORTED.csv")
    try:
        expected = [dict(ParcelID=int(r['ParcelID']), Priority=int(r['Priority']), Due=r['Due'], Description=r['Description'])
                    for r in sorted(read(ROOT / 'data/parcels.csv')[1], key=lambda r: (-int(r['Priority']), r['Due']))]
        same(read(sys.argv[1]), expected)
    except (AssertionError, ValueError, KeyError, OSError, csv.Error) as error:
        sys.exit(f"FAIL: {error}")
    print("PASS")
