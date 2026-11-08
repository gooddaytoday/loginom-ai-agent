#!/usr/bin/env python3
"""Stage-0 proposal for constant monthly support, not the native estimator.

Reads fixtures only. Constant signals have no slope and unit seasonal factors.
NULL/zero exclusions and quality NULL/1 are explicit observed native conventions.
The proposal projects out confidence bands: their formula is unknown.
An alternating/nonconstant signal is deliberately refused, never fitted to actual.
"""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = {
    'constant': ('seasonal-totals.csv', 'seasonal-constant-support.csv'),
    'zero': ('seasonal-totals.csv', 'seasonal-zero-support.csv'),
    'null': ('seasonal-totals.csv', 'seasonal-null-support.csv'),
    'empty-support': ('seasonal-totals.csv', 'seasonal-empty-support.csv'),
    'empty-totals': ('seasonal-empty-totals.csv', 'seasonal-constant-support.csv'),
}


def read(name):
    with (ROOT / 'fixtures' / name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


def expected(case):
    totals_file, support_file = CASES[case]
    totals, support = read(totals_file), read(support_file)
    signals = {}
    for row in support:
        if row['Weight'] != '?':
            signals.setdefault((row['Group'], row['Item']), []).append(row)
    weights = {}
    for key, signal in signals.items():
        assert len(signal) == 36
        assert len({row['Period'] for row in signal}) == 36
        values = {Fraction(row['Weight']) for row in signal}
        assert len(values) == 1, 'Nonconstant support needs a separate estimator oracle'
        weights[key] = values.pop()
        assert weights[key] >= 0
    rows = []
    for row in totals:
        total = int(row['Total'])
        group_weights = {item: value for (group, item), value in weights.items()
                         if group == row['Group']}
        denominator = sum(group_weights.values())
        for item, weight in group_weights.items():
            value = total * weight / denominator if denominator else Fraction()
            assert value.denominator == 1
            rows.append(dict(Group=row['Group'], Total=total, Total_Rounded=total,
                             Item=item, OutputValue=int(value),
                             Period=row['Period'] + 'T00:00:00.000',
                             OutputTrend=int(value), OutputSI=1,
                             OutputVT=0 if weight else 6,
                             OutputVTDesc='Разгруппированное' if weight else 'Исключено'))
    quality = [dict(Item=item, Group=group, UngroupQuality=None if weight else 1,
                    **{f'SeasonalIndex{i}': 1 for i in range(1, 13)})
               for (group, item), weight in weights.items()] if totals else []
    fields = [('Group', 'string'), ('Total', 'integer'), ('Total_Rounded', 'integer'),
              ('Item', 'string'), ('OutputValue', 'integer'), ('Period', 'datetime'),
              ('OutputTrend', 'integer'), ('OutputSI', 'real'),
              ('OutputVT', 'integer'), ('OutputVTDesc', 'string')]
    quality_fields = [('Item', 'string'), ('Group', 'string'), ('UngroupQuality', 'real')]
    quality_fields += [(f'SeasonalIndex{i}', 'real') for i in range(1, 13)]
    outputs = []
    for port, columns, values in [(0, fields, rows), (1, quality_fields, quality)]:
        outputs.append(dict(output_node_type='transform.ungroup_data', output_port=port,
                            ordered=True, column_order='exact',
                            columns=[dict(name=name, type=kind, label_any=True,
                                          **({'tolerance': dict(abs=1e-12, rel=1e-12)}
                                             if kind == 'real' else {}))
                                     for name, kind in columns], rows=values))
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text'),
                dict(type='imports.text'), dict(type='transform.ungroup_data'),
                dict(type='exports.text'), dict(type='exports.text')], outputs=outputs)


if __name__ == '__main__':
    result = expected(sys.argv[1] if len(sys.argv) > 1 else 'constant')
    assert [r['OutputValue'] for r in expected('constant')['outputs'][0]['rows']] == [25, 75, 25, 75]
    assert {r['OutputVT'] for r in expected('zero')['outputs'][0]['rows']} == {6}
    assert all(not o['rows'] for o in expected('null')['outputs'])
    print(json.dumps(result, ensure_ascii=False, indent=2))
