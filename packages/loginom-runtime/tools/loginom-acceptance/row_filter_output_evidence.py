"""Audit requested Filter port samples against independent business expectations."""
from node_procedure_evidence import verify_internal_sequence
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_port_output, verify_port_output_receipts


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
        ports = output['ports']
        if (len(ports) != 2 or [p['port'] for p in ports] != request['read']['ports']
                or set(request['read']['ports']) != {0, 1} or len(expected_ports) != 2
                or len({p['port_guid'] for p in ports}) != 2):
            raise ValueError('filter_both_distinct_outputs')
        if checkpoint.get('execution', {}).get('execution_id') != execution_id or checkpoint.get('execution', {}).get('status') != 'completed':
            failures.append('output_checkpoint_execution_identity')
        failures.extend(verify_port_output_receipts(events, request['operation_id'], ports))
        for port in ports:
            index = port['port']
            failures.extend('port_'+str(index)+':'+error for error in verify_port_output(port, expected_columns,
                expected_ports[index], execution_id, index, sample_rows=request['read']['sample_rows']))
    except (KeyError, IndexError, TypeError, AttributeError, ValueError) as error:
        failures.append(str(error) if isinstance(error, ValueError) else 'filter_output_malformed')
    return dict(passed=not failures, failures=sorted(set(failures)), execution_id=execution_id,
        scope='both_fresh_native_filter_outputs_against_independent_expected',
        source_identity_verified=False, package_persistence_verified=False)
