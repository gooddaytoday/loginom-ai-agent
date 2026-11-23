#!/usr/bin/env python3
"""Independent oracle for text-folder-masks: one Import per folder over all *.csv.

Reads only the fixture CSVs (never Loginom output) and prints, or with --check
compares, the frozen expected.json: per-folder fields, native types and rows.
"""
import argparse
import csv
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
FOLDERS = ['transactions', 'customers', 'accounts', 'beneficiaries', 'devices', 'risk_reference']


def kind(values):
    if all(re.fullmatch(r'-?\d+', v) for v in values): return 'integer'
    if all(re.fullmatch(r'-?\d+\.\d+', v) for v in values): return 'real'
    return 'string'


def expected():
    outputs = []
    for folder in FOLDERS:
        files = sorted((HERE / 'data' / folder).glob('*.csv'))
        assert files, folder
        header, rows = None, []
        for file in files:
            with file.open(encoding='utf-8', newline='') as handle:
                table = list(csv.reader(handle))
            assert header in (None, table[0]), 'Same structure required: ' + str(file)
            header = table[0]
            rows += table[1:]
        types = [kind([row[i] for row in rows]) for i in range(len(header))]
        cast = dict(integer=int, real=float, string=str)
        outputs.append(dict(output_node_type='imports.text', output_node_label=folder, output_port=0,
                            ordered=False, column_order='exact',
                            columns=[dict(name=n, type=t, label_any=True) for n, t in zip(header, types)],
                            rows=[{n: cast[t](v) for n, t, v in zip(header, types, row)} for row in rows]))
    return {'package_path': '{{PACKAGE_PATH}}', 'nodes': [{'type': 'imports.text'}], 'outputs': outputs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', type=Path)
    args = parser.parse_args()
    value = expected()
    if args.check:
        assert json.loads(args.check.read_text()) == value, 'EXPECTED_DIFFERS_FROM_ORACLE'
        print('PASS')
    else:
        print(json.dumps(value, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
