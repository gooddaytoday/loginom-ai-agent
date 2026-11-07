#!/usr/bin/env python3
"""Independent computed-share proposal. CSV + Fraction only; no actual input.

Repeated support items are aggregated in first-appearance order. This is a
proposed arithmetic contract; native observations are recorded separately.
It does not implement the seasonal estimator.
"""
import csv
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def expected():
    with (ROOT / 'fixtures/weights-support.csv').open() as stream:
        weights = {}
        for row in csv.DictReader(stream):
            key = (row['Group'], row['Item'])
            weights[key] = weights.get(key, Fraction()) + Fraction(row['Weight'])
    rows = []
    with (ROOT / 'fixtures/weights-totals.csv').open() as stream:
        for row in csv.DictReader(stream):
            group, total = row['Group'], int(row['Total'])
            denominator = sum(weight for (g, _), weight in weights.items() if g == group)
            assert denominator > 0
            for (g, item), weight in weights.items():
                if g == group:
                    assert (total * weight / denominator).denominator == 1
                    rows.append(dict(Group=group, Total=total, Total_Rounded=total,
                                     Item=item, OutputValue=int(total * weight / denominator)))
    columns = [dict(name=name, type=kind, label_any=True)
               for name, kind in [('Group', 'string'), ('Total', 'integer'),
                                  ('Total_Rounded', 'integer'), ('Item', 'string'),
                                  ('OutputValue', 'integer')]]
    for column in columns:
        if column['type'] == 'real':
            column['tolerance'] = dict(abs=1e-12, rel=1e-12)
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text'),
                dict(type='imports.text'), dict(type='transform.ungroup_data'),
                dict(type='exports.text')], outputs=[dict(output_node_type='transform.ungroup_data',
                output_port=0, ordered=True, column_order='exact', columns=columns, rows=rows),
                dict(output_node_type='transform.ungroup_data', output_port=1, ordered=True,
                     column_order='exact', columns=[dict(name=name, type='string', label_any=True)
                     for name in ['Item', 'Group']], rows=[])])


if __name__ == '__main__':
    result = expected()
    assert [row['OutputValue'] for row in result['outputs'][0]['rows']] == [25, 75, 20, 60]
    print(json.dumps(result, ensure_ascii=False, indent=2))
