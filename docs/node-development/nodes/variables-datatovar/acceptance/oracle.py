#!/usr/bin/env python3
"""Independent CSV aggregates using integer arithmetic and rational means."""
import csv
import json
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent


def output(filename):
    with (HERE.parent / 'fixtures' / filename).open(newline='') as stream:
        rows = list(csv.DictReader(stream))
    values = [int(row['X']) for row in rows if row['X'] != '?']
    # NULL/empty results below are proposed separately, pending the discovery matrix.
    calculated = [float(sum(values)) if values else None, len(rows),
                  min(values) if values else None, max(values) if values else None,
                  float(Fraction(sum(values), len(values))) if values else None]
    fields = [('Sum', 'Сумма', 'real'), ('Count', 'Количество', 'integer'),
              ('Min', 'Минимум', 'integer'), ('Max', 'Максимум', 'integer'),
              ('Avg', 'Среднее', 'real')]
    variables = []
    for (suffix, label, datatype), value in zip(fields, calculated):
        item = {'name': 'X_' + suffix, 'label': 'X|' + label, 'type': datatype, 'value': value}
        if datatype == 'real':
            item['tolerance'] = {'abs': 1e-12, 'rel': 1e-12}
        variables.append(item)
    return {'output_node_type': 'variables.from_table', 'output_port': 0,
            'port_kind': 'variables', 'ordered': True, 'variables': variables}


expected = {'status': 'proposal_pending_criteria_and_W1',
            'initial': output('values.csv'), 'updated': output('replace.csv'),
            'null': output('null.csv'), 'empty': output('empty.csv')}
text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
if __name__ == '__main__':
    import sys
    if '--check' in sys.argv:
        assert (HERE / 'expected.json').read_text() == text, 'expected.json differs from independent oracle'
        print('oracle: PASS')
    else:
        (HERE / 'expected.json').write_text(text)
