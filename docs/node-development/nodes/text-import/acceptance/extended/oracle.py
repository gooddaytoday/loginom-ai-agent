#!/usr/bin/env python3
"""Stage-0 proposals from input CSV bytes; never imports Loginom/runtime code."""
import argparse
from collections import Counter
import csv
from datetime import datetime
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'fixtures' / 'extended'


def table(filename, types, label=None):
    with (FIXTURES / filename).open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';', strict=True)
        names = reader.fieldnames
        if len(names) != len(types) or len(set(names)) != len(names):
            raise ValueError('Unexpected field inventory')
        rows = []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError('Incomplete source record')
            rows.append({name: scalar(row[name], kind) for name, kind in zip(names, types)})
    result = dict(output_node_type='imports.text', output_port=0, ordered=False,
                  column_order='exact', columns=[dict(name=n, type=t, label_any=True)
                                                for n, t in zip(names, types)], rows=rows)
    if label:
        result['output_node_label'] = label
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type='imports.text')], outputs=[result])


def scalar(value, kind):
    if value == '\\N':
        return None
    if kind == 'integer':
        return int(value)
    if kind == 'real':
        return float(value)
    if kind == 'boolean':
        if value not in ('true', 'false'):
            raise ValueError('Not a boolean fixture')
        return value == 'true'
    if kind == 'datetime':
        return datetime.strptime(value, '%Y-%m-%d %H:%M:%S').isoformat(timespec='milliseconds')
    if kind == 'variant':
        # Fixture contract, not a reimplementation of Loginom's type inference.
        if value == '42':
            return dict(cell_type='integer', value=42)
        if value == '3.5':
            return dict(cell_type='real', value=3.5)
        if value != 'word':
            raise ValueError('Unexpected Variant fixture')
        return dict(cell_type='string', value=value)
    return value


def proposals():
    typed = ['integer', 'real', 'boolean', 'datetime', 'string']
    result = {
        'auto-types': table('typed.csv', typed),
        'auto-update': table('typed-update.csv', typed + ['integer']),
        'auto-new': table('typed-update.csv', ['integer', 'string', 'boolean', 'datetime', 'string', 'integer']),
        'variant': table('variant.csv', ['integer', 'variant']),
        'variant-off': table('variant.csv', ['integer', 'string']),
        'auto-label': table('typed-update.csv', typed + ['integer'], 'typed-update.csv'),
        'custom-label': table('typed-update.csv', typed + ['integer'], 'Ежедневные продажи'),
        # Byte-identical body for a future controlled HTTP endpoint; transport is
        # deliberately not asserted by this ordinary table oracle.
        'http': table('typed.csv', typed),
    }
    spec = importlib.util.spec_from_file_location('multi_file_oracle', ROOT / 'acceptance/oracle-multi-file.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name in ('list', 'mask', 'parallel'):
        result[name] = module.expected()
    for name, prefix in [('absolute-path', '{{SOURCE_DIR}}/'), ('relative-path', '')]:
        result[name] = module.expected()
        for row in result[name]['outputs'][0]['rows']:
            row['FileName'] = prefix + row['FileName']
    result['mask-new-month'] = module.expected(True)
    spec = importlib.util.spec_from_file_location('file_variable_oracle', ROOT / 'acceptance/file-variable/oracle.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result['file-variable'] = module.expected()
    proposal = result['file-variable']['file_variable_proposal']
    proposal['scope'] = 'task-file-variable-import.md only; exports use literal paths'
    proposal.pop('same_import_and_export_nodes')
    proposal['same_import_node'] = True
    proposal['binding']['input_names'] = ['InputFile']
    return result


def check_csv(path, expectation):
    output = expectation['outputs'][0]
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';', strict=True)
        if reader.fieldnames != [column['name'] for column in output['columns']]:
            raise ValueError('CSV names/order differ')
        actual = []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError('CSV record width differs')
            actual.append({column['name']: scalar(row[column['name']], column['type'])
                           for column in output['columns']})
    key = lambda row: json.dumps(row, ensure_ascii=False, sort_keys=True, allow_nan=False)
    if Counter(map(key, actual)) != Counter(map(key, output['rows'])):
        raise ValueError('CSV values or multiplicities differ')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--case')
    parser.add_argument('--csv', type=Path)
    args = parser.parse_args()
    expected = proposals()
    if args.csv:
        if args.case not in ('auto-types', 'auto-update', 'auto-new', 'auto-label', 'custom-label', 'variant', 'variant-off', 'http'):
            parser.error('Use the original oracle for list/mask/parallel/file-variable CSV')
        check_csv(args.csv, expected[args.case])
    for name, proposal in expected.items():
        destination = Path(__file__).parent / ('expected-' + name + '.json')
        if args.write:
            destination.write_text(json.dumps(proposal, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
        if args.check and json.loads(destination.read_text()) != proposal:
            raise SystemExit('Stale proposal: ' + name)
    if not args.write and not args.check and not args.csv:
        print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
