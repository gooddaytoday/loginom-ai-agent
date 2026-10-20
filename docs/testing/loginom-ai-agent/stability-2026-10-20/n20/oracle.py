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
        source = read(ROOT / 'data/deliveries.csv')[1]
        design = [[1., number(r['Hours']), number(r['Distance'])] for r in source]
        target = [number(r['Cost']) for r in source]
        matrix = [[sum(x[i] * x[j] for x in design) for j in range(3)] +
                  [sum(x[i] * y for x, y in zip(design, target))] for i in range(3)]
        for i in range(3):
            pivot = max(range(i, 3), key=lambda j: abs(matrix[j][i]))
            matrix[i], matrix[pivot] = matrix[pivot], matrix[i]
            assert abs(matrix[i][i]) > 1e-12, 'Rank deficient data'
            scale = matrix[i][i]
            matrix[i] = [v / scale for v in matrix[i]]
            for j in range(3):
                if j != i:
                    factor = matrix[j][i]
                    matrix[j] = [a - factor * b for a, b in zip(matrix[j], matrix[i])]
        coefficients = [r[-1] for r in matrix]
        expected = [dict(ID=int(r['ID']), Hours=number(r['Hours']), Distance=number(r['Distance']), Cost=number(r['Cost']),
                         Forecast=sum(x * b for x, b in zip([1., number(r['Hours']), number(r['Distance'])], coefficients)))
                    for r in sorted(source, key=lambda r: int(r['ID']))]
        # Preserve original numeric columns tightly; only fitted values have model tolerance.
        actual = read(sys.argv[1])
        same((actual[0][:-1], [{k: v for k, v in r.items() if k != 'Forecast'} for r in actual[1]]),
             [{k: v for k, v in r.items() if k != 'Forecast'} for r in expected])
        TOLERANCE = .02
        same(actual, expected)
    except (AssertionError, ValueError, KeyError, OSError, csv.Error) as error:
        sys.exit(f"FAIL: {error}")
    print("PASS")
