"""Bind the independent marking oracle to fresh, complete native table evidence.

Group numbers are arbitrary identifiers. Their membership is checked first;
only then are those identifiers used in the raw-cell comparison. Original
values, input column definitions and expected memberships always come from the
independent fixture. A zero-row table must satisfy the same schema contract.
"""
from decimal import Decimal
from calculator_output_evidence import verify_calculator_output
from duplicates_oracle import verify_marking
from duplicates_configuration_evidence import verify_duplicates_configuration

# Observed Loginom 7.4.2 contract; independent of the client implementation.
SERVICE_COLUMNS = [dict(name=n, label=l, type=t, data_kind='Дискретный') for n,l,t in (
    ('Duplicate', 'Дубликат', 'boolean'), ('DuplicateGroup', 'Группа дубликата', 'integer'),
    ('Contradiction', 'Противоречие', 'boolean'), ('ContradictionGroup', 'Группа противоречия', 'integer'))]
SCHEMA_KEYS = ('name', 'label', 'type', 'data_kind')


def verify_duplicates_output(events, request, source_rows, duplicate_groups, contradiction_groups, identity='Id', *, source_columns):
    failures = []
    execution_id = None
    try:
        checkpoints = [e['result'] for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_checkpoint']
        if len(checkpoints) != 1 or checkpoints[0]['status'] != 'SUCCEEDED':
            raise ValueError('duplicates_output_checkpoint')
        result = checkpoints[0]
        if request['finish'] != 'execute' or request['read']['ports'] != [0] or result['output']['status'] != 'complete':
            raise ValueError('duplicates_complete_execution_required')
        ports = result['output']['ports']
        if len(ports) != 1 or ports[0]['port'] != 0:
            raise ValueError('duplicates_output_port')
        port = ports[0]
        if not port['sample_complete'] or port['row_count'] != len(source_rows) or len(port['sample']) != len(source_rows):
            raise ValueError('duplicates_complete_rows_required')
        # The empty fixture has no rows from which to infer its schema. Require
        # the caller's independent input definition for every fixture instead.
        source_schema = [{k:c[k] for k in SCHEMA_KEYS} for c in source_columns]
        expected_schema = SERVICE_COLUMNS + source_schema
        expected_by_name = {c['name']:c for c in expected_schema}
        if (not source_schema or len(expected_by_name) != len(expected_schema)
                or identity not in {c['name'] for c in source_schema}):
            raise ValueError('duplicates_source_schema_required')
        actual = [{k:c[k] for k in SCHEMA_KEYS} for c in port['schema']]
        canonical = lambda fs: sorted(tuple(c[k] for k in SCHEMA_KEYS) for c in fs)
        if canonical(actual) != canonical(expected_schema):
            raise ValueError('duplicates_expected_schema')
        # Existing output order may differ from the CSV. Only the permutation
        # comes from the result; every expected definition comes from the oracle.
        columns = [expected_by_name[c['name']] for c in actual]
        config = verify_duplicates_configuration(events, request)
        if not config['passed']:
            failures.extend(config['failures'])
            raise ValueError('duplicates_output_configuration')
        readback = result['configuration']['readback']
        if canonical(readback['fields']) != canonical(source_schema):
            raise ValueError('duplicates_input_schema')
        mapped = readback['output_mapping']['fields']
        if mapped != [dict(name=c['name'], label=c['label'], type=c['type'], source_name=c['name']) for c in columns]:
            raise ValueError('duplicates_output_mapping_schema')
        def decode(cell, column):
            if cell['type'] != column['type'] or type(cell['is_null']) is not bool:
                raise ValueError('duplicates_cell_type')
            if cell['is_null']:
                return None
            value = cell['value']
            if column['type'] == 'integer':
                if cell['precision'] != 'exact_integer' or not isinstance(value, str):
                    raise ValueError('duplicates_integer_precision')
                return int(value)
            if column['type'] == 'boolean' and type(value) is not bool:
                raise ValueError('duplicates_boolean_type')
            if column['type'] == 'real':
                return Decimal(value)
            return value
        rows = []
        for sample in port['sample']:
            if len(sample) != len(columns):
                raise ValueError('duplicates_complete_columns')
            rows.append({c['name']:decode(v,c) for c,v in zip(columns,sample)})
        marking = verify_marking(source_rows, rows, duplicate_groups, contradiction_groups, identity)
        if not marking['passed']:
            raise ValueError(','.join(marking['failures']))
        source = {row[identity]:row for row in source_rows}
        expected = []
        for row in rows:
            value = dict(source[row[identity]])
            for flag, group, groups in [('Duplicate','DuplicateGroup',duplicate_groups), ('Contradiction','ContradictionGroup',contradiction_groups)]:
                members = next((g for g in groups if row[identity] in g), None)
                value[flag] = members is not None
                value[group] = row[group] if members is not None else None
            expected.append([value[c['name']] for c in columns])
        raw = verify_calculator_output(events, request, columns, expected)
        failures.extend(raw['failures'])
        execution_id = raw['execution_id']
    except (KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), execution_id=execution_id,
                scope='duplicates_complete_fresh_output', source_identity_verified=False, package_persistence_verified=False)
