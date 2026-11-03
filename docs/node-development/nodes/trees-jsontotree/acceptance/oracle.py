#!/usr/bin/env python3
"""Independent proposal: JSON parser + path walk; no Loginom/runtime imports."""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def tagged(value, path=''):
    if isinstance(value, dict):
        return {'path': path, 'type': 'object', 'children': [
            tagged(v, path+'/'+k.replace('~', '~0').replace('/', '~1')) for k, v in value.items()]}
    if isinstance(value, list):
        return {'path': path, 'type': 'array', 'children': [
            tagged(v, path+'/'+str(i)) for i, v in enumerate(value)]}
    kind = ('null' if value is None else 'boolean' if isinstance(value, bool)
            else 'integer' if isinstance(value, int) else 'real' if isinstance(value, Decimal) else 'string')
    return {'path': path, 'type': kind, 'value': str(value) if kind in ('integer', 'real') else value}


def expected(no_repeat=False):
    with (ROOT/'fixtures/documents.csv').open(newline='') as source:
        records = list(csv.DictReader(source))
    assert len(records) == 1 and records[0]['RowID'] == '1'
    document = json.loads(records[0]['Document'], parse_float=Decimal)
    assert document == json.loads((ROOT/'fixtures/response.json').read_text(), parse_float=Decimal)
    columns = [
        {'name': 'id', 'label_any': True, 'type': 'integer'},
        {'name': 'active', 'label_any': True, 'type': 'boolean'},
        {'name': 'sku', 'label_any': True, 'type': 'string'},
        {'name': 'qty', 'label_any': True, 'type': 'integer'},
        {'name': 'price', 'label_any': True, 'type': 'real', 'tolerance': {'abs': 0, 'rel': 0}},
        {'name': 'note', 'label_any': True, 'type': 'string'},
    ]
    rows = [{'id': str(document['id']), 'active': document['active'], 'sku': item['sku'],
             'qty': item['qty'], 'price': float(item['price']), 'note': item.get('note')}
            for item in document['items']]
    if no_repeat:
        rows = [row if i == 0 else dict(row, id=None, active=None) for i, row in enumerate(rows)]
    # Observed native typed-tree policy: a missing scalar in an inferred record
    # is materialized as NULL. Preserve the original JSON distinction separately.
    normalized = dict(document, items=[dict(item, note=item.get('note')) for item in document['items']])
    return {
        'proposal': 'Owner approval and tree_io required; not a runnable v0.3.8 scenario.',
        'package_path': '{{PACKAGE_PATH}}',
        'nodes': [{'type': 'imports.text'}, {'type': 'trees.from_json'}, {'type': 'trees.to_table'}],
        'outputs': [{'output_node_type': 'trees.to_table', 'output_port': 0, 'export_destination': 'tree-result.csv', 'ordered': True,
                     'column_order': 'exact', 'columns': columns, 'rows': rows}],
        'proposed_tree_output': {
            'output_node_type': 'trees.from_json', 'output_port': 0, 'port_kind': 'tree',
            'ordered': True, 'schema_field_order': ['id', 'active', 'items'],
            'item_field_order': ['sku', 'qty', 'price', 'note'],
            'tolerance': {'abs': 0, 'rel': 0}, 'document': tagged(normalized),
            'schema_types': {'/id': 'integer', '/active': 'boolean', '/items': 'object_array',
                             '/items/sku': 'string', '/items/qty': 'integer', '/items/price': 'real', '/items/note': 'string'},
            'source_missing_paths': ['/items/3/note'],
            'missing_paths': [],
            'null_paths': ['/items/0/note', '/items/3/note'],
            'note': 'Paths and tags are the oracle format, not the current runtime wire contract.'},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--no-repeat', action='store_true')
    args = parser.parse_args()
    result = expected(args.no_repeat)
    destination = ROOT/'acceptance'/('expected-no-repeat.json' if args.no_repeat else 'expected.json')
    if args.check:
        assert json.loads(destination.read_text()) == result, 'Expected differs from independent calculation'
        print('OK: 1 JSON document, 4 ordered rows, 6 columns; qty sum 6; exact Int64 9007199254740993')
    else:
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
