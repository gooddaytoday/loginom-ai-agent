#!/usr/bin/env python3
"""Independent CSV export oracle; no product, pandas, generator or expected imports."""
import csv
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def read(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as source:
        sample = source.read(8192)
        source.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
        reader = csv.DictReader(source, dialect=dialect)
        fields = reader.fieldnames
        rows = list(reader)
    assert fields and len(fields) == len(set(fields)), 'Missing/duplicate headers'
    assert all(None not in r and None not in r.values() for r in rows), 'Malformed CSV'
    return fields, rows

def number(value):
    parsed = float(value.replace(',', '.'))
    assert math.isfinite(parsed), 'Non-finite numeric value'
    return parsed

def same(actual, expected):
    assert actual[0] == list(expected[0]), f'Columns: {actual[0]}'
    assert len(actual[1]) == len(expected), f'Row count: {len(actual[1])} != {len(expected)}'
    for index, (got, want) in enumerate(zip(actual[1], expected), 1):
        for field, value in want.items():
            if isinstance(value, (int, float)):
                assert math.isclose(number(got[field]), value, abs_tol=TOLERANCE, rel_tol=1e-9), f'Row {index}, {field}'
            else:
                assert got[field] == value, f'Row {index}, {field}: {got[field]!r} != {value!r}'

TOLERANCE = 1e-8

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: oracle.py EXPORTED.csv")
    try:
        from collections import defaultdict
        source = {int(r['ID']): r for r in read(ROOT / 'data/workshops.csv')[1]}
        fields, rows = read(sys.argv[1])
        assert fields == ['ID', 'Hours', 'Materials', 'Group'], 'Columns'
        assert len(rows) == len(source), 'Row count'
        groups = defaultdict(list)
        seen = set()
        for r in rows:
            ident = number(r['ID'])
            assert ident.is_integer() and int(ident) in source and ident not in seen, 'ID missing/duplicate/unknown'
            seen.add(ident)
            assert r['Group'].strip(), 'Empty group'
            point = tuple(number(r[k]) for k in ['Hours', 'Materials'])
            assert all(abs(v - number(source[int(ident)][k])) <= 1e-6 for k, v in zip(['Hours', 'Materials'], point)), 'Source changed'
            groups[r['Group']].append(point)
        assert len(groups) == 3, 'Expected three groups'
        # Infer reference populations from the large gaps in the source, not label IDs.
        populations = []
        for r in sorted(source.values(), key=lambda r: number(r['Hours'])):
            if not populations or number(r['Hours']) - number(populations[-1][-1]['Hours']) > 5:
                populations.append([])
            populations[-1].append(r)
        centers = [tuple(sum(number(r[k]) for r in pop) / len(pop) for k in ['Hours', 'Materials']) for pop in populations]
        assert len(centers) == 3
        matched = set()
        for points in groups.values():
            center = tuple(sum(p[j] for p in points) / len(points) for j in range(2))
            nearest = min(range(3), key=lambda i: math.dist(center, centers[i]))
            assert nearest not in matched and math.dist(center, centers[nearest]) <= .6, 'Cluster centroid'
            matched.add(nearest)
            assert max(math.dist(p, center) for p in points) <= 1.2, 'Cluster spread'
    except (AssertionError, ValueError, KeyError, OSError, csv.Error) as error:
        sys.exit(f"FAIL: {error}")
    print("PASS")
