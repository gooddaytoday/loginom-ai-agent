"""Check raw fresh table cells against an independently supplied expected table.

Expected rows belong to the fixture/business oracle, never to a node result.
Source upload and persisted package identities must be audited separately.
"""
import csv
import io
from node_procedure_evidence import verify_internal_sequence
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_table_output_observations


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
        # Reuse the independently tested native table/format/cell auditor with a
        # CSV serialization of the expected *output*, not a simulated import.
        marker='__CALCULATOR_ORACLE_NULL__'
        if (not expected_columns or len({c['name'] for c in expected_columns})!=len(expected_columns)
                or any(len(row)!=len(expected_columns) or marker in row for row in expected_rows)):
            raise ValueError('calculator_oracle_shape')
        stream=io.StringIO(newline='');writer=csv.writer(stream,delimiter=';',lineterminator='\n')
        writer.writerow([c['name'] for c in expected_columns]);writer.writerows([[marker if v is None else v for v in row] for row in expected_rows])
        settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
            format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker=marker),
            columns=[dict(c,used=True) for c in expected_columns])
        comparison={**request,'target':{**request['target'],'kind':'existing'},'mappings':[], 'parameters':dict(settings=settings)}
        failures.extend(verify_table_output_observations(sequence['observations'],sequence['mutations'],comparison,
            stream.getvalue().encode(),checkpoint,execution_id))
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'calculator_output_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),execution_id=execution_id,
        scope='fresh_calculator_table_against_independent_expected',source_identity_verified=False,package_persistence_verified=False)
