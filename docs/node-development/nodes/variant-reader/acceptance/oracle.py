"""Stage-0 proposal only: independent values/bits, no Loginom imports or logs."""
import csv
from datetime import datetime
from fractions import Fraction
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parent.parent


def vector(item):
    kind = item['kind']
    result = {'cell_type': kind}
    if kind == 'integer':
        result.update(value=item['text'], bytes_le=struct.pack('<q', int(item['text'])).hex())
    elif kind == 'real':
        result.update(decimal=item['text'], bytes_le=struct.pack('<d', float(item['text'])).hex())
    elif kind == 'datetime':
        delta = datetime.fromisoformat(item['text']) - datetime(1899, 12, 30)
        serial = Fraction(delta.days) + Fraction(delta.seconds * 1000000 + delta.microseconds, 86400000000)
        result.update(value=item['text'], bytes_le=struct.pack('<d', float(serial)).hex(),
                      temporal_scope='proposed_positive_civil_oadate')
    elif kind != 'empty':
        result['value'] = item['value']
    return result


def csv_vectors(items):
    # Every precision.json value the CSV can carry must occur verbatim in precision.csv.
    with (ROOT / 'fixtures/precision.csv').open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    columns = {'integer': 'I', 'real': 'R', 'string': 'S', 'datetime': 'D'}
    for kind, name in columns.items():
        json_values = [item.get('text', item.get('value')) for item in items if item['kind'] == kind]
        csv_values = [row[name] for row in rows if row[name] != '?']
        assert json_values and all(value in csv_values for value in json_values), kind
    booleans = [row['B'] == 'true' for row in rows if row['B'] != '?']
    assert sorted(item['value'] for item in items if item['kind'] == 'boolean') == sorted(booleans)


def expected():
    types = {'I': ('integer', 4), 'R': ('real', 3), 'S': ('string', 5),
             'B': ('boolean', 1), 'D': ('datetime', 2)}
    rows = []
    with (ROOT / 'fixtures/mixed.csv').open(newline='', encoding='utf-8') as stream:
        for row in csv.DictReader(stream):
            for name, (kind, code) in types.items():
                raw = row[name]
                value = None if raw == '?' else (
                    {'cell_type': kind, 'value':
                     int(raw) if kind == 'integer' else float(raw) if kind == 'real' else
                     raw == 'true' if kind == 'boolean' else raw + '.000' if kind == 'datetime' else raw})
                rows.append({'Id': int(row['Id']), 'Names': name, 'DisplayNames': name,
                             'Values': value, 'DataTypes': code})
    collapse = {'output_node_type': 'transform.collapse_columns', 'output_port': 0,
                'ordered': True, 'column_order': 'exact',
                'columns': [{'name': name, 'type': kind, 'label_any': True} for name, kind in
                            [('Id', 'integer'), ('Names', 'string'), ('DisplayNames', 'string'),
                             ('Values', 'variant'), ('DataTypes', 'integer')]], 'rows': rows}
    return {'status': 'proposal_requires_owner_acceptance',
            'cases': {name: {'package_path': '{{PACKAGE_PATH}}', 'null_marker': '?',
                             'nodes': [{'type': 'imports.text'}, {'type': output['output_node_type']},
                                       {'type': 'exports.text'}], 'outputs': [output]}
                      for name, output in [('collapse', collapse)]},
            'precision_vectors': precision_vectors()}


def precision_vectors():
    items = json.loads((ROOT / 'fixtures/precision.json').read_text(encoding='utf-8'))
    csv_vectors(items)
    return [vector(item) for item in items]


if __name__ == '__main__':
    assert sys.argv[1:] in (['--write'], ['--check'])
    result = expected()
    # Fixed independent anchors catch lost signed zero, unsafe int conversion,
    # millisecond loss and accidental NULL/Empty conflation in this oracle.
    vectors = result['precision_vectors']
    assert vectors[0]['bytes_le'] == '0100000000002000'
    assert vectors[2]['bytes_le'] == '9a9999999999b93f'
    assert vectors[3]['bytes_le'] == '0000000000000080'
    assert vectors[5]['bytes_le'] == '4aee3a170479e640'
    assert vectors[8] == {'cell_type': 'string', 'value': 'Привет, "ё"'}
    assert vectors[-2] == {'cell_type': 'null', 'value': None}
    assert vectors[-1] == {'cell_type': 'empty'}
    assert len(result['cases']['collapse']['outputs'][0]['rows']) == 15
    # Stage 1: run-check reads one private expected per selected case.
    files = {'expected.json': result, **{'expected-' + name + '.json': case for name, case in result['cases'].items()}}
    for name, value in files.items():
        path = ROOT / 'acceptance' / name
        if sys.argv[1] == '--write':
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            assert json.loads(path.read_text(encoding='utf-8')) == value, name
    print('PASS: independent proposal, collapse case and 13 precision vectors')
