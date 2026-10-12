"""Independent cleanup expectations from pinned source bytes, without runtime imports."""

import argparse
import csv
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SOURCE_SHA256 = 'c1204e8bb03a0a686ec291de1fa5d532f19830589d4040e695f2f17e186f2a2e'
NAMES = ['Id', 'RawAmount', 'RawFlag', 'RawWhen', 'Comment', 'Unused']


def expected(source, package_path, initial=False):
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError('cleanup_source_sha256_mismatch')
    if not package_path.startswith('/') or not package_path.endswith('.lgp'):
        raise ValueError('absolute_new_package_path_required')
    table = csv.DictReader(io.StringIO(source.decode('utf-8')), delimiter=';')
    if table.fieldnames != NAMES:
        raise ValueError('cleanup_source_columns_mismatch')
    rows = []
    for record in table:
        amount = record['RawAmount']
        amount = float(amount.replace(',', '.')) if re.fullmatch(r'-?\d+(,\d+)?', amount) else None
        flag = {'истина': True, 'false': False, '0': False}.get(record['RawFlag'].lower())
        try:
            timestamp = datetime.strptime(record['RawWhen'], '%d.%m.%Y %H:%M:%S').isoformat(timespec='milliseconds')
        except ValueError:
            timestamp = None
        rows.append(dict(Id=int(record['Id']), Amount=amount, Enabled=flag, Timestamp=timestamp,
            Comment=None if record['Comment'] == 'NULL' else record['Comment']))
    columns = [dict(name=name, label=label, type=kind) for name, label, kind in [
        ('Id', 'Id', 'integer'), ('Amount', 'Значение', 'real'), ('Enabled', 'Значение', 'boolean'),
        ('Timestamp', 'Время', 'datetime'), ('Comment', 'Comment', 'string')]]
    if not initial:
        columns = [columns[3], columns[0], dict(name='NetAmount', label='Сумма', type='real'), columns[2]]
        rows = [dict(Timestamp=row['Timestamp'], Id=row['Id'], NetAmount=row['Amount'], Enabled=row['Enabled']) for row in rows]
    return dict(package_path=package_path, nodes=[dict(type='imports.text'), dict(type='transform.reform_columns')],
        outputs=[dict(output_node_type='transform.reform_columns', output_node_label='Очистка', columns=columns, rows=rows)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', required=True)
    parser.add_argument('--initial', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    body = json.dumps(expected((ROOT / 'data/cleanup.csv').read_bytes(), args.package_path, args.initial),
        ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(body, encoding='utf-8')
    else:
        print(body, end='')
