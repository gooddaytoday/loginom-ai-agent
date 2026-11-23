"""Owner-approved parent/child oracle. Independent Python DFS; never sent to the model."""
import argparse
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parents[1] / 'fixtures' / 'parent-child'


class InvalidForest(ValueError):
    def __init__(self, reason, ids):
        self.reason, self.ids = reason, ids
        self.text = 'Parent-child ' + reason + ' ids: ' + ', '.join(ids)
        super().__init__(self.text)


def forest(rows):
    by_id = {row['id']: row for row in rows}
    if len(by_id) != len(rows) or any(not row['id'] for row in rows):
        raise ValueError('invalid_id')
    orphans = [r['id'] for r in rows if r['parent_id'] and r['parent_id'] not in by_id]
    if orphans:
        raise InvalidForest('orphan', orphans)
    # DFS from EVERY vertex, not just roots; track the active path for exact members.
    state, path, cyclic = {}, [], set()
    def visit(key):
        if state.get(key) == 1:
            cyclic.update(path[path.index(key):])
            return
        if state.get(key) == 2:
            return
        state[key] = 1
        path.append(key)
        parent = by_id[key]['parent_id']
        if parent:
            visit(parent)
        path.pop()
        state[key] = 2
    for row in rows:
        visit(row['id'])
    if cyclic:
        raise InvalidForest('cycle', [r['id'] for r in rows if r['id'] in cyclic])
    def branch(row):
        return dict(id=row['id'], parent_id=row['parent_id'] or None, name=row['name'],
                    children=[branch(r) for r in rows if r['parent_id'] == row['id']])
    return dict(roots=[branch(r) for r in rows if not r['parent_id']])


def approved():
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
            cases[case] = dict(outcome='success', document=forest(rows), source_rows=len(rows))
        except InvalidForest as error:
            cases[case] = dict(outcome='reject', reason=error.reason, ids=error.ids,
                               text=error.text, partial_output_allowed=False)
    return dict(status='owner_approved_2026-11-06', cases=cases)


def run_expected(case):
    result = dict(package_path='{{PACKAGE_PATH}}',
                  nodes=[dict(type='imports.text'), dict(type='programming.javascript')], outputs=[])
    if case['outcome'] == 'reject':
        result['execution_error'] = dict(text=case['text'])
        return result
    result['outputs'] = [dict(output_node_type='export_input', ordered=True,
        columns=[dict(name='JSON', name_any=True, label_any=True, type='string', comparison='json_ast')],
        rows=[dict(JSON=json.dumps(case['document'], ensure_ascii=False, separators=(',', ':')))])]
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = approved()
    documents = {'expected.json': result, **{
        'expected-' + name + '-run.json': run_expected(case) for name, case in result['cases'].items()}}
    if args.write:
        for name, document in documents.items():
            (HERE / name).write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif args.check:
        for name, document in documents.items():
            if json.loads((HERE / name).read_text(encoding='utf-8')) != document:
                raise SystemExit('Oracle differs from ' + name)
        print('PASS: four approved independent fixtures and stock run-check expectations')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
