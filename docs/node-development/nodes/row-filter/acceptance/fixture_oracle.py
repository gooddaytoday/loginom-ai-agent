"""Independent byte-derived partitions and strict two-port evidence checks.

No browser/runtime imports. The supplied binding must be obtained independently
from an owned execution/provenance audit, never copied from the submitted ports.
This module checks consistency; it does not attest browser execution itself.
"""
import csv
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[4] / 'packages/loginom-runtime/tools/loginom-acceptance'))
from row_filter_oracle import partition
from row_filter_matrix import cases as golden_cases


def load_fixture(entry):
    path = ROOT / entry['path']
    data = path.read_bytes()
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError('fixture_bytes')
    kinds = dict(zip(entry['columns'], entry['types'], strict=True))

    def decode(name, raw):
        if raw == entry['null_marker']:
            return None
        kind = kinds[name]
        if kind == 'integer':
            return int(raw)
        if kind == 'real':
            return Decimal(raw)
        if kind == 'boolean':
            if raw not in ('true', 'false'):
                raise ValueError('fixture_boolean')
            return raw == 'true'
        if kind == 'datetime':
            return datetime.strptime(raw, '%d.%m.%Y %H:%M:%S')
        return raw

    with path.open(encoding=entry['encoding'], newline='') as stream:
        reader = csv.DictReader(stream, delimiter=entry['delimiter'], quotechar=entry.get('text_qualifier', '"'))
        if reader.fieldnames != entry['columns']:
            raise ValueError('fixture_header')
        rows = []
        for row in reader:
            if set(row) != set(kinds) or any(v is None for v in row.values()):
                raise ValueError('fixture_row_shape')
            rows.append({name: decode(name, row[name]) for name in kinds})
    if len(rows) != entry['rows']:
        raise ValueError('fixture_count')
    return rows


def json_value(value):
    if isinstance(value, datetime):
        return value.isoformat(timespec='milliseconds')
    if isinstance(value, Decimal):
        return float(value)
    return value


def extra_cases():
    def c(field, kind, operator, **values):
        return dict(field=dict(kind='input_field', name=field), type=kind, operator=operator, **values)
    result = [('and-or', 'age_income', [[c('Age', 'integer', '>=', value=30), c('Income', 'integer', '<', value=20)], [c('Income', 'integer', '>=', value=50)]])]
    for sensitive in (True, False):
        for operator, value in [('=', 'A'), ('contains', 'A'), ('=', ''), ('=', 'null'), ('contains', '"')]:
            result.append(('strings', f'string_{operator}_{value!r}_{sensitive}', [[c('Text', 'string', operator, value=value, case_sensitive=sensitive)]]))
    for operator in ('is_null', 'not_null'):
        result.append(('strings', 'text_' + operator, [[c('Text', 'string', operator)]]))
    result.append(('strings', 'numeric_zero', [[c('Value', 'integer', '=', value=0)]]))
    result.append(('strings', 'numeric_null', [[c('Value', 'integer', 'is_null')]]))
    result.append(('header-only', 'empty_input', [[c('Id', 'integer', '>=', value=1)]]))
    return result


def expectations():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    entries = {Path(e['path']).stem: e for e in manifest['fixtures']}
    # Validate every fixture, including the unchanged golden source.
    sources = {name: load_fixture(entry) for name, entry in entries.items()}
    cases = []
    for fixture, name, groups in extra_cases():
        entry = entries[fixture]
        columns = [dict(name=n, label=n, type=t) for n, t in zip(entry['columns'], entry['types'], strict=True)]
        ports = partition(sources[fixture], groups)
        cases.append(dict(name=name, fixture=entry['path'], source_sha256=entry['sha256'], groups=groups,
                          columns=columns, expected_ports=[dict(port=i, rows=[{k: json_value(v) for k, v in r.items()} for r in rows]) for i, rows in enumerate(ports)],
                          live_status='not_checked'))
    golden = entries['golden']
    golden_columns = [dict(name=n, label=n, type=t) for n, t in zip(golden['columns'], golden['types'], strict=True)]
    expanded = []
    for case in golden_cases()['cases']:
        ports = partition(sources['golden'], case['parameters']['groups'])
        expanded.append(dict(name=case['name'], fixture=golden['path'], source_sha256=golden['sha256'],
                             groups=case['parameters']['groups'], columns=golden_columns,
                             expected_ports=[dict(port=i, rows=[{k: json_value(v) for k, v in r.items()} for r in rows]) for i, rows in enumerate(ports)],
                             live_status='not_checked'))
    return dict(scope='local_expectations_only', live_status='not_checked', golden_cases=expanded, cases=cases)


def _key(row, columns):
    # Type tags prevent Python's bool/int equality and NULL/empty/0 aliasing.
    return tuple((c['type'], 'number' if c['type'] == 'real' and row[c['name']] is not None else type(row[c['name']]).__name__,
                  Decimal(str(row[c['name']])) if c['type'] == 'real' and row[c['name']] is not None else row[c['name']]) for c in columns)


def verify_ports(case, ports, binding):
    """Check complete typed cells against bytes plus separately anchored identity."""
    columns = case['columns']
    if (not binding.get('node_id') or not binding.get('execution_id') or not binding.get('document_id')
            or not binding.get('workflow_id') or binding.get('source_sha256') != case['source_sha256']
            or set(binding.get('port_guids', {})) != {'0', '1'}):
        raise ValueError('independent_binding_required')
    if len(ports) != 2 or sorted(p.get('port', -1) for p in ports) != [0, 1]:
        raise ValueError('two_ports')
    guids = [p.get('port_guid') for p in ports]
    if any(not isinstance(g, str) or not g for g in guids) or len(set(guids)) != 2:
        raise ValueError('port_identity')
    actual = [[], []]
    for port in ports:
        if (port.get('node') != {k: binding[k] for k in ('document_id', 'workflow_id', 'node_id')}
                or port.get('execution_id') != binding['execution_id'] or port.get('fresh') is not True
                or port.get('source_sha256') != binding['source_sha256']
                or port['port_guid'] != binding['port_guids'][str(port['port'])]):
            raise ValueError('node_execution_source_binding')
        if (port.get('schema') != columns or port.get('sample_complete') is not True
                or port.get('filter_enabled') is not False or type(port.get('row_count')) is not int
                or port['row_count'] != len(port.get('sample', []))):
            raise ValueError('complete_schema')
        for cells in port['sample']:
            if len(cells) != len(columns):
                raise ValueError('cell_count')
            row = {}
            for c, cell in zip(columns, cells, strict=True):
                value, kind = cell.get('value'), c['type']
                if cell.get('type') != kind or type(cell.get('is_null')) is not bool:
                    raise ValueError('cell_type')
                if cell['is_null']:
                    if value is not None or cell.get('precision') != 'exact_null':
                        raise ValueError('null_cell')
                elif kind == 'integer':
                    if type(value) is not str or cell.get('precision') != 'exact_integer':
                        raise ValueError('integer_precision')
                    value = int(value)
                elif kind == 'real':
                    if type(value) not in (float, int) or cell.get('precision') != '17_significant_digits':
                        raise ValueError('real_precision')
                elif kind == 'boolean':
                    if type(value) is not bool or cell.get('precision') != 'exact_boolean':
                        raise ValueError('boolean_precision')
                elif kind == 'datetime':
                    if type(value) is not str or cell.get('precision') != 'millisecond' or cell.get('timezone') != 'unspecified':
                        raise ValueError('datetime_precision')
                    value = datetime.fromisoformat(value).isoformat(timespec='milliseconds')
                elif kind == 'string' and type(value) is not str:
                    raise ValueError('string_value')
                row[c['name']] = value
            actual[port['port']].append(row)
    for expected in case['expected_ports']:
        if Counter(_key(r, columns) for r in actual[expected['port']]) != Counter(_key(r, columns) for r in expected['rows']):
            raise ValueError('expected_partition')
    return dict(passed=True, scope='local_value_and_binding_consistency', browser_execution_attested=False)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(expectations(), ensure_ascii=False, indent=2) + '\n')
