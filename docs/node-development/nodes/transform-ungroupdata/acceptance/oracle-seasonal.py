#!/usr/bin/env python3
"""Stage-0 proposal for constant monthly support, not the native estimator.

Reads fixtures only. Constant signals have no slope and unit seasonal factors.
Computed here: shares 25/75, constant trend, unit indices. Not computed:
zero/NULL/empty outcomes (OutputVT=6 «Исключено», UngroupQuality=1 at zero
support, empty ports) and NULL UngroupQuality at positive support are rewritten
native stage-0 observation (DOM `&nbsp;`, NULL vs NaN not read exactly). Their
expected files carry "claim": "наблюдение, не заявляется" and are not PASS
criteria until a native typed-read or an owner decision.
The proposal projects out confidence bands: their formula is unknown.
An alternating/nonconstant signal is deliberately refused, never fitted to actual.
--check regenerates the five committed expected files and fails on drift.
"""
import argparse
import csv
import json
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
CLAIM = 'наблюдение, не заявляется'
OBSERVED_NOT_CLAIMED = {
    'constant': 'UngroupQuality=null при положительной опоре: в DOM `&nbsp;`, NULL против NaN не прочитан',
    'zero': 'OutputVT=6 «Исключено», OutputValue=OutputTrend=0 и UngroupQuality=1 при нулевой опоре',
    'null': 'пустые порты 0 и 1 с полной схемой при полностью NULL-опоре',
    'empty-support': 'пустые порты 0 и 1 с полной схемой при пустой опоре',
    'empty-totals': 'пустые порты 0 и 1 с полной схемой при пустых итогах',
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
    return dict(claim=CLAIM, observation=OBSERVED_NOT_CLAIMED[case],
                package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text'),
                dict(type='imports.text'), dict(type='transform.ungroup_data'),
                dict(type='exports.text'), dict(type='exports.text')], outputs=outputs)


def expected_path(case):
    return Path(__file__).with_name('expected-seasonal' + ('' if case == 'constant' else '-' + case) + '.json')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('case', nargs='?', choices=CASES, default='constant')
    parser.add_argument('--check', action='store_true', help='compare all committed expected files')
    args = parser.parse_args()
    result = expected(args.case)
    assert [r['OutputValue'] for r in expected('constant')['outputs'][0]['rows']] == [25, 75, 25, 75]
    assert {r['OutputVT'] for r in expected('zero')['outputs'][0]['rows']} == {6}
    assert all(not o['rows'] for o in expected('null')['outputs'])
    if args.check:
        for case in CASES:
            text = json.dumps(expected(case), ensure_ascii=False, indent=2) + '\n'
            assert expected_path(case).read_text(encoding='utf-8') == text, expected_path(case).name
        print(f'OK: {len(CASES)} expected files match')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
