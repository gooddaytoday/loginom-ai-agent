"""Check fresh source-port cells against an independently supplied expected table.

Expected rows belong to the fixture/business oracle, never to a node result.
Source upload and persisted package identities must be audited separately.
"""
from node_procedure_evidence import verify_internal_sequence
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_port_output


def verify_calculator_output(events,request,expected_columns,expected_rows, *, launch_mode='graph'):
    failures=[];execution_id=None
    try:
        sequence=verify_internal_sequence(events,request['operation_id'],max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints=[r['result'] for r in events if r.get('operation_id')==request['operation_id'] and r.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0].get('status')!='SUCCEEDED':raise ValueError('calculator_output_checkpoint')
        checkpoint=checkpoints[0]
        if launch_mode not in ('graph', 'wizard'):
            raise ValueError('unsupported_output_launch_mode')
        proof=verify_execution_observations(sequence['observations'],sequence['mutations'],checkpoint['node'],launch_mode=launch_mode)
        failures.extend(proof['failures']);execution_id=proof['execution_id']
        ports=checkpoint.get('output',{}).get('ports',[])
        if (checkpoint.get('execution',{}).get('execution_id')!=execution_id
                or checkpoint.get('execution',{}).get('status')!='completed'):
            failures.append('output_checkpoint_execution_identity')
        if len(ports)!=1 or request['read']['ports']!=[0]:
            raise ValueError('calculator_output_port')
        port=ports[0]
        failures.extend(verify_port_output(port,expected_columns,expected_rows,execution_id,0))
        wanted=min(request['read'].get('sample_rows',10),len(expected_rows))
        count=port.get('sample_rows')
        if (type(count) is not int or not 0<=count<=wanted
                or count<wanted and port.get('read_limit')!='preview_cell_or_byte_budget'):
            failures.append('port_output_requested_coverage')
        reads=[r.get('outcome',{}).get('output',{}) for r in events
            if r.get('operation_id')==request['operation_id'] and r.get('phase')=='node_port_output_read']
        if (len(reads)!=1 or any(reads[0].get(k)!=port.get(k) for k in
                ('port','port_guid','execution_id','sample','row_count','sample_rows','sample_complete','read_limit'))
                or [{k:c.get(k) for k in ('index','name','label','type')} for c in reads[0].get('schema',[])]
                !=[{k:c.get(k) for k in ('index','name','label','type')} for c in port.get('schema',[])]):
            failures.append('port_output_read_receipt')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'calculator_output_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),execution_id=execution_id,
        scope='fresh_calculator_port_against_independent_expected',source_identity_verified=False,package_persistence_verified=False)
