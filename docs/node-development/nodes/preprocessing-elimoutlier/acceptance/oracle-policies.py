#!/usr/bin/env python3
"""Independent SD editing proposal, revised after LAB-1103 native discovery.

Classify the original sample; mean uses non-anomalous values, median uses all
non-NULL training values (the replacement discriminator separates these rules).
Clipping uses the normal-sample mean plus/minus one normal-sample population SD
for the fixture's outlier multiplier 1 (also for extremes). General multipliers
and exact clipping precision still require acceptance. No saved-model apply
claim: --apply produces the desired frozen-fit contrast, not observed behavior.
No Loginom, runtime, browser or actual-output inputs.
"""
import argparse
import csv
import json
import math
from collections import Counter
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    with (ROOT / 'fixtures' / name).open() as stream:
        return [dict(RowID=int(row['RowID']), X=None if row['X'] == '?' else Fraction(row['X']),
                     Note=row['Note']) for row in csv.DictReader(stream)]


def expected(policy, apply=False, fixture='policies.csv', extreme_constant=-7):
    training = read(fixture)
    values = sorted(row['X'] for row in training if row['X'] is not None)
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    normal = [value for value in values if (value - mean) ** 2 <= variance]
    replacement_mean = sum(normal) / len(normal)
    replacement_variance = sum((value - replacement_mean) ** 2 for value in normal) / len(normal)
    bins = math.ceil(1 + math.log2(len(values)))
    width = (max(values) - min(values)) / bins
    histogram = Counter(min(bins - 1, int((value - min(values)) / width)) for value in values)
    winner = max(range(bins), key=lambda index: (histogram[index], -index))
    replacements = dict(mean=replacement_mean, median=values[len(values) // 2],
                        most_probable=min(values) + Fraction(2 * winner + 1, 2) * width,
                        constant=Fraction(-7))
    ports = [[], [], []]
    for source in read('policies-apply.csv') if apply else training:
        value = source['X']
        category = (2 if (value - mean) ** 2 > 4 * variance else
                    1 if (value - mean) ** 2 > variance else 0) if value is not None else 0
        # Proposed side outputs preserve source values; native confirmation pending.
        if category:
            ports[category].append(source.copy())
        row = source.copy()
        if category and policy == 'delete':
            continue
        if category and policy in replacements:
            row['X'] = Fraction(extreme_constant) if policy == 'constant' and category == 2 else replacements[policy]
        if category and policy == 'limit':
            row['X'] = float(replacement_mean) + math.copysign(math.sqrt(float(replacement_variance)), float(value - replacement_mean))
        ports[0].append(row)
    columns = [dict(name='RowID', type='integer', label_any=True),
               dict(name='X', type='real', label_any=True, tolerance=dict(abs=1e-10 if policy in ('mean', 'limit') else 0,
                                                    rel=1e-10 if policy in ('mean', 'limit') else 0)),
               dict(name='Note', type='string', label_any=True)]
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text'),
                dict(type='preprocessing.elim_outlier'), dict(type='exports.text')], outputs=[
                dict(output_node_type='preprocessing.elim_outlier', output_port=index, ordered=True,
                     column_order='exact', columns=columns,
                     rows=[{**row, 'X': None if row['X'] is None else float(row['X'])} for row in rows])
                for index, rows in enumerate(ports)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('policy', choices=['delete', 'mean', 'median', 'most_probable', 'constant', 'limit'])
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--fixture', choices=['policies.csv', 'replacement-discriminator.csv'], default='policies.csv')
    parser.add_argument('--extreme-constant', type=int, default=-7)
    args = parser.parse_args()
    result = expected(args.policy, args.apply, args.fixture, args.extreme_constant)
    assert result['outputs'][2]['rows'][0]['RowID'] == (3 if args.apply else 7 if args.fixture == 'policies.csv' else 8)
    assert len(result['outputs'][1]['rows']) == (1 if args.apply else 0)
    print(json.dumps(result, ensure_ascii=False, indent=2))
