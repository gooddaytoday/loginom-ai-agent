#!/usr/bin/env python3
"""Independent typed tree cases for trees.from_json (LAB-1558 / R1 LAB-1601).

Stdlib JSON oracle, never supplied to the model and independent of Loginom and
the runtime. Output follows the run-check `tree_outputs` format of `check_tree`
(scripts/node-acceptance/run-check.py). Dates have a registered stock projection
expected-dates.json; Variant and scalar arrays remain proposals for R2/R3:
  * a Variant leaf instance carries `type: "variant"`, `cell_type` and `value`;
  * a scalar array schema type is `<scalar>_array` (Array=true, Container=false);
  * a DateTime leaf value is civil `YYYY-MM-DDTHH:MM:SS.mmm`, no time zone.
Run normally to print expected.json, or --check to compare the committed file.
"""
import csv
import hashlib
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parents[1] / 'fixtures' / 'typed' / 'documents.csv'
SHA256 = 'f5f01a045f6599dad064507e172c259781dcc2bc7d45edc749e7881c58e0ede8'
# Loginom JSON-to-tree default observed in LAB-1136: pedDateTimeFormat YYYY-MM-DDThh:mm:ss.
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$')


def scalar(value, date_field):
    if value is None:
        return 'null', None
    if isinstance(value, bool):
        return 'boolean', value
    if isinstance(value, int):
        return 'integer', str(value)
    if isinstance(value, Decimal):
        return 'real', str(value)
    if date_field and DATE.match(value):
        return 'datetime', value + '.000'
    return 'string', value


def tagged(value, path, schema_type):
    """schema_type maps a schema path (array items share it) to the declared leaf type."""
    schema_path = re.sub(r'/\d+(?=/|$)', '', path)
    if isinstance(value, dict):
        return {'path': path, 'type': 'object',
                'children': [tagged(v, path + '/' + k, schema_type) for k, v in value.items()]}
    if isinstance(value, list):
        return {'path': path, 'type': 'array',
                'children': [tagged(v, path + '/' + str(i), schema_type) for i, v in enumerate(value)]}
    declared = schema_type[schema_path]
    kind, text = scalar(value, declared.startswith('datetime'))
    if kind == 'null':
        return {'path': path, 'type': 'null', 'value': None}
    if declared == 'variant':
        return {'path': path, 'type': 'variant', 'cell_type': kind, 'value': text}
    assert declared in (kind, kind + '_array'), (path, declared, kind)
    return {'path': path, 'type': kind, 'value': text}


def infer_types(document):
    """Leaf schema type from every non-NULL witness of a path; mixed kinds -> variant."""
    kinds = {}

    def walk(value, path, in_array=False):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, path + '/' + k)
        elif isinstance(value, list):
            scalar_items = [v for v in value if not isinstance(v, (dict, list))]
            assert not scalar_items or len(scalar_items) == len(value), 'mixed array'
            if scalar_items or not value and path not in kinds:
                kinds.setdefault(path, set()).add('array')
            for v in value:
                walk(v, path, in_array=bool(scalar_items))
        elif value is not None:
            kind, _ = scalar(value, True)
            kinds.setdefault(path, set()).add(kind + ('_item' if in_array else ''))
    walk(document, '')
    types = {}
    for path, found in kinds.items():
        items = {k[:-5] for k in found if k.endswith('_item')}
        plain = {k for k in found if k not in ('array',) and not k.endswith('_item')}
        if 'array' in found and items:
            assert len(items) == 1, path
            types[path] = items.pop() + '_array'
        elif plain:
            types[path] = plain.pop() if len(plain) == 1 else 'variant'
    return types


def case(column, document):
    items = document['items']
    types = infer_types(document)
    schema_types = {'/items': 'object_array', **{'/items/' + k: types['/items/' + k] for k in items[0]}}
    return {
        'output_node_type': 'trees.from_json', 'output_port': 0, 'port_kind': 'tree', 'ordered': True,
        'tolerance': {'abs': 0, 'rel': 0},
        'source_column': column,
        'schema_field_order': list(document),
        'item_field_order': list(items[0]),
        'schema_types': schema_types,
        'document': tagged(document, '', {'': 'object', **schema_types}),
    }


def expected():
    data = SOURCE.read_bytes()
    assert hashlib.sha256(data).hexdigest() == SHA256, 'documents.csv differs from the proposal'
    rows = list(csv.DictReader(data.decode('utf-8').splitlines(), delimiter=';', quotechar='"'))
    assert len(rows) == 1
    docs = {k: json.loads(v, parse_float=Decimal) for k, v in rows[0].items()}
    cases = {}
    for name, column in (('dates', 'dates'), ('variant', 'mixed'), ('scalar_arrays', 'arrays')):
        cases[name] = {'task': 'task-' + name.replace('_', '-') + '.md',
                       'source': '../../fixtures/typed/documents.csv',
                       'tree_outputs': [case(column, docs[column])]}
    dates, variant, arrays = (cases[k]['tree_outputs'][0] for k in ('dates', 'variant', 'scalar_arrays'))
    assert dates['schema_types']['/items/when'] == 'datetime'
    assert variant['schema_types']['/items/value'] == 'variant'
    assert [c['children'][1].get('cell_type') for c in variant['document']['children'][0]['children']] == [
        'integer', 'string', 'boolean', None, 'real', 'integer']
    assert variant['document']['children'][0]['children'][5]['children'][1]['value'] == '9007199254740993'
    assert arrays['schema_types']['/items/tags'] == 'string_array' and arrays['schema_types']['/items/scores'] == 'real_array'
    return {'status': 'proposal_requires_owner_approval_not_stock_expected',
            'package_path': '{{PACKAGE_PATH}}', 'cases': cases}


if __name__ == '__main__':
    result = expected()
    if '--check' in sys.argv:
        committed = json.loads((ROOT / 'expected.json').read_text(encoding='utf-8'))
        assert result == committed, 'expected.json differs from the independent calculation'
        for name in ['dates', 'scalar_arrays']:
            projection = dict(package_path='{{PACKAGE_PATH}}',
                              nodes=[dict(type='imports.text', label_any=True), dict(type='trees.from_json', label_any=True)],
                              outputs=[], tree_outputs=result['cases'][name]['tree_outputs'])
            filename = 'expected-' + name.replace('_', '-') + '.json'
            assert projection == json.loads((ROOT / filename).read_text(encoding='utf-8')), filename + ' differs from the independent case'
        print('trees.from_json typed proposal: independent expected matches (%d cases)' % len(result['cases']))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
