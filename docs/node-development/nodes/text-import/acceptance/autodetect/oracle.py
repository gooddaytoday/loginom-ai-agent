#!/usr/bin/env python3
"""Independent CSV/date oracle; never included in the model workspace."""
import csv
from datetime import datetime
from pathlib import Path
import json

ROOT = Path(__file__).parent
CASES = {
    'ru': ('cp1251', ';', '%d.%m.%Y', '%d.%m.%Y %H:%M:%S'),
    'iso': ('utf-8', ',', '%Y-%m-%d', '%Y-%m-%dT%H:%M:%S'),
    'slash': ('utf-8', ';', '%d/%m/%Y', '%d/%m/%Y %H:%M:%S'),
}


def expected(case):
    encoding, delimiter, day, stamp = CASES[case]
    with (ROOT / 'data' / (case + '.csv')).open(encoding=encoding, newline='') as source:
        reader = csv.DictReader(source, delimiter=delimiter)
        names = reader.fieldnames
        rows = []
        for raw in reader:
            row = {}
            for name, value, kind in zip(names, raw.values(), ['string', 'datetime', 'datetime', 'real', 'boolean', 'string']):
                row[name] = (None if value == '' else
                             datetime.strptime(value, stamp if name.endswith('Stamp') else day).isoformat(timespec='milliseconds') if kind == 'datetime' else
                             float(value.replace(' ', '').replace(',', '.')) if kind == 'real' else
                             value.lower() == 'true' if kind == 'boolean' else value)
            rows.append(row)
    return dict(output_node_type='imports.text', output_port=0, ordered=False, column_order='exact',
                columns=[dict(name=name, type=kind, label_any=True) for name, kind in zip(names, ['string', 'datetime', 'datetime', 'real', 'boolean', 'string'])],
                rows=rows)


if __name__ == '__main__':
    outputs = [dict(expected('iso'), output_node_label='ISO'),
               dict(expected('slash'), output_node_label='Slash')]
    result = expected('ru')
    result.update(output_node_type='export_input', export_destination='ru-result.csv')
    result.pop('output_port')
    outputs.append(result)
    print(json.dumps(dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text')],
                         outputs=outputs), ensure_ascii=False, indent=2))
