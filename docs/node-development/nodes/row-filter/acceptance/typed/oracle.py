"""Independent expectations for Filter rows: Top-N and typed variable thresholds.

Python stdlib only; no Loginom or runtime imports; never supplied to the model.
Semantics: AND of conditions; any comparison with NULL (field or variable) is
false, so the row goes to output 1 (help row-filter/filtering-criteria.html:
"NULL-значения ... нельзя сравнивать"). The NULL-variable case is a hypothesis
until the native probe confirms it (see README).
"""
import argparse
import csv
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT.parents[1] / 'fixtures/typed/rows.csv'
TYPES = {'RowID': 'integer', 'Score': 'real', 'Seen': 'datetime', 'Region': 'string'}


def source():
    def parse(name, text):
        if text == 'NULL':
            return None
        return {'integer': int, 'real': float, 'datetime': datetime.fromisoformat, 'string': str}[TYPES[name]](text)
    with FIXTURE.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        if reader.fieldnames != list(TYPES):
            raise ValueError('FIXTURE_HEADER')
        return [{k: parse(k, v) for k, v in raw.items()} for raw in reader]


def ge(value, limit):
    return value is not None and limit is not None and value >= limit


CASES = {
    'top-initial': (lambda n, r: n <= 3, True),
    'top-final': (lambda n, r: n <= 5, True),
    'typed-initial': (lambda n, r: ge(r['Score'], 2.5) and ge(r['Seen'], datetime(2024, 3, 1)), False),
    'typed-final': (lambda n, r: ge(r['Score'], 0.5) and ge(r['Seen'], datetime(2024, 2, 29)), False),
    'null': (lambda n, r: ge(r['Score'], None), False),
}


def cell(name, value):
    if value is None:
        return None
    return value.isoformat(timespec='milliseconds') if TYPES[name] == 'datetime' else value


def expected(case):
    keep, ordered = CASES[case]
    rows = source()
    split = {0: [], 1: []}
    for number, row in enumerate(rows, start=1):  # 1-based, native probe LAB-1575
        split[0 if keep(number, row) else 1].append({k: cell(k, v) for k, v in row.items()})
    result = {'package_path': '{{PACKAGE_PATH}}', 'null_marker': 'NULL',
            'nodes': [{'type': 'transform.filter_data'}],
            'outputs': [{'output_node_type': 'transform.filter_data', 'output_port': port,
                         'ordered': ordered, 'column_order': 'any',
                         'columns': [column(n, t) for n, t in TYPES.items()], 'rows': split[port]}
                        for port in (0, 1)]}
    if case.startswith('top-'):
        result['row_filter_top_n'] = True
        result['variable_inventory'] = {
            'outputs': [{'node': {'type': 'variables.user'}, 'port': 4,
                         'variables': [{'name': 'TopN', 'type': 'integer', 'value': 3 if case == 'top-initial' else 5}]}],
            'links': [{'source': {'type': 'variables.user'}, 'output': 4,
                       'target': {'type': 'transform.filter_data'}, 'input': 0, 'kind': 'control'}]}
    return result


def column(name, kind):
    result = {'name': name, 'type': kind, 'label_any': True}
    if kind == 'real':
        result['tolerance'] = {'abs': 1e-9, 'rel': 1e-12}
    return result


def self_check():
    ids = lambda case: [r['RowID'] for r in expected(case)['outputs'][0]['rows']]
    assert ids('top-initial') == [1, 2, 3] and ids('top-final') == [1, 2, 3, 4, 5], 'top-n'
    assert ids('typed-initial') == [2, 8], 'threshold equality included, 2.4999 and NULL excluded'
    assert ids('typed-final') == [2, 3, 7, 8], 'changed variables'
    assert ids('null') == [], 'NULL variable matches nothing'
    for case in CASES:
        out = expected(case)['outputs']
        assert sorted(r['RowID'] for o in out for r in o['rows']) == list(range(1, 9)), 'partition ' + case


def files():
    return {'expected-' + case + '.json': json.dumps(expected(case), ensure_ascii=False, indent=2) + '\n' for case in CASES}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    self_check()
    if args.write:
        for name, text in files().items():
            (ROOT / name).write_text(text, encoding='utf-8')
    elif args.check:
        stale = [name for name, text in files().items() if (ROOT / name).read_text(encoding='utf-8') != text]
        if stale:
            raise SystemExit('Stale filter expectations: ' + ', '.join(stale))
        print('OK: independent Top-N and typed-variable filter expectations (5 cases)')
    else:
        print(json.dumps({case: [r['RowID'] for r in expected(case)['outputs'][0]['rows']] for case in CASES}))
