#!/usr/bin/env python3
"""Independent Decimal oracle for the proposed, bounded shares acceptance cases.

No Loginom/runtime imports or actual-output input. UI observations establish
which mathematical contract is proposed; these inputs determine all numbers.
The proportional/equal recurrence is proposed for these fixtures, not a proof
of native behavior for all fractional values or degenerate share sums.
"""
import csv
import json
import sys
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = Decimal


def records(filename):
    with (ROOT / 'fixtures' / filename).open(encoding='utf-8', newline='') as file:
        return [{key: None if value == '?' else value for key, value in row.items()}
                for row in csv.DictReader(file)]


def distribute(totals, support, rounding='none', value=0, balance='none'):
    keys = [row['Group'] for row in totals]
    if len(set(keys)) != len(keys):
        raise ValueError('Totals require a unique group key')
    step = D(10) ** -value if rounding == 'precision' else D(value)

    def rounded(number):
        if rounding == 'none':
            return number
        return (number / step).quantize(D(1), rounding=ROUND_HALF_EVEN) * step

    result = []
    for row in totals:
        if row['Total'] is None:
            continue
        items = [item for item in support if item['Group'] == row['Group'] and item['Share'] is not None]
        if not items:
            continue
        total = D(row['Total'])
        shares = [max(D(item['Share']), D(0)) for item in items]
        values = [rounded(total * share) for share in shares]
        target = rounded(total)
        remainder = target - sum(values)
        if balance == 'last':
            values[-1] += remainder
        if balance in ('proportional', 'equal'):
            for index in range(len(values) - 1):
                if balance == 'proportional':
                    denominator = sum(shares[index:])
                    if not denominator:
                        raise ValueError('All-zero remaining shares outside balanced acceptance scope')
                    adjustment = remainder * shares[index] / denominator
                else:
                    adjustment = remainder / D(len(values) - index)
                previous = values[index]
                values[index] = rounded(previous + adjustment)
                remainder -= values[index] - previous
            values[-1] += remainder
        for item, output in zip(items, values):
            result.append({'Group': row['Group'], 'Total': float(total),
                           'Total_Rounded': float(target), 'Item': item['Item'],
                           'OutputValue': float(output)})
    return result


def output(totals, support, *, label=None, rounding='none', value=0, balance='none'):
    columns = [
        {'name': 'Group', 'type': 'string', 'label_any': True},
        {'name': 'Total', 'type': 'real', 'label_any': True},
        {'name': 'Total_Rounded', 'type': 'real', 'label_any': True},
        {'name': 'Item', 'type': 'string', 'label_any': True},
        {'name': 'OutputValue', 'type': 'real', 'label_any': True},
    ]
    for column in columns:
        if column['type'] == 'real':
            column['tolerance'] = {'abs': 1e-12, 'rel': 1e-12}
    return {'output_node_type': 'transform.ungroup_data',
            **({'output_node_label': label} if label else {}),
            'output_port': 0, 'ordered': True, 'column_order': 'exact',
            'columns': columns,
            'rows': distribute(records(totals), records(support), rounding, value, balance)}


def expected(case='shares'):
    if case == 'shares':
        outputs = [output('totals.csv', 'shares.csv')]
        imports = 2
    elif case == 'rounding':
        outputs = [output('balance-totals.csv', 'balance-shares.csv', label=label,
                          rounding='precision', value=0, balance=balance)
                   for label, balance in [('Без балансировки', 'none'), ('Всё последнему', 'last'),
                                          ('Пропорционально', 'proportional'), ('Равномерно', 'equal')]]
        outputs.append(output('round-totals.csv', 'round-shares.csv', label='Кратно трём',
                              rounding='multiple', value=3, balance='none'))
        imports = 4
    elif case == 'null':
        outputs = [output('null-totals.csv', 'edge-shares.csv')]
        imports = 2
    elif case == 'empty':
        outputs = [output('empty-totals.csv', 'edge-shares.csv')]
        imports = 2
    else:
        raise ValueError(case)
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': ([{'type': 'imports.text'}] * imports
                      + [{'type': 'transform.ungroup_data'}] * len(outputs)
                      + [{'type': 'exports.text'}] * len(outputs)),
            'outputs': outputs}


if __name__ == '__main__':
    print(json.dumps(expected(sys.argv[1] if len(sys.argv) > 1 else 'shares'), ensure_ascii=False, indent=2))
