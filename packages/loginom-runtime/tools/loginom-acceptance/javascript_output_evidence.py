"""Exact integer/string business oracle against independently observed native Table.

Materialization and final Execute are separate fresh native groups. No generated
JavaScript is executed here. Native bytes, model and saved package are out of scope.
"""
import csv
import io
from javascript_configuration_evidence import javascript_operation
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_table_output_observations


def verify_javascript_output(events, request, expected_columns, expected_rows, *, expected_target=None, expected_origin=None):
    failures = []
    execution_id = materialization_id = None
    try:
        if (not expected_columns or len({c['name'] for c in expected_columns}) != len(expected_columns)
                or any(c['type'] not in ('integer','string') for c in expected_columns)
                or request.get('read', {}).get('coverage') != 'full'
                or request['read'].get('ports') != [0] or request['read'].get('require_exact_numbers') is not True
                or type(request['read'].get('sample_rows')) is not int or request['read']['sample_rows'] < len(expected_rows)):
            raise ValueError('javascript_full_business_oracle')
        for row in expected_rows:
            if len(row) != len(expected_columns):
                raise ValueError('javascript_oracle_shape')
            for cell,column in zip(row,expected_columns):
                if cell is None:
                    continue
                if column['type'] == 'string' and not isinstance(cell,str):
                    raise ValueError('javascript_oracle_string')
                if column['type'] == 'integer' and (type(cell) is not int or not -(2**63) <= cell < 2**63):
                    raise ValueError('javascript_oracle_integer')
        operation = javascript_operation(events,request,expected_target=expected_target,expected_origin=expected_origin)
        phases = operation['phases']
        identities = []
        final_observations = final_mutations = None
        for start,end in [('materialization_start','materialization_execute'),('finish','read')]:
            steps = {r.get('step') for r in operation['rows'][phases[start]['start']+1:phases[end]['end']]
                if r.get('internal_provenance') == 'client_node_procedure_v1'}
            observations = [(n,s) for n,s in operation['sequence']['observations'] if n in steps]
            mutations = [(n,a,o) for n,a,o in operation['sequence']['mutations'] if n in steps]
            proof = verify_execution_observations(observations,mutations,operation['node'],launch_mode='graph')
            failures.extend(proof['failures'])
            identity = proof['execution_id']
            execution = phases['materialization_execute' if start == 'materialization_start' else 'execute']['value']
            if (not identity or execution.get('execution_id') != identity or execution.get('status') != 'completed'
                    or execution.get('owner_verified') is not True or phases[start]['value'].get('execution_id') != identity
                    or phases[start]['value'].get('execution_started') is not True):
                failures.append('javascript_native_execution_binding:'+start)
            identities.append(identity)
            final_observations, final_mutations = observations, mutations
        materialization_id, execution_id = identities
        if not execution_id or execution_id == materialization_id:
            failures.append('javascript_two_fresh_executions')
        checkpoint = operation['result']
        marker = '__JAVASCRIPT_INDEPENDENT_ORACLE_NULL__'
        if any(marker in row for row in expected_rows):
            raise ValueError('javascript_oracle_null_marker_collision')
        stream = io.StringIO(newline='')
        writer = csv.writer(stream,delimiter=';',lineterminator='\n')
        writer.writerow([c['name'] for c in expected_columns])
        writer.writerows([[marker if v is None else v for v in row] for row in expected_rows])
        columns = [dict(c,label=c.get('label',c['name']),used=True) for c in expected_columns]
        comparison = {**request, 'target':{**request['target'],'kind':'existing'},'mappings':[],
            'parameters':dict(settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
                format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker=marker),columns=columns))}
        failures.extend(verify_table_output_observations(final_observations,final_mutations,comparison,
            stream.getvalue().encode('utf-8'),checkpoint,execution_id))
        output = checkpoint['output']
        if (output != phases['read']['value'] or output.get('verified') is not True
                or output.get('status') != 'complete' or checkpoint.get('execution', {}).get('execution_id') != execution_id):
            failures.append('javascript_output_checkpoint_binding')
        port = output['ports'][0]
        if (port.get('fresh') is not True or port.get('sample_complete') is not True
                or port.get('row_count') != len(expected_rows) or port.get('sample_rows') != len(expected_rows)
                or len(port.get('schema', [])) != len(expected_columns)):
            failures.append('javascript_output_full_schema')
        for i,column in enumerate(expected_columns):
            schema = port['schema'][i]
            if type(schema.get('index')) is not int or schema['index'] != i or any(schema.get(k) != column.get(k,column['name'] if k == 'label' else None) for k in ('name','label','type')):
                failures.append('javascript_output_schema:'+str(i))
        for i,row in enumerate(expected_rows):
            if len(port['sample'][i]) != len(expected_columns):
                raise ValueError('javascript_typed_row_width')
            for j,(value,column) in enumerate(zip(row,expected_columns)):
                cell = port['sample'][i][j]
                if cell.get('type') != column['type'] or cell.get('is_null') is not (value is None):
                    failures.append('javascript_typed_null_or_type:'+str(i)+':'+str(j))
                if value is None:
                    if cell.get('value') is not None:
                        failures.append('javascript_typed_null_value:'+str(i)+':'+str(j))
                    continue
                representation, precision = ('decimal_integer','exact_integer') if column['type'] == 'integer' else ('cached_display_text','display_text')
                wanted = str(value) if column['type'] == 'integer' else value
                if (cell.get('value') != wanted or cell.get('representation') != representation or cell.get('precision') != precision):
                    failures.append('javascript_typed_exact_value:'+str(i)+':'+str(j))
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'javascript_output_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),execution_id=execution_id,
        materialization_execution_id=materialization_id,scope='fresh_native_javascript_full_integer_string_table',
        journal_authenticated=False,native_bytes_verified=False,package_persistence_verified=False,cli_verified=False)


if __name__ == '__main__':
    import argparse
    import json
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--journal',type=Path,required=True)
    parser.add_argument('--request',type=Path,required=True)
    parser.add_argument('--expected',type=Path,required=True,help='Independent operator oracle: schema and ordered_rows')
    args = parser.parse_args()
    oracle = json.loads(args.expected.read_text())
    proof = verify_javascript_output([json.loads(line) for line in args.journal.read_text().splitlines()],
        json.loads(args.request.read_text()),oracle['schema'],oracle['ordered_rows'])
    print(json.dumps(proof,ensure_ascii=False))
    raise SystemExit(0 if proof['passed'] else 1)
