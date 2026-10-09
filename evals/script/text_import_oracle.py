#!/usr/bin/env python3
"""Offline input oracle and strict typed comparator; never grants runtime PASS."""
import argparse
import collections
import copy
import csv
import datetime
import decimal
import hashlib
import io
import json
import pathlib
import sys

sys.dont_write_bytecode = True


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def parse_source(raw, spec):
    encoding = spec['source']['encoding']
    bom = {'utf-8': b'\xef\xbb\xbf', 'utf-16-le': b'\xff\xfe', 'utf-16-be': b'\xfe\xff'}.get(encoding, b'')
    if bom and raw.startswith(bom):
        raw = raw[len(bom):]
    text = raw.decode(encoding, errors='strict')
    skip = spec['settings']['source']['rows_to_skip']
    text = ''.join(text.splitlines(keepends=True)[skip:])
    fmt = spec['settings']['format']
    quote = fmt['text_qualifier']
    rows = list(csv.reader(io.StringIO(text, newline=''), delimiter=fmt['delimiter'],
                           quotechar=quote or None,
                           quoting=csv.QUOTE_MINIMAL if quote else csv.QUOTE_NONE, strict=True))
    # Limited to the pinned merge_on fixture, whose doubled delimiters carry no
    # intentional empty fields. This is not a general Loginom parser emulation.
    if fmt['multiple_delimiters']:
        rows = [[value for value in row if value != ''] for row in rows]
    if spec['settings']['source']['first_line_as_title']:
        header = rows.pop(0)
        if spec.get('source_headers') is not None and header != spec['source_headers']:
            raise ValueError('SOURCE_HEADERS_DIFFER')
    schema = [{key: col[key] for key in ('name', 'label', 'type', 'data_kind')} for col in spec['columns']]
    result = []
    for row in rows:
        if len(row) != len(schema):
            raise ValueError('SOURCE_COLUMN_COUNT_DIFFER')
        cells = []
        for value, col in zip(row, schema):
            if value == fmt['null_marker']:
                value = None
            elif col['type'] == 'real':
                value = str(decimal.Decimal(value.replace(fmt['decimal_separator'], '.')).normalize())
            elif col['type'] == 'integer':
                value = str(int(value))
            elif col['type'] == 'datetime':
                date_format = fmt['date_format']
                for token, replacement in [('yyyy', '%Y'), ('yy', '%y'), ('dd', '%d'), ('mm', '%m')]:
                    date_format = date_format.replace(token, replacement)
                date_format = date_format.replace('/', fmt['date_separator'])
                value = datetime.datetime.strptime(value, date_format).isoformat(timespec='milliseconds')
            cells.append({'type': col['type'], 'value': value})
        result.append(cells)
    return {'schema': schema, 'row_count': len(result), 'comparison': 'ordered', 'rows': result}


def validate_table(table):
    if table.get('comparison') not in ('ordered', 'multiset'):
        raise ValueError('COMPARISON_MODE_REQUIRED')
    schema = table['schema']
    if not schema or len({col['name'] for col in schema}) != len(schema):
        raise ValueError('INVALID_SCHEMA')
    for col in schema:
        if set(col) != {'name', 'label', 'type', 'data_kind'} or col['type'] not in ('string', 'real', 'integer', 'datetime'):
            raise ValueError('SCHEMA_FIELDS_DIFFER')
    rows = table.get('rows', []) if table['comparison'] == 'ordered' else [entry['cells'] for entry in table['multiset']]
    for row in rows:
        if len(row) != len(schema):
            raise ValueError('CELL_COUNT_DIFFER')
        for cell, col in zip(row, schema):
            if set(cell) != {'type', 'value'} or cell['type'] != col['type']:
                raise ValueError('CELL_TYPE_DIFFER')
            value = cell['value']
            if value is not None and type(value) is not str:
                raise ValueError('CANONICAL_STRING_OR_NULL_REQUIRED')
            if value is not None and col['type'] in ('real', 'integer'):
                if not decimal.Decimal(value).is_finite():
                    raise ValueError('NONFINITE_NUMBER')
                if col['type'] == 'integer' and value != str(int(value)):
                    raise ValueError('NONCANONICAL_INTEGER')
            if value is not None and col['type'] == 'datetime':
                if value != datetime.datetime.fromisoformat(value).isoformat(timespec='milliseconds'):
                    raise ValueError('NONCANONICAL_DATETIME')
    if table['comparison'] == 'ordered' and len(rows) != table['row_count']:
        raise ValueError('ROW_COUNT_DIFFER')
    if table['comparison'] == 'multiset':
        entries = table['multiset']
        if any(type(entry['count']) is not int or entry['count'] < 1 for entry in entries):
            raise ValueError('MULTIPLICITY_INVALID')
        if len({row_key(entry['cells']) for entry in entries}) != len(entries):
            raise ValueError('DUPLICATE_MULTISET_KEY')
        if sum(entry['count'] for entry in entries) != table['row_count']:
            raise ValueError('MULTISET_COUNT_DIFFER')


def cell_key(cell):
    value = cell['value']
    if value is None:
        return (cell['type'], 'NULL', '')
    if cell['type'] == 'real':
        return (cell['type'], 'NUMBER', decimal.Decimal(value))
    return (cell['type'], 'VALUE', value)


def row_key(row):
    return tuple(cell_key(cell) for cell in row)


def multiset(table):
    if table['comparison'] == 'ordered':
        return collections.Counter(row_key(row) for row in table['rows'])
    return collections.Counter({row_key(entry['cells']): entry['count'] for entry in table['multiset']})


def as_multiset(table):
    validate_table(table)
    counters = collections.Counter(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in table['rows'])
    return {'schema': table['schema'], 'row_count': table['row_count'], 'comparison': 'multiset',
            'multiset': [{'cells': json.loads(row), 'count': count} for row, count in sorted(counters.items())]}


def compare(expected, actual):
    validate_table(expected)
    validate_table(actual)
    if actual['schema'] != expected['schema']:
        raise ValueError('SCHEMA_TYPE_LABEL_ORDER_DIFFER')
    if actual['row_count'] != expected['row_count']:
        raise ValueError('FULL_ROW_COUNT_DIFFER')
    if expected['comparison'] == 'ordered':
        if actual['comparison'] != 'ordered':
            raise ValueError('ORDERED_ROWS_REQUIRED')
        if [row_key(row) for row in expected['rows']] != [row_key(row) for row in actual['rows']]:
            raise ValueError('EXACT_TYPED_VALUES_OR_ROW_ORDER_DIFFER')
    elif multiset(expected) != multiset(actual):
        raise ValueError('FULL_MULTISET_VALUES_OR_MULTIPLICITIES_DIFFER')
    return {'status': 'DATA_MATCH', 'rows': expected['row_count'], 'columns': len(expected['schema']),
            'comparison': expected['comparison'], 'runtime_evaluation': 'NOT_ESTABLISHED'}


def sensitivity(expected):
    checks = []
    compare(expected, copy.deepcopy(expected))
    checks.append({'mutation': 'unchanged_control', 'result': 'MATCH'})
    def reject(name, mutate):
        actual = copy.deepcopy(expected)
        mutate(actual)
        try:
            compare(expected, actual)
        except (ValueError, KeyError, decimal.InvalidOperation):
            checks.append({'mutation': name, 'result': 'REJECTED'})
            return
        raise ValueError('FALSE_ACCEPT:' + name)
    reject('leading_zero_loss', lambda t: t['rows'][0][0].update(value=t['rows'][0][0]['value'].lstrip('0')))
    null_at = next((i, j) for i, row in enumerate(expected['rows']) for j, c in enumerate(row) if c['value'] is None)
    reject('NULL_to_empty_string', lambda t: t['rows'][null_at[0]][null_at[1]].update(value=''))
    reject('row_deleted', lambda t: (t['rows'].pop(), t.update(row_count=t['row_count'] - 1)))
    reject('row_duplicated', lambda t: (t['rows'].append(copy.deepcopy(t['rows'][0])), t.update(row_count=t['row_count'] + 1)))
    reject('row_order_swapped', lambda t: t['rows'].reverse())
    reject('column_bindings_swapped', lambda t: t['schema'].reverse())
    reject('Unicode_value_changed', lambda t: t['rows'][0][1].update(value=t['rows'][0][1]['value'] + 'x'))
    return checks


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Compare full typed data only; does not prove execution, source identity or cleanup.')
    parser.add_argument('--expected', type=pathlib.Path, required=True)
    parser.add_argument('--actual', type=pathlib.Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(compare(json.loads(args.expected.read_text()), json.loads(args.actual.read_text())), ensure_ascii=False))
    except (ValueError, KeyError, decimal.InvalidOperation, json.JSONDecodeError) as error:
        print(json.dumps({'status': 'DATA_MISMATCH', 'reason': str(error), 'runtime_evaluation': 'NOT_ESTABLISHED'}))
        sys.exit(1)
