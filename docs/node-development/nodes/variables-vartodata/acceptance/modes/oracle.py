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


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = expected()
    path = HERE / 'expected.json'
    if args.write:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        assert json.loads(path.read_text()) == result
        assert len(result['switch_rows']['rows']) == 4
        assert result['changed_rows']['rows'][-1]['Value']['value'] == 0.125
        assert result['empty_rows']['rows'] == []
        assert result['variant_rows']['rows'][0]['Value']['cell_type'] == 'string'
        print('PASS: proposed switch/update/Variant/empty rows expectations')
