#!/usr/bin/env python3
"""Independent proposal oracle: stdlib only, no Loginom/runtime imports."""
import argparse
import copy
import csv
from decimal import Decimal
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
NODES = HERE.parent.parent


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key: ' + key)
        result[key] = value
    return result


def decode(text):
    return json.loads(text, parse_float=Decimal, object_pairs_hook=unique_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))


def equivalent(left, right):
    """Objects are unordered; arrays ordered; bool/null/string distinct from numbers."""
    numeric = (int, Decimal)
    if type(left) in numeric and type(right) in numeric:
        return Decimal(left) == Decimal(right)
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(equivalent(left[k], right[k]) for k in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(equivalent(a, b) for a, b in zip(left, right))
    return left == right


def pointer(value):
    return value.replace('~', '~0').replace('/', '~1')


def typed(value, types, path='', schema_path=''):
    if isinstance(value, dict):
        return dict(path=path, type='object', children=[
            typed(v, types, path + '/' + pointer(k), schema_path + '/' + pointer(k))
            for k, v in value.items()])
    if isinstance(value, list):
        return dict(path=path, type='array', children=[
            typed(v, types, path + '/' + str(i), schema_path) for i, v in enumerate(value)])
    kind = types[schema_path]
    return dict(path=path, type='null' if value is None else kind,
                value=str(value) if value is not None and kind in ('integer', 'real') else value)


def count(node):
    return 1 + sum(count(child) for child in node.get('children', []))


def render(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, list):
        return '[' + ','.join(map(render, value)) + ']'
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + render(v) for k, v in value.items()) + '}'
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def expectation(scenario):
    folder = NODES / ('trees-datatotree' if scenario == 'table' else 'trees-treetojson')
    manifest = json.loads((folder / 'fixtures/manifest.json').read_text())
    for name, expected in manifest['files'].items():
        data = (folder / 'fixtures' / name).read_bytes()
        assert len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256'], name
    if scenario == 'table':
        rows = list(csv.DictReader((folder / 'fixtures/orders.csv').open(newline='', encoding='utf-8')))
        convert = {'integer': int, 'real': Decimal, 'string': str,
                   'boolean': lambda value: {'false': False, 'true': True}[value]}
        records = [{column['name']: None if row[column['name']] == '?' else
                    convert[column['type']](row[column['name']]) for column in manifest['columns']}
                   for row in rows]
        value = {'items': [{**{k: r[k] for k in ('RowID', 'OrderID', 'ExternalID')},
                            'details': {k: r[k] for k in ('SKU', 'Qty', 'Price', 'Active', 'Note')}}
                           for r in records]}
        schema = json.loads((folder / 'fixtures/structure.json').read_text())['nodes']
        types = {n['path']: 'object_array' if n['is_array'] else n['type'] for n in schema if n['path']}
        root_order, item_order = ['items'], ['RowID', 'OrderID', 'ExternalID', 'details']
        tree_type, tree_label = 'trees.from_table', 'OrderTree'
        nodes = [{'type': 'imports.text'}, {'type': tree_type, 'label': tree_label},
                 {'type': 'trees.to_json', 'label': 'OrdersJSON'}]
        output_label = 'OrdersJSON'
    else:
        rows = list(csv.DictReader((folder / 'fixtures/documents.csv').open(newline='', encoding='utf-8')))
        assert len(rows) == 1
        value = decode(rows[0]['Document'])
        assert equivalent(value, decode((folder / 'fixtures/document.json').read_text()))
        # Established v0.3.9 scalar inference: absent note is materialized as NULL.
        for item in value['items']:
            item.setdefault('note', None)
        types = {'/id': 'integer', '/active': 'boolean', '/items': 'object_array',
                 '/items/sku': 'string', '/items/qty': 'integer', '/items/price': 'real', '/items/note': 'string'}
        root_order, item_order = ['id', 'active', 'items'], ['sku', 'qty', 'price', 'note']
        tree_type, tree_label = 'trees.from_json', 'DocumentTree'
        nodes = [{'type': 'imports.text'}, {'type': tree_type, 'label': tree_label},
                 {'type': 'trees.to_json', 'label': 'DocumentJSON'}]
        output_label = 'DocumentJSON'
    document = typed(value, types)
    tree = dict(output_node_type=tree_type, output_node_label=tree_label, output_port=0,
                port_kind='tree', ordered=True, tolerance={'abs': 0, 'rel': 0},
                schema_field_order=root_order, item_field_order=item_order, schema_types=types,
                document=document, instance_count=count(document),
                note='Proposal. Verify actual schema and complete instances independently of the JSON output.')
    if scenario == 'table':
        tree['nested_field_order'] = {'/items/details': ['SKU', 'Qty', 'Price', 'Active', 'Note']}
        tree['schema_node_count'] = len(schema)
        tree['declared_schema'] = [{k: n[k] for k in ('path', 'name', 'label', 'type', 'is_array')} for n in schema]
    else:
        tree['schema_node_count'] = 8
        tree['labels'] = 'label_any; technical names and types exact'
    return dict(proposal='LAB-770 approved criteria; stage 1 separately assigned; no run PASS',
                package_path='{{PACKAGE_PATH}}', nodes=nodes,
                outputs=[dict(output_node_type='trees.to_json', output_node_label=output_label,
                              output_port=0, ordered=True, column_order='exact',
                              columns=[dict(name='JSON', name_any=True, label_any=True, type='string')],
                              rows=[{'JSON': render(value)}])],
                proposed_json_comparison=dict(output_port=0, ordered=True, document_count=1,
                    mode='decoded_json_values', tolerance={'abs': 0, 'rel': 0},
                    object_key_order='ignore; tree schema order exact', array_order='exact',
                    duplicate_keys='reject', int64='exact; no binary64 conversion',
                    null_is_distinct_from=['empty string', 'zero', 'false'],
                    note='Existing cold checker compares strings; rows.JSON is a semantic witness, not a required escape spelling. Requires approved scoped adapter before runs.'),
                proposed_tree_output=tree)


def self_check(expected, scenario):
    value = decode(expected['outputs'][0]['rows'][0]['JSON'])
    assert equivalent(value, decode(render(value)))
    wrong = copy.deepcopy(value)
    wrong['items'].reverse()
    assert not equivalent(value, wrong)
    wrong = copy.deepcopy(value)
    if scenario == 'table':
        assert len(value['items']) == 3 and expected['proposed_tree_output']['instance_count'] == 32
        assert sum(r['details']['Qty'] or 0 for r in value['items']) == 2
        assert sum(r['details']['Price'] for r in value['items']) == Decimal('3.75')
        wrong['items'][0]['ExternalID'] = 9007199254740992
    else:
        assert len(value['items']) == 4 and expected['proposed_tree_output']['instance_count'] == 24
        assert sum(r['qty'] for r in value['items']) == 6
        wrong['id'] = 9007199254740992
    assert not equivalent(value, wrong)
    wrong = copy.deepcopy(value)
    null_path, null_name = ((wrong['items'][0]['details'], 'Note') if scenario == 'table'
                            else (wrong['items'][0], 'note'))
    null_path[null_name] = ''
    assert not equivalent(value, wrong)
    assert not equivalent(False, 0) and not equivalent(None, '')
    try:
        decode('{"x":1,"x":2}')
    except ValueError:
        pass
    else:
        raise AssertionError('Duplicate keys accepted')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--scenario', choices=['table', 'json', 'both'], default='both')
    parser.add_argument('--actual-json', type=Path, help='One full UTF-8 serialized JSON document; requires one scenario')
    args = parser.parse_args()
    assert not args.actual_json or args.scenario != 'both'
    for scenario in ['table', 'json'] if args.scenario == 'both' else [args.scenario]:
        expected = expectation(scenario)
        self_check(expected, scenario)
        target = NODES / ('trees-datatotree' if scenario == 'table' else 'trees-treetojson') / 'acceptance/expected.json'
        text = json.dumps(expected, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            assert target.read_text() == text, str(target) + ' differs from independent calculation'
        elif not args.actual_json:
            target.write_text(text)
        if args.actual_json:
            assert equivalent(decode(args.actual_json.read_text()), decode(expected['outputs'][0]['rows'][0]['JSON']))
        print(scenario + ': oracle consistent; items=' + str(len(decode(expected['outputs'][0]['rows'][0]['JSON'])['items']))
              + '; tree_instances=' + str(expected['proposed_tree_output']['instance_count']))
