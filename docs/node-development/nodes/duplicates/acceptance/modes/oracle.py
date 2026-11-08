"""Stage-0 proposal: typed equality and group partitions, Python stdlib only.

Only task and CSV reach the product model. No Loginom output or runtime imports.
One group of each kind makes proposed exact numbering independent of traversal.
--write creates expected*.json; --check detects stale fixtures/expectations.
"""
import argparse
from collections import defaultdict
import csv
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TYPES = dict(RowID='integer', B='boolean', R='real', D='datetime',
             Value='string', Keep='string')
SERVICES = dict(Duplicate='boolean', DuplicateGroup='integer',
                Contradiction='boolean', ContradictionGroup='integer')


def expected(case):
    with (ROOT / f'fixtures/typed-{case}.csv').open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        assert reader.fieldnames == list(TYPES)
        rows = [{name: None if value == 'NULL' else
                 int(value) if TYPES[name] == 'integer' else
                 float(value) if TYPES[name] == 'real' else
                 value == 'true' if TYPES[name] == 'boolean' else
                 datetime.fromisoformat(value).isoformat(timespec='milliseconds')
                 if TYPES[name] == 'datetime' else value
                 for name, value in row.items()} for row in reader]
    by_key = defaultdict(list)
    for index, row in enumerate(rows):
        by_key[tuple(row[name] for name in ['B', 'R', 'D'])].append(index)
        row.update(Duplicate=False, DuplicateGroup=None,
                   Contradiction=False, ContradictionGroup=None)
    duplicate_groups, contradiction_groups = [], []
    for indexes in by_key.values():
        by_value = defaultdict(list)
        for index in indexes:
            by_value[rows[index]['Value']].append(index)
        duplicate_groups.extend(group for group in by_value.values() if len(group) > 1)
        if len(by_value) > 1:
            contradiction_groups.append(indexes)
    assert len(duplicate_groups) <= 1 and len(contradiction_groups) <= 1
    for flag, groups in [('Duplicate', duplicate_groups), ('Contradiction', contradiction_groups)]:
        for number, indexes in enumerate(groups, 1):
            for index in indexes:
                rows[index][flag], rows[index][flag + 'Group'] = True, number
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ['imports.text', 'research.duplicates', 'exports.text']],
            'outputs': [{'output_node_type': 'research.duplicates',
                         'output_node_label': 'Типизированные ключи', 'output_port': 0,
                         'ordered': False, 'column_order': 'exact',
                         'columns': [dict(name=n, type=t, label_any=True,
                                          **({'tolerance': {'abs': 0, 'rel': 0}} if t == 'real' else {}))
                                     for n, t in {**SERVICES, **TYPES}.items()], 'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for case in ['keys', 'empty', 'singleton']:
        result = expected(case)
        text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        path = Path(__file__).parent / ('expected.json' if case == 'keys' else f'expected-{case}.json')
        if args.write:
            path.write_text(text, encoding='utf-8')
        elif args.check:
            assert path.read_text(encoding='utf-8') == text, path
        else:
            print(text, end='')
    if args.check:
        print('OK: independent typed duplicate proposals, 6/0/1 rows')
