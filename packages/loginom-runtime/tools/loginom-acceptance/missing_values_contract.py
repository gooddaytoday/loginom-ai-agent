"""Independent checks for declared Missing Values cases; never calls the handler.

Full rows must come from a separately collected bound table, including cases
larger than node.apply's sample. A successful check does not prove persistence;
reopen evidence is a separate required check in the acceptance report.
"""
from decimal import Decimal, InvalidOperation


def audit_missing_values(expected, result, table, source):
    failures = []

    def need(condition, code):
        if not condition:
            failures.append(code)

    try:
        need(result['status'] == 'SUCCEEDED' and result['cleanup_complete'] is True, 'operation_complete')
        need(result['operation_id'] == expected['operation_id'], 'operation_identity')
        need(result['node'] == expected['node'], 'node_identity')
        execution = result['execution']
        need(execution['status'] == 'completed' and bool(execution['execution_id']), 'execution_complete')
        need(execution['execution_id'] not in expected.get('previous_execution_ids', []), 'stale_execution')
        rb = result['configuration']['readback']
        need(result['configuration']['status'] == 'applied' and rb['kind'] == 'missing_values' and rb['mode'] == 'impute', 'configuration_kind')
        need(rb['node'] == result['node'] and rb['ordered'] is False, 'configuration_owner_ordering')
        need(rb['max_nulls_percent'] == expected['max_nulls_percent'], 'threshold')
        need(rb['values_are'] == 'observed_ui_values' and rb['scope'] == 'observed_before_verified_finish', 'configuration_evidence')
        wanted = expected['fields']
        need(len(rb['fields']) == len(expected['schema']), 'processing_inventory')
        need([f['name'] for f in rb['fields']] == [f['name'] for f in expected['schema']], 'processing_order')
        for observed, schema in zip(rb['fields'], expected['schema']):
            need(all(observed.get(k) == v for k, v in schema.items()), 'processing_schema:' + schema['name'])
        for f in rb['fields']:
            policy = wanted.get(f['name'])
            need(f['used'] is bool(policy), 'active_field:' + f['name'])
            if policy:
                need(f.get('method') == policy['method'], 'method:' + f['name'])
                if policy['method'] == 'constant':
                    need(f.get('value') == policy['value'], 'constant:' + f['name'])
        need(source['verified'] is True and source['sha256'] == expected['source_sha256'], 'source_version')
        if expected.get('source_dependency_reexecution') is True:
            proof = source['dependency_reexecution']
            need(source['execution_id'] is None and source['integrity_scope'] == 'prior_verified_upload', 'source_execution_scope')
            need(proof['before']['active'] is False and proof['after']['active'] is True, 'source_reactivation')
            need(proof['before']['port_guid'] == proof['after']['port_guid'] and bool(proof['before']['port_guid']), 'source_port_continuation')
            need(all(all(p['node'][k] == expected['source_node'][k] for k in ('document_id', 'workflow_id', 'node_id')) for p in (proof['before'], proof['after'])), 'source_dependency_owner')
            need(proof['target_execution_id'] == execution['execution_id'], 'source_dependency_execution')
        else:
            need(bool(source['execution_id']) and source['execution_id'] == expected['source_execution_id'], 'source_execution')
        need(source['node'] == expected['source_node'] and all(source['node'][k] == result['node'][k] for k in ('document_id', 'workflow_id')), 'source_owner')
        need(source['destination'] == expected['source_path'], 'source_path')
        need(table['verified'] is True and table['complete'] is True, 'full_table')
        need(table['node'] == result['node'] and table['execution_id'] == execution['execution_id'], 'table_execution_owner')
        ports = result['output']['ports']
        need(len(ports) == 1 and ports[0]['port'] == 0 and ports[0]['fresh'] is True, 'fresh_port')
        need(table['port_guid'] == ports[0]['port_guid'] and ports[0]['execution_id'] == execution['execution_id'], 'port_execution_owner')
        need(table['row_count'] == len(expected['rows']) == len(table['rows']), 'row_count')
        need(len(table['schema']) == len(expected['schema']) and all(
            all(observed.get(k) == v for k, v in schema.items())
            for observed, schema in zip(table['schema'], expected['schema'])), 'schema')
        nulls = [0] * len(expected['schema'])
        for i, (observed, wanted_row) in enumerate(zip(table['rows'], expected['rows'])):
            need(len(observed) == len(wanted_row) == len(expected['schema']), 'row_width')
            for j, (cell, value) in enumerate(zip(observed, wanted_row)):
                tag = f'cell:{i}:{j}'
                kind = expected['schema'][j]['type']
                need(cell['type'] == kind and isinstance(cell['is_null'], bool), tag + ':type')
                need(cell['is_null'] is (value is None), tag + ':null')
                if cell['is_null']:
                    nulls[j] += 1
                    need(cell.get('value') is None and cell['precision'] == 'exact_null', tag + ':null_proof')
                elif kind == 'integer':
                    need(cell['precision'] == 'exact_integer' and str(cell['value']) == str(value), tag + ':integer')
                elif kind == 'real':
                    need(cell['precision'] == '17_significant_digits', tag + ':precision')
                    actual, wanted_value = Decimal(cell['decimal']), Decimal(str(value))
                    need(actual.is_finite() and abs(actual - wanted_value) <= Decimal(expected.get('real_tolerance', '0')), tag + ':real')
                else:
                    need(type(cell['value']) is type(value) and cell['value'] == value, tag + ':value')
        need(nulls == expected['remaining_nulls'], 'remaining_nulls')
    except (KeyError, TypeError, ValueError, IndexError, InvalidOperation):
        failures.append('malformed_evidence')
    return {'passed': not failures, 'failures': sorted(set(failures)), 'persistence_verified': False}
