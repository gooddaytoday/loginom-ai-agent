#!/usr/bin/env python3
"""Independent Quality proposal; Python standard library, CSV input only.

All arithmetic used for classification is rational. Neither Loginom results nor
runtime modules, package files, browser state or the model are oracle inputs.
The native observations establishing the proposed conventions are in discovery.md.
"""
import argparse
import csv
import json
import math
from collections import Counter
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / 'fixtures'
SCHEMAS = {
    'diagnostic': [('RowID', 'integer'), ('Value', 'integer'), ('Class', 'string'), ('Note', 'string')],
    'update': [('RowID', 'integer'), ('Value', 'integer'), ('Class', 'string'), ('Note', 'string')],
    'null': [('RowID', 'integer'), ('Value', 'integer'), ('Class', 'string'), ('Note', 'string')],
    'empty': [('RowID', 'integer'), ('Value', 'integer'), ('Class', 'string'), ('Note', 'string')],
    'probe': [('RowID', 'integer'), ('X', 'integer'), ('Y', 'integer'), ('Z', 'integer'),
              ('TieA', 'string'), ('TieB', 'string'), ('Hole', 'string'), ('Real', 'real')],
    'boundary': [('RowID', 'integer'), ('X', 'integer'), ('Y', 'integer'), ('Z', 'integer'),
                 ('TieA', 'string'), ('TieB', 'string'), ('Hole', 'string'), ('Real', 'real')],
}
TYPE_LABEL = {'integer': 'Целый', 'real': 'Вещественный', 'string': 'Строковый'}
SUMMARY = [
    ('Col0', 'N', 'integer'), ('Col1', 'DisplayName', 'string'),
    ('Col2', 'DataType', 'string'), ('Col3', 'DataKind', 'string'),
    ('Col4', 'Null', 'integer'), ('Col5', 'Out', 'integer'), ('Col6', 'Extr', 'integer'),
    ('Col7', 'Avg', 'real'), ('Col8', 'Moda', 'variant'), ('Col9', 'Median', 'real'),
]


def read(name):
    schema = SCHEMAS[name]
    with (FIXTURES / (name + '.csv')).open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == [field for field, _ in schema]
        rows = []
        for raw in reader:
            assert set(raw) == set(reader.fieldnames)
            rows.append({field: None if raw[field] == '?' else
                         raw[field] if kind == 'string' else Fraction(raw[field])
                         for field, kind in schema})
    return schema, rows


def statistics(values, kind):
    valid = [value for value in values if value is not None]
    nulls = len(values) - len(valid)
    if not valid:
        return dict(nulls=nulls, avg=None, median=None, mode=None, out=set(), extr=set())
    if kind == 'string':
        frequencies = Counter(valid)
        mode = max(frequencies, key=lambda value: (frequencies[value], value))
        return dict(nulls=nulls, avg=None, median=None, mode=mode, out=set(), extr=set())
    n = len(valid)
    mean = sum(valid) / n
    variance = sum((value - mean) ** 2 for value in valid) / n
    extreme = {i for i, value in enumerate(values) if value is not None
               and variance > 0 and (value - mean) ** 2 > 25 * variance}
    outlier = {i for i, value in enumerate(values) if value is not None
               and variance > 0 and (value - mean) ** 2 > 9 * variance} - extreme
    low, high = min(valid), max(valid)
    if low == high:
        mode = low
    else:
        bins = math.ceil(1 + math.log2(n))
        counts = [0] * bins
        for value in valid:
            index = min(bins - 1, int((value - low) * bins / (high - low)))
            counts[index] += 1
        winner = counts.index(max(counts))
        mode = low + Fraction(2 * winner + 1, 2 * bins) * (high - low)
    return dict(nulls=nulls, avg=mean, median=sorted(valid)[n // 2], mode=mode,
                out=outlier, extr=extreme)


def scalar(value, kind):
    return None if value is None else int(value) if kind == 'integer' else float(value) if kind == 'real' else value


def expected(name):
    schema, rows = read(name)
    stats = {field: statistics([row[field] for row in rows], kind) for field, kind in schema}
    columns = [dict(name=field, label=field, label_any=True, type=kind) for field, kind in schema]
    original = [{field: scalar(row[field], kind) for field, kind in schema} for row in rows]
    outputs = []
    # Observed native DEFAULT mode: ports 1/2 remain empty even when the
    # independently checked Out/Extr counters are positive. Port 3 preserves
    # every source row. Do not reinterpret their captions as row predicates.
    # This proposal does not cover other per-field actions hidden in the LGP.
    selections = [range(len(rows)), [], [], range(len(rows))]
    for port, selected in enumerate(selections):
        outputs.append(dict(output_node_type='research.quality', output_port=port,
                            ordered=True, column_order='exact', columns=columns,
                            rows=[original[i] for i in selected]))
    summary_columns = [dict(name=field, label=label, type=kind,
                            **({'tolerance': {'abs': 1e-9, 'rel': 1e-12}} if kind == 'real' else {}))
                       for field, label, kind in SUMMARY]
    summary_rows = []
    for index, (field, kind) in enumerate(schema):
        stat = stats[field]
        mode = None if stat['mode'] is None else (
            dict(cell_type='string', value=stat['mode']) if kind == 'string' else
            dict(cell_type='real', value=float(stat['mode'])))
        summary_rows.append(dict(zip([item[0] for item in SUMMARY], [
            index + 1, field, TYPE_LABEL[kind], 'Дискретный' if kind == 'string' else 'Непрерывный',
            stat['nulls'], len(stat['out']), len(stat['extr']),
            None if stat['avg'] is None else float(stat['avg']), mode,
            None if stat['median'] is None else float(stat['median']),
        ])))
    outputs.append(dict(output_node_type='research.quality', output_port=4, ordered=True,
                        column_order='exact', columns=summary_columns, rows=summary_rows))
    return dict(package_path='{{PACKAGE_PATH}}',
                nodes=[dict(type=kind) for kind in ['imports.text', 'research.quality', 'exports.text']],
                outputs=outputs)


def self_check():
    s = statistics([Fraction(i) for i in range(1, 9)], 'integer')
    assert (s['avg'], s['median'], s['mode']) == (Fraction(9, 2), 5, Fraction(15, 8))
    assert statistics(['A', 'B'], 'string')['mode'] == 'B'
    assert statistics(['B', 'A'], 'string')['mode'] == 'B'
    assert statistics([None, ''], 'string')['nulls'] == 1
    assert statistics([None, None], 'integer')['avg'] is None
    assert statistics([Fraction(0)] * 35 + [Fraction(100)], 'integer')['extr'] == {35}
    assert statistics([Fraction(0)] * 34 + [Fraction(100)] * 2, 'integer')['out'] == {34, 35}
    assert statistics([Fraction(0)] * 25 + [Fraction(85), Fraction(100), Fraction(100)], 'integer')['out'] == {26, 27}
    assert statistics([Fraction(0)] * 26 + [Fraction(25), Fraction(100)], 'integer')['extr'] == {27}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--fixtures', nargs='+', choices=SCHEMAS, default=['diagnostic', 'probe', 'boundary', 'update'])
    args = parser.parse_args()
    self_check()
    for name in args.fixtures:
        path = ROOT / {'diagnostic': 'expected.json', 'update': 'expected-update.json',
                       'probe': 'probe/expected.json', 'boundary': 'probe/expected-update.json',
                       'null': 'expected-null.json', 'empty': 'expected-empty.json'}[name]
        text = json.dumps(expected(name), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
        else:
            assert path.read_text(encoding='utf-8') == text, str(path) + ': oracle differs'
        print(name + ': oracle OK')


if __name__ == '__main__':
    main()
