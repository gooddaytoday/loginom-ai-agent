"""Proposed orientation/schema changes from authored variables, no Loginom imports."""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def expected():
    source = json.loads((HERE.parents[1] / 'fixtures/modes.json').read_text())

    def table(items, mode):
        if mode == 'rows':
            return {'columns': [{'name': n, 'type': t} for n, t in
                                [('Name', 'string'), ('DisplayName', 'string'), ('Value', 'variant')]],
                    'rows': [{'Name': v['name'], 'DisplayName': v['label'],
                              'Value': {'cell_type': v.get('cell_type', v['type']),
                                        'is_null': v['value'] is None, 'value': v['value']}} for v in items]}
        return {'columns': [{k: v[k] for k in ('name', 'label', 'type')} for v in items],
                'rows': [{v['name']: ({'cell_type': v['cell_type'], 'is_null': False, 'value': v['value']}
                                      if v['type'] == 'variant' else v['value']) for v in items}]}

    return {'status': 'proposal_pending_owner_approval', 'output_port': 0,
            'same_node_and_links': True,
            'initial_columns': table(source['initial'], 'columns'),
            'switch_rows': table(source['initial'], 'rows'),
            'changed_rows': table(source['changed'], 'rows'),
            'switch_back_columns': table(source['changed'], 'columns'),
            'variant_columns': table(source['variant'], 'columns'),
            'variant_rows': table(source['variant'], 'rows'),
            'empty_rows': table([], 'rows'),
            'empty_columns': {'status': 'unresolved_native_zero_column_cardinality'},
            'disconnected_input': {'status': 'not_equivalent_to_connected_empty_source'}}


def matcher(items, mode):
    """Same tables in the production matcher format (typed Variant cells, NULL as null)."""
    def cell(v):
        return v['value'] if v['value'] is None or v['type'] != 'variant' else {'cell_type': v['cell_type'], 'value': v['value']}
    if mode == 'rows':
        columns = [{'name': 'Name', 'label': 'Имя', 'type': 'string'}, {'name': 'DisplayName', 'label': 'Метка', 'type': 'string'},
                   {'name': 'Value', 'label': 'Значение', 'type': 'variant'}]
        rows = [{'Name': v['name'], 'DisplayName': v['label'],
                 'Value': None if v['value'] is None else {'cell_type': v.get('cell_type', v['type']), 'value': v['value']}} for v in items]
    else:
        columns = [dict({k: v[k] for k in ('name', 'label', 'type')}, **({'tolerance': {'abs': 0, 'rel': 0}} if v['type'] == 'real' else {})) for v in items]
        rows = [{v['name']: cell(v) for v in items}]
    return {'output_node_type': 'variables.to_table', 'output_port': 0, 'ordered': True, 'column_order': 'exact',
            'columns': columns, 'rows': rows}


def run_files():
    """expected-phases.json: ordered live checkpoints; expected-run.json: final cold state."""
    source = json.loads((HERE.parents[1] / 'fixtures/modes.json').read_text())
    phases = {'switch_rows': matcher(source['initial'], 'rows'), 'changed_rows': matcher(source['changed'], 'rows'),
              'switch_back_columns': matcher(source['changed'], 'columns')}
    final = {'package_path': '{{PACKAGE_PATH}}', 'nodes': [{'type': 'variables.user'}, {'type': 'variables.to_table'}],
             'outputs': [phases['switch_back_columns']]}
    return {'expected-phases.json': phases, 'expected-run.json': final}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = expected()
    path = HERE / 'expected.json'
    if args.write:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        for name, value in run_files().items():
            (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    else:
        assert json.loads(path.read_text()) == result
        for name, value in run_files().items():
            assert json.loads((HERE / name).read_text()) == value, name
        assert len(result['switch_rows']['rows']) == 4
        assert result['changed_rows']['rows'][-1]['Value']['value'] == 0.125
        assert result['empty_rows']['rows'] == []
        assert result['variant_rows']['rows'][0]['Value']['cell_type'] == 'string'
        print('PASS: proposed switch/update/Variant/empty rows expectations')
