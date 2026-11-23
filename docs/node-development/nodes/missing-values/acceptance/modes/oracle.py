"""Proposed exact missing-value cases, independent Python standard library.

No Loginom code, RNG or output is used. Random fixture has a singleton value
domain, so the exact result does not require Loginom's private generator.
--write generates expected*.json, --check verifies reproducibility.
"""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[2]
CASES = {
    'median-mode': ('statistics', 'Медиана и мода'),
    'previous': ('ordered', 'Предыдущее наблюдение'),
    'linear': ('ordered', 'Линейное восстановление'),
    'random': ('random-single-value', 'Случайное восстановление'),
    'delete': ('delete', 'Удаление неполных измерений'),
}


def expected(case):
    fixture, label = CASES[case]
    with (ROOT / f'fixtures/{fixture}.csv').open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        names = reader.fieldnames
        types = {n: 'integer' if n in ['RowID', 'I'] else 'real' if n == 'R' else 'string' for n in names}
        rows = [{n: None if v == 'NULL' else int(v) if types[n] == 'integer' else
                 float(v) if types[n] == 'real' else v for n, v in row.items()} for row in reader]
    if case == 'median-mode':
        for name in ['I', 'R', 'S']:
            values = [row[name] for row in rows if row[name] is not None]
            counts = Counter(values)
            if name == 'S':
                modes = [v for v, n in counts.items() if n == max(counts.values())]
                assert len(modes) == 1
                replacement = modes[0]
            else:
                assert len(values) % 2 == 1
                replacement = median(values)
            for row in rows:
                if row[name] is None:
                    row[name] = replacement
    elif case == 'previous':
        previous = None
        for row in rows:
            if row['R'] is None:
                assert previous is not None
                row['R'] = previous
            previous = row['R']
    elif case == 'linear':
        known = [i for i, row in enumerate(rows) if row['R'] is not None]
        assert known[0] == 0 and known[-1] == len(rows) - 1
        for left, right in zip(known, known[1:]):
            for index in range(left + 1, right):
                rows[index]['R'] = rows[left]['R'] + (rows[right]['R'] - rows[left]['R']) * (index - left) / (right - left)
    elif case == 'random':
        domain = {row['R'] for row in rows if row['R'] is not None}
        assert len(domain) == 1
        for row in rows:
            if row['R'] is None:
                row['R'] = next(iter(domain))
    elif case == 'delete':
        rows = [row for row in rows if row['R'] is not None]
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ['imports.text', 'preprocessing.data_recovery', 'exports.text']],
            'outputs': [{'output_node_type': 'preprocessing.data_recovery', 'output_node_label': label,
                         'output_port': 0, 'ordered': True, 'column_order': 'exact',
                         'columns': [dict(name=n, type=types[n], label_any=True,
                                          **({'tolerance': {'abs': 0, 'rel': 0}} if types[n] == 'real' else {}))
                                     for n in names], 'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for case in CASES:
        text = json.dumps(expected(case), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        path = Path(__file__).parent / ('expected.json' if case == 'median-mode' else f'expected-{case}.json')
        if args.write:
            path.write_text(text, encoding='utf-8')
        elif args.check:
            assert path.read_text(encoding='utf-8') == text, path
        else:
            print(text, end='')
    if args.check:
        print('OK: five independent exact missing-value proposals')
