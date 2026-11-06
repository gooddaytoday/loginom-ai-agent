"""Unapproved LAB-887 business proposal; no Loginom/runtime imports or calls."""

import argparse
import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parents[1] / 'fixtures' / 'parent-child'


def forest(rows):
    by_id = {row['id']: row for row in rows}
    if len(by_id) != len(rows) or any(not row['id'] for row in rows):
        raise ValueError('invalid_id')
    if any(row['parent_id'] and row['parent_id'] not in by_id for row in rows):
        raise ValueError('orphan')
    # Visit every component, including a cycle disconnected from valid roots.
    checked = set()
    for row in rows:
        chain = set()
        current = row['id']
        while current and current not in checked:
            if current in chain:
                raise ValueError('cycle')
            chain.add(current)
            current = by_id[current]['parent_id']
        checked.update(chain)
    nodes = {row['id']: dict(id=row['id'], parent_id=row['parent_id'] or None,
                            name=row['name'], children=[]) for row in rows}
    roots = []
    for row in rows:
        target = nodes[row['parent_id']]['children'] if row['parent_id'] else roots
        target.append(nodes[row['id']])
    return dict(roots=roots)


def proposal():
    cases = {}
    for case in ('org', 'multiple-roots', 'cycle', 'orphan'):
        with (FIXTURES / (case + '.csv')).open(encoding='utf-8', newline='') as source:
            reader = csv.DictReader(source)
            if reader.fieldnames != ['id', 'parent_id', 'name']:
                raise ValueError('Unexpected fixture columns')
            rows = list(reader)
        if any(set(row) != {'id', 'parent_id', 'name'} or
               any(value is None for value in row.values()) for row in rows):
            raise ValueError('Malformed fixture row')
        try:
            cases[case] = dict(outcome='success', document=forest(rows),
                               source_rows=len(rows))
        except ValueError as error:
            cases[case] = dict(outcome='reject', reason=str(error),
                               partial_output_allowed=False)
    return dict(status='proposal_pending_owner_and_native_mode',
                native_result='not_checked', cases=cases)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = proposal()
    if args.check:
        expected = json.loads((HERE / 'expected.json').read_text(encoding='utf-8'))
        if result != expected:
            raise SystemExit('Proposal differs from expected.json')
        print('PASS: four independent proposal fixtures; native acceptance NOT RUN')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
