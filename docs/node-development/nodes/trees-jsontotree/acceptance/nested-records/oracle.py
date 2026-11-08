#!/usr/bin/env python3
"""Stage-0 proposal: stdlib JSON/path oracle; never supplied to the model."""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def tagged(value, path=''):
    if isinstance(value, dict):
        return {'path': path, 'type': 'object', 'children': [
            tagged(v, path+'/'+k.replace('~', '~0').replace('/', '~1'))
            for k, v in value.items()]}
    if isinstance(value, list):
        return {'path': path, 'type': 'array', 'children': [
            tagged(v, path+'/'+str(i)) for i, v in enumerate(value)]}
    kind = ('null' if value is None else 'boolean' if isinstance(value, bool)
            else 'integer' if isinstance(value, int)
            else 'real' if isinstance(value, Decimal) else 'string')
    return {'path': path, 'type': kind,
            'value': str(value) if kind in ('integer', 'real') else value}


def schema(document):
    """Infer only the fixture's object/object-array schema, independently."""
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
        kind = tagged(value, path)['type']
        entry['kinds'].add(kind)
        if isinstance(value, dict):
            for key, cell in value.items():
                visit(cell, path+'/'+key.replace('~', '~0').replace('/', '~1'))

    visit(document)
    # Proposed native-compatible default without a non-NULL type witness.
    return [{'path': path, 'type': next(iter(field['kinds'])) if len(field['kinds']) == 1
             else 'variant', 'is_container': field['kinds'] == {'object'},
             'is_array': field['is_array'], 'label_any': True}
            for path, field in fields.items()]


def expected():
    with (ROOT/'fixtures/nested-records/documents.csv').open(newline='') as source:
        rows = list(csv.DictReader(source, delimiter=';'))
    assert len(rows) == 1
    cases = {}
    for name, text in rows[0].items():
        document = json.loads(text, parse_float=Decimal)
        assert document == json.loads(
            (ROOT/f'fixtures/nested-records/{name}.json').read_text(), parse_float=Decimal)
        normalized = json.loads(text, parse_float=Decimal)
        # Explicit proposed policy: missing scalar in an inferred record -> NULL.
        # Empty ordinary objects acquire the scalar fields inferred from siblings.
        if name == 'null':
            for item in normalized['items']:
                for key in ('note', 'enabled', 'qty'):
                    item.setdefault(key, None)
        if name == 'empty':
            for item in normalized['items']:
                item['details'].setdefault('code', None)
        cases[name] = {'output_node_type': 'trees.from_json', 'output_port': 0,
                       'port_kind': 'tree', 'ordered': True, 'label_any': True,
                       'schema': schema(document),
                       'source': tagged(document), 'proposed_document': tagged(normalized)}
    boundary = json.loads((ROOT/'fixtures/nested-records/untyped.json').read_text())
    with (ROOT/'fixtures/nested-records/untyped.csv').open(newline='') as source:
        boundary_rows = list(csv.DictReader(source, delimiter=';'))
    assert len(boundary_rows) == 1 and json.loads(boundary_rows[0]['Document']) == boundary
    return {'status': 'proposal; owner approval required; not a runtime wire schema',
            'root_rows': 1, 'mode': 'auto_structure', 'root_mode': 'auto',
            'numeric_tolerance': {'abs': 0, 'rel': 0},
            'mixed_leaf': {'schema_type': 'variant',
                           'cell_types': ['integer', 'string', 'boolean', 'null']},
            'cases': cases,
            'untyped_boundary': {'source': tagged(boundary), 'proposed_document': tagged(boundary),
                                 'schema': schema(boundary), 'root_rows': 1,
                                 'acceptance': 'proposal after native discovery; owner approval before stage 1'}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    destination = Path(__file__).with_name('expected.json')
    result = expected()
    if args.check:
        assert json.loads(destination.read_text()) == result, 'Expected differs from oracle'
        print('OK: four single-document cases; nested 2 parents / 1+2 children; exact Int64')
    else:
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
