#!/usr/bin/env python3
"""Proposal oracle: original CSV bytes only; no Loginom/runtime imports."""
import argparse
from collections import Counter
import csv
import fnmatch
import io
import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / 'fixtures' / 'multi-file'
NAMES = ['SaleID', 'Month', 'Amount', 'Note', 'FileName']
TYPES = ['integer', 'string', 'real', 'string', 'string']


def expected(include_new_month=False):
    # Freeze the set for each proposed acceptance phase, independently of UI.
    sources = sorted(p for p in FIXTURES.glob('*.csv')
                     if fnmatch.fnmatchcase(p.name, 'sales_*.csv'))
    if include_new_month:
        sources.append(FIXTURES / 'variants' / 'sales_2026-03.csv')
    rows = []
    for path in sources:
        reader = csv.DictReader(io.StringIO(path.read_text(encoding='utf-8'), newline=''),
                                delimiter=';', quotechar='"', strict=True)
        if reader.fieldnames != NAMES[:-1]:
            raise ValueError('Source headers differ: ' + path.name)
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise ValueError('Source width differs: ' + path.name)
            rows.append(dict(SaleID=int(row['SaleID']), Month=row['Month'],
                             Amount=None if row['Amount'] == '\\N' else float(row['Amount']),
                             Note=row['Note'], FileName=path.name))
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text')],
                outputs=[dict(output_node_type='imports.text', output_port=0,
                              ordered=False, column_order='exact',
                              columns=[dict(name=n, type=t, label_any=True)
                                       for n, t in zip(NAMES, TYPES)], rows=rows)])


def check_csv(path, proposal):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';', quotechar='"', strict=True)
        if reader.fieldnames != NAMES:
            raise ValueError('CSV column names/order differ')
        actual = []
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise ValueError('CSV row width differs')
            actual.append(dict(SaleID=int(row['SaleID']), Month=row['Month'],
                               Amount=None if row['Amount'] == '\\N' else float(row['Amount']),
                               Note=row['Note'], FileName=row['FileName']))
    key = lambda row: json.dumps(row, ensure_ascii=False, sort_keys=True, allow_nan=False)
    if Counter(map(key, actual)) != Counter(map(key, proposal['outputs'][0]['rows'])):
        raise ValueError('CSV records, multiplicity or source filename differ')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--include-new-month', action='store_true')
    parser.add_argument('--check-expected', type=Path)
    parser.add_argument('--csv', type=Path, help='Export with ; delimiter and explicit \\N NULL marker')
    args = parser.parse_args()
    proposal = expected(args.include_new_month)
    if args.check_expected:
        if json.loads(args.check_expected.read_text(encoding='utf-8')) != proposal:
            raise SystemExit('Expected proposal differs from original fixtures')
    if args.csv:
        check_csv(args.csv, proposal)
    if not args.check_expected and not args.csv:
        print(json.dumps(proposal, ensure_ascii=False, indent=2, allow_nan=False))
