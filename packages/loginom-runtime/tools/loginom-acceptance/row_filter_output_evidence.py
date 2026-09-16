"""Audit both native filter outputs against independently supplied expected rows.

Each Table retains its real port index/GUID. The complete procedure and execution
are audited once; the existing Table auditor checks each bounded read/return
interval with that port's original format and return evidence.
"""
import csv
import io
from node_procedure_evidence import verify_internal_sequence
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_table_output_observations


def verify_filter_output(events, request, expected_columns, expected_ports):
    failures = []
    execution_id = None
    try:
        sequence = verify_internal_sequence(events, request['operation_id'], max_steps=4096)
        failures.extend(sequence['failures'])
        observations, mutations = sequence['observations'], sequence['mutations']
        checkpoints = [r['result'] for r in events if r.get('operation_id') == request['operation_id'] and r.get('phase') == 'node_checkpoint']
        if len(checkpoints) != 1 or checkpoints[0].get('status') != 'SUCCEEDED':
            raise ValueError('filter_output_checkpoint')
        checkpoint = checkpoints[0]
        proof = verify_execution_observations(observations, mutations, checkpoint['node'], launch_mode='graph')
        failures.extend(proof['failures'])
        execution_id = proof['execution_id']
        output = checkpoint['output']
        ports, evidence = output['ports'], output['port_evidence']
        if (len(ports) != 2 or [p['port'] for p in ports] != request['read']['ports']
                or set(request['read']['ports']) != {0, 1} or len(expected_ports) != 2
                or len({p['port_guid'] for p in ports}) != 2
                or len(evidence) != 2 or [e['port'] for e in evidence] != request['read']['ports']):
            raise ValueError('filter_both_distinct_outputs')
        before = lambda step: next((s for n, s in reversed(observations) if n < step), {})
        additions = []
        for step, action, _ in mutations:
            controls = [e for e in before(step).get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
            if len(controls) == 1 and controls[0].get('viewer_card', {}).get('kind') == 'add':
                additions.append((step, controls[0]['viewer_card']['port_guid']))
        if len(additions) != 2 or [p for _, p in additions] != [p['port_guid'] for p in ports]:
            raise ValueError('filter_one_new_table_per_port')
        previous_end, shared_end = 0, additions[0][0] - 1
        for port, item in zip(ports, evidence):
            index = port['port']
            table = item['table_creation']['table']
            if (table['port_guid'] != port['port_guid'] or port['table'] != table
                    or port.get('execution_id') != execution_id or port.get('fresh') is not True):
                raise ValueError('filter_port_table_execution_identity')
            returns = []
            for step, action, _ in mutations:
                state = before(step)
                active = state.get('node_outputs', {}).get('tables', [])
                if (action.get('verb') == 'click'
                        and action.get('ref') == state.get('workflow_navigation', {}).get('control_ref')
                        and any(t.get('active') is True and t.get('view_guid') == table['view_guid'] and t.get('port_guid') == table['port_guid'] for t in active)):
                    returns.append(step)
            if len(returns) != 1 or returns[0] <= previous_end:
                raise ValueError('filter_unique_table_return')
            end = next((n for n, state in observations if n > returns[0]
                        and state.get('prepared_node_context', {}).get('surface') == 'graph'), None)
            if end is None:
                raise ValueError('filter_return_graph_missing')
            selected = lambda n: n <= shared_end or previous_end < n <= end
            observed = [(n, state) for n, state in observations if selected(n)]
            changed = [(n, action, receipt) for n, action, receipt in mutations if selected(n)]
            selected_checkpoint = {**checkpoint, 'output': {**output, 'ports': [port],
                'format_restoration': item.get('format_restoration'), 'workflow_return': item['workflow_return']}}
            marker = '__FILTER_ORACLE_NULL__'
            rows = expected_ports[index]
            if (not expected_columns or len({c['name'] for c in expected_columns}) != len(expected_columns)
                    or any(len(row) != len(expected_columns) or marker in row for row in rows)):
                raise ValueError('filter_oracle_shape')
            stream = io.StringIO(newline='')
            writer = csv.writer(stream, delimiter=';', lineterminator='\n')
            writer.writerow([c['name'] for c in expected_columns])
            writer.writerows([[marker if value is None else value for value in row] for row in rows])
            settings = dict(source=dict(encoding='UTF-8', rows_to_skip=0, first_line_as_title=True),
                format=dict(delimiter=';', text_qualifier='"', decimal_separator='.', null_marker=marker),
                columns=[dict(c, used=True) for c in expected_columns])
            comparison = {**request, 'target': {**request['target'], 'kind': 'existing'}, 'mappings': [], 'parameters': dict(settings=settings)}
            errors = verify_table_output_observations(observed, changed, comparison, stream.getvalue().encode(),
                selected_checkpoint, execution_id, output_port_index=index)
            failures.extend('port_'+str(index)+':'+error for error in errors)
            previous_end = end
    except (KeyError, IndexError, TypeError, AttributeError, ValueError) as error:
        failures.append(str(error) if isinstance(error, ValueError) else 'filter_output_malformed')
    return dict(passed=not failures, failures=sorted(set(failures)), execution_id=execution_id,
        scope='both_fresh_native_filter_outputs_against_independent_expected',
        source_identity_verified=False, package_persistence_verified=False)
