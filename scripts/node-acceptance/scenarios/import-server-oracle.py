#!/usr/bin/env python3
"""Deterministic native server fixtures and independent frozen expectations."""
import argparse
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RECORDS = 20000
NAMES = ['TransactionID', 'Account', 'Amount', 'Currency', 'Branch', 'Customer',
         'Category', 'Status', 'Merchant', 'Country', 'Channel', 'Fee', 'Memo']


def expected(case):
    large = case == 'import-server-nodownload'
    columns = ([('ID', 'integer'), ('Amount', 'integer'), ('Note', 'string')] if large else
               [(name, 'real' if name in ['Amount', 'Fee'] else 'string') for name in NAMES])
    rows = [dict(zip(NAMES, [f'TX-{i}', f'ACC-{i}', i + 0.25, 'RUB', 'Moscow',
                            f'Customer-{i}', 'retail', 'approved', 'Shop', 'RU', 'web', 0.5, f'Note-{i}']))
            for i in range(1, 5)]
    output = dict(output_node_type='transform.group_data' if large else 'imports.text',
                  output_port=0, ordered=False, column_order='any',
                  columns=[dict(name=n, type=t, label_any=True) for n, t in
                           ([('N', 'integer'), ('Total', 'integer')] if large else columns)],
                  rows=[dict(N=RECORDS, Total=RECORDS * (RECORDS + 1) // 2)] if large else rows,
                  export_destination='native-total.csv' if large else 'native-wide.csv')
    return dict(package_path='{{PACKAGE_PATH}}',
                nodes=[dict(type=t) for t in ['imports.text', *(['transform.group_data'] if large else []), 'exports.text']],
                outputs=[output], server_import=dict(records=RECORDS if large else len(rows),
                columns=[dict(name=n, type=t) for n, t in columns]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--case', choices=['import-server-nodownload', 'import-server-wide'], required=True)
    parser.add_argument('--generate', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    value = expected(args.case)
    if args.generate:
        args.generate.mkdir(parents=True, exist_ok=True)
        large = args.case == 'import-server-nodownload'
        path = args.generate / ('large.csv' if large else 'transactions.txt')
        with path.open('w', encoding='utf-8', newline='') as handle:
            writer = csv.writer(handle, delimiter=',' if large else '\t', lineterminator='\n')
            writer.writerow([c['name'] for c in value['server_import']['columns']])
            if large:
                writer.writerows((i, i, 'payload-' + 'x' * 1024) for i in range(1, RECORDS + 1))
            else:
                writer.writerows([row[n] for n in NAMES] for row in value['outputs'][0]['rows'])
        if large:
            assert 19 * 1024**2 < path.stat().st_size < 21 * 1024**2
        print(json.dumps(dict(file=path.name, bytes=path.stat().st_size, records=value['server_import']['records'])))
    elif args.check:
        assert json.loads((HERE / args.case / 'expected.json').read_text()) == value
        print('PASS')
    else:
        print(json.dumps(value, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
