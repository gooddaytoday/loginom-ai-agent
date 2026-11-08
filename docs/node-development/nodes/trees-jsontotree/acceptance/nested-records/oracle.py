#!/usr/bin/env python3
"""Stage-1 proposal: stdlib JSON/path oracle; never supplied to the model.

Each case is written in the run-check tree format (`proposed_tree_output`,
checked by `check_tree` in scripts/node-acceptance/run-check.py). The compared
document is the normalized one: a scalar field missing from a record, or from
an empty object, is filled with NULL from the fields its sibling instances of
the same schema path carry. Normalized keys are inferred, never listed by hand.
Schema types are asserted only where the fixture has a non-NULL witness; flags
of paths without a witness (always-empty arrays, NULL-only leaves) come from the
native output wizard and are kept under `observation`, not checked.
"""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'fixtures' / 'nested-records'
CLAIM = 'наблюдение, не заявляется'


def escape(key):
    return key.replace('~', '~0').replace('/', '~1')


def tagged(value, path=''):
    if isinstance(value, dict):
        return {'path': path, 'type': 'object', 'children': [
            tagged(v, path + '/' + escape(k)) for k, v in value.items()]}
    if isinstance(value, list):
        return {'path': path, 'type': 'array', 'children': [
            tagged(v, path + '/' + str(i)) for i, v in enumerate(value)]}
    kind = ('null' if value is None else 'boolean' if isinstance(value, bool)
            else 'integer' if isinstance(value, int)
            else 'real' if isinstance(value, Decimal) else 'string')
    return {'path': path, 'type': kind,
            'value': str(value) if kind in ('integer', 'real') else value}


def schema(document):
    """Schema paths in first-appearance order with witnessed kinds."""
    fields = {}

    def visit(value, path='', repeated=False):
        if isinstance(value, list):
            fields.setdefault(path, {'kinds': set(), 'is_array': True})
            for item in value:
                visit(item, path, True)
            return
        entry = fields.setdefault(path, {'kinds': set(), 'is_array': repeated})
        if value is None:
            return
        entry['kinds'].add(tagged(value, path)['type'])
        if isinstance(value, dict):
            for key, cell in value.items():
                visit(cell, path + '/' + escape(key))

    visit(document)
    return fields


def children(fields, parent):
    return [path for path in fields if path != parent and path.rsplit('/', 1)[0] == parent]


def name(path):
    return path.rsplit('/', 1)[-1].replace('~1', '/').replace('~0', '~')


def normalize(document, fields):
    def scalar(path):
        field = fields[path]
        return not field['is_array'] and 'object' not in field['kinds']

    def visit(value, path=''):
        if isinstance(value, list):
            return [visit(item, path) for item in value]
        if not isinstance(value, dict):
            return value
        result = {}
        for child in children(fields, path):
            key = name(child)
            if key in value:
                result[key] = visit(value[key], child)
            elif scalar(child):
                result[key] = None
        assert set(value) <= set(result)
        return result

    return visit(document)


def paths(node):
    yield node['path']
    for child in node.get('children', []):
        yield from paths(child)


def tree_output(document):
    fields = schema(document)
    normalized = normalize(document, fields)
    objects = [path for path, field in fields.items()
               if field['kinds'] == {'object'} and path not in ('', '/items')]
    types = {}
    for path, field in fields.items():
        if not path or not field['kinds'] or (field['kinds'] == {'object'} and not field['is_array']):
            continue  # Root, no witness, or plain object container (type not asserted).
        if field['is_array']:
            if field['kinds'] == {'object'}:
                types[path] = 'object_array'
            continue
        types[path] = next(iter(field['kinds'])) if len(field['kinds']) == 1 else 'variant'
    source_paths = set(paths(tagged(document)))
    proposed = tagged(normalized)
    return {
        'package_path': '{{PACKAGE_PATH}}',
        'nodes': [{'type': 'imports.text'}, {'type': 'trees.from_json'}],
        'outputs': [],
        'proposed_tree_output': {
            'output_node_type': 'trees.from_json', 'output_port': 0, 'port_kind': 'tree',
            'ordered': True,
            'schema_field_order': [name(p) for p in children(fields, '')],
            'item_field_order': [name(p) for p in children(fields, '/items')],
            'nested_field_order': {p: [name(c) for c in children(fields, p)] for p in objects},
            'schema_types': types,
            'tolerance': {'abs': 0, 'rel': 0},
            'document': proposed,
            'source_missing_paths': [p for p in paths(proposed) if p not in source_paths],
            'note': 'Compared document: normalized proposal, not the source JSON.'},
    }, fields


def read_rows(name):
    with (FIXTURES / name).open(newline='', encoding='utf-8') as source:
        rows = list(csv.DictReader(source, delimiter=';'))
    assert len(rows) == 1
    return rows[0]


def unwitnessed(fields):
    return [path for path, field in fields.items() if path and not field['kinds']]


def expected():
    cases = {}
    for case, text in read_rows('documents.csv').items():
        document = json.loads(text, parse_float=Decimal)
        assert document == json.loads((FIXTURES / f'{case}.json').read_text(encoding='utf-8'),
                                      parse_float=Decimal)
        cases[case], fields = tree_output(document)
        assert not [p for p in unwitnessed(fields) if fields[p]['is_array']], case
    mixed = json.loads(read_rows('documents.csv')['mixed'], parse_float=Decimal)
    boundary = json.loads((FIXTURES / 'untyped.json').read_text(encoding='utf-8'))
    assert json.loads(read_rows('untyped.csv')['Document']) == boundary
    untyped, fields = tree_output(boundary)
    assert unwitnessed(fields) == ['/items/emptyArray', '/items/nullOnly']
    return {'status': 'proposal; owner approval required before stage-1 registration',
            'root_rows': 1, 'mode': 'auto_structure', 'root_mode': 'auto',
            'mixed_leaf': {'schema_type': 'variant',
                           'cell_types': [tagged(item['value'])['type'] for item in mixed['items']]},
            'cases': cases,
            'untyped_boundary': untyped,
            'observation': {
                'claim': CLAIM,
                'source': 'native output wizard after stage-0 Execute (nested-records.md)',
                'schema': [
                    {'path': '/items/emptyArray', 'type': 'variant', 'is_array': True, 'is_container': False},
                    {'path': '/items/nullOnly', 'type': 'variant', 'is_array': False, 'is_container': False}]}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='compare committed expected.json')
    args = parser.parse_args()
    destination = Path(__file__).with_name('expected.json')
    result = expected()
    if args.check:
        assert json.loads(destination.read_text(encoding='utf-8')) == result, 'Expected differs from oracle'
        print('OK: four single-document cases plus untyped boundary in proposed_tree_output format')
    else:
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
