#!/usr/bin/env python3
"""Proposed columns oracle, independent of Loginom/runtime; Python stdlib only."""
import argparse
import csv
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent


def check_source(variables):
    """Check the authored INPUT fixture; never treat saved output as the oracle."""
    with ZipFile(ROOT.parent / 'fixtures/source.lgp') as package:
        root = ElementTree.fromstring(package.read('Unit_0/Unit.xml'))
        assert ElementTree.fromstring(package.read('Variables.xml')).findall('.//Item') == []
    xsi_type = '{http://www.w3.org/2001/XMLSchema-instance}type'
    engines = root.findall('.//Engine')
    assert sorted(e.get(xsi_type) for e in engines) == ['TBGCalcVariables', 'TBGModelVariablesComponentEngine']
    expressions = next(e for e in engines if e.get(xsi_type) == 'TBGCalcVariables').findall('Expressions/Item')
    types = {'integer': 'dtInteger', 'boolean': 'dtBoolean', 'string': 'dtString',
             'datetime': 'dtDateTime', 'real': 'dtFloat'}
    assert len(expressions) == len(variables)
    for item, variable in zip(expressions, variables):
        value = variable['value']
        formula = ('Null()' if value is None else
                   'EncodeDateTime(2026,1,2,3,4,5,6)' if variable['type'] == 'datetime' else
                   'FALSE' if value is False else json.dumps(value, ensure_ascii=False))
        assert all(item.get(k) == v for k, v in {
            'Name': variable['name'], 'DisplayName': variable['label'],
            'DataType': types[variable['type']], 'Expression': formula,
        }.items()), 'Input fixture differs from authored values'


def expected(mode='columns'):
    variables = json.loads((ROOT.parent / 'fixtures/variables.json').read_text())
    check_source(variables)
    names = [v['name'] for v in variables]
    assert len(names) == len(set(n.lower() for n in names))
    columns = []
    for v in variables:
        value, kind = v['value'], v['type']
        if value is not None:
            if kind == 'integer':
                assert type(value) is int and -(2**63) <= value < 2**63
            elif kind == 'boolean':
                assert type(value) is bool
            elif kind == 'real':
                assert type(value) in (int, float)
            elif kind == 'datetime':
                assert datetime.fromisoformat(value).tzinfo is None
            else:
                assert kind == 'string' and type(value) is str
        column = {k: v[k] for k in ('name', 'label', 'type')}
        if kind == 'real':
            column['tolerance'] = {'abs': 0, 'rel': 0}
        columns.append(column)
    output = {
        'output_node_type': 'variables.to_table', 'output_port': 0,
        'ordered': True, 'column_order': 'exact', 'columns': columns,
        'rows': [{v['name']: v['value'] for v in variables}],
    }
    if mode == 'rows':
        output['columns'] = [
            {'name': 'Name', 'label': 'Имя', 'type': 'string'},
            {'name': 'DisplayName', 'label': 'Метка', 'type': 'string'},
            {'name': 'Value', 'label': 'Значение', 'type': 'variant'},
        ]
        output['rows'] = [
            {'Name': v['name'], 'DisplayName': v['label'],
             'Value': None if v['value'] is None else {'cell_type': v['type'], 'value': v['value']}}
            for v in variables
        ]
    result = {
        'package_path': '{{PACKAGE_PATH}}',
        'nodes': [{'type': 'variables.to_table'}],
        'outputs': [output],
    }
    if mode == 'columns':
        # The source is the authored variable Calculator, not the unused user
        # variables builtin. W1 audits its reciprocal edge; the complete table
        # oracle independently proves all eight typed values and field metadata.
        result['variable_inventory'] = {
            'outputs': [],
            'links': [{'source': {'type': 'bg-vendor-icon-calcvariables'}, 'output': 0,
                       'target': {'type': 'variables.to_table'}, 'input': 0, 'kind': 'variables'}],
        }
    return result


def check_csv(path, result):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.reader(stream, delimiter=','))
    columns = result['outputs'][0]['columns']
    assert len(rows) == 2 and rows[0] == [c['name'] for c in columns], 'CSV shape/order'
    assert len(rows[1]) == len(columns), 'CSV width'
    for column, cell in zip(columns, rows[1]):
        value = result['outputs'][0]['rows'][0][column['name']]
        if value is None:
            assert cell == '?', 'NULL marker'
        elif column['type'] in ('integer', 'real'):
            assert Decimal(cell) == Decimal(str(value)), 'Numeric value'
        elif column['type'] == 'boolean':
            assert cell == ('True' if value else 'False'), 'Boolean value'
        elif column['type'] == 'datetime':
            assert datetime.fromisoformat(cell) == datetime.fromisoformat(value), 'Datetime precision'
        else:
            assert cell == value, 'String value'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--csv', type=Path)
    parser.add_argument('--mode', choices=('columns', 'rows'), default='columns')
    args = parser.parse_args()
    result = expected(args.mode)
    path = ROOT / ('expected.json' if args.mode == 'columns' else 'expected-rows.proposal.json')
    if args.csv:
        assert args.mode == 'columns', 'Rows CSV/subtypes require approved W2; no stringification oracle'
        check_csv(args.csv, result)
        print('PASS: complete CSV matches authored typed variables')
    elif args.write:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    elif args.check:
        assert json.loads(path.read_text()) == result, 'Expected differs from independent inputs'
        print('PASS: independent expected ' + args.mode + ' matches authored variables')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
