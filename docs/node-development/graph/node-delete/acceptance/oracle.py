"""Independent stdlib oracle for the node-delete kits; no Loginom imports.

Recomputes the final tables from data/*.csv and, with --check, compares them to
the frozen expected.json files. Only task.md and data/ reach the model.
"""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def table(case, name):
    with open(ROOT / case / 'data' / name, encoding='utf-8', newline='') as handle:
        records = list(csv.reader(handle, delimiter=';', strict=True))
    return records[0], records[1:]


def expected(case):
    if case == 'node-delete':
        names, rows = table(case, 'sales.csv')
        assert names == ['ID', 'Region', 'Amount']
        # The deleted filter (Amount > 100) must not restrict the final export.
        values = sorted(({'ID': int(r[0]), 'Region': r[1], 'Amount': float(r[2])} for r in rows), key=lambda r: -r['Amount'])
        assert len({r['Amount'] for r in values}) == len(values), 'ties would make the order ambiguous'
        assert sum(r['Amount'] > 100 for r in values) < len(values), 'the filter must change the result'
        return dict(nodes=['imports.text', 'transform.sorting', 'exports.text'], absent=['transform.filter_data'],
                    destination='/sales-sorted.csv', ordered=True, rows=values)
    names, rows = table(case, 'numbers.csv')
    assert names == ['ID', 'Value']
    values = [{'ID': int(r[0]), 'Value': int(r[1]), 'Double': 2 * int(r[1])} for r in rows]
    return dict(nodes=['imports.text', 'programming.javascript', 'exports.text'], absent=[],
                destination='/doubled.csv', ordered=False, rows=values)


def check(case):
    want, frozen = expected(case), json.loads((ROOT / case / 'expected.json').read_text(encoding='utf-8'))
    output = frozen['outputs'][0]
    assert [n['type'] for n in frozen['nodes']] == want['nodes'], case
    assert frozen.get('absent_node_types', []) == want['absent'], case
    assert output['export_destination'] == want['destination'] and output['ordered'] is want['ordered'], case
    assert output['rows'] == want['rows'], case


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for case in ('node-delete', 'node-delete-refused'):
        if args.check: check(case)
        else: print(json.dumps({case: expected(case)}, ensure_ascii=False))
    if args.check: print('node-delete oracle: PASS')
