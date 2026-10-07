#!/usr/bin/env python3
"""Independent full TXT oracle: original bytes never come from a runtime reader."""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

SIZE = 1779179
DIGEST = '8468e52d938f26b9531ce045053df17197f6b6dd0f6b435c7a8dff47bcecaa28'
LABELS = ['Дата продажи', 'Чек', 'Клиент', 'Товар', 'Товарная группа', 'Кол-во', 'Сумма']
NAMES = ['SaleDate', 'Receipt', 'Client', 'Product', 'ProductGroup', 'Quantity', 'Amount']
TYPES = ['datetime', 'string', 'string', 'string', 'string', 'integer', 'real']
KINDS = ['Дискретный'] * 5 + ['Непрерывный'] * 2


def parse(data):
    rows = list(csv.reader(io.StringIO(data.decode('utf-8-sig'), newline='')))
    if rows[0] != LABELS or any(len(row) != 7 for row in rows[1:]):
        raise ValueError('FULL_TABLE_SHAPE_DIFFERS')
    def cell(row):
        date = datetime.strptime(row[0], '%d.%m.%Y').isoformat()
        return (date, *row[1:5], str(int(row[5])), str(Decimal(row[6]).normalize()))
    return Counter(cell(row) for row in rows[1:]), len(rows) - 1


def prepare(source, output):
    data = source.read_bytes()
    if len(data) != SIZE or hashlib.sha256(data).hexdigest() != DIGEST or data.startswith(b'\xef\xbb\xbf'):
        raise ValueError('ORIGINAL_ATTACHMENT_IDENTITY_DIFFERS')
    rows, count = parse(data)
    if count != 20789:
        raise ValueError('ORIGINAL_RECORD_COUNT_DIFFERS')
    expected = {'source': {'name': 'transactions.txt', 'bytes': SIZE, 'sha256': DIGEST},
                'columns': [{'name': n, 'label': l, 'type': t, 'data_kind': k} for n, l, t, k in zip(NAMES, LABELS, TYPES, KINDS)],
                'rows': count, 'multiset': [[list(row), multiplicity] for row, multiplicity in sorted(rows.items())]}
    output.write_text(json.dumps(expected, ensure_ascii=False))
    output.chmod(0o600)
    return {'status': 'prepared', 'rows': count, 'columns': 7, 'source': expected['source']}


def compare(expected, exported):
    want = json.loads(expected.read_text())
    actual, count = parse(exported.read_bytes())
    rows = Counter({tuple(row): count for row, count in want['multiset']})
    if actual != rows or count != want['rows']:
        raise ValueError('FULL_VALUES_DIFFER: missing=%s extra=%s' % (sum((rows - actual).values()), sum((actual - rows).values())))
    data = exported.read_bytes()
    return {'status': 'PASS', 'rows': count, 'columns': 7, 'all_values_compared': True,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'compare'])
    parser.add_argument('--source', type=Path)
    parser.add_argument('--expected', required=True, type=Path)
    parser.add_argument('--exported', type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.expected) if args.mode == 'prepare' else compare(args.expected, args.exported)))
