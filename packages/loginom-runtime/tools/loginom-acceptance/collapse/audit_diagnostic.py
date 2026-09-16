"""Independent bounded audit of node16 configuration/display diagnostics.
This deliberately never returns full exact-variant acceptance.
"""
import argparse
import copy
import json
from pathlib import Path

EXPECTED = json.loads((Path(__file__).parent / 'expected.json').read_text())

def audit(result, operation_id, node_id, ignore_empty, executed):
    def need(condition, message):
        if not condition:
            raise ValueError(message)
    need(result.get('status') == 'SUCCEEDED' and result.get('operation_id') == operation_id, 'operation result')
    out = result['output']
    need(out['operation_id'] == operation_id and out['node']['node_id'] == node_id, 'node identity')
    need(out['cleanup_complete'] is True and out['package_saved'] is False, 'completion scope')
    need(out.get('persisted_package_verified') is False, 'local checkpoint is not persistence')
    phases = out['phases']
    required = ['source', 'workflow', 'target', 'input_mapping', 'open', 'configure', 'node_finish', 'output_mapping', 'finish']
    if executed:
        required += ['execute', 'read']
    need([p['phase'] for p in phases] == required, 'complete ordered phase list')
    need(all(p['status'] == 'verified' and p['receipt_id'] == operation_id + ':' + p['phase'] for p in phases), 'phase ownership')
    r = out['configuration']['readback']
    need(r['kind'] == 'collapse' and r['mode'] == 'unpivot' and r['node'] == out['node'], 'readback identity')
    need(r['package_persistence_verified'] is False and r['values_are'] == 'observed_ui_values', 'readback evidence scope')
    for key in ['information', 'transposed']:
        need([x['name'] for x in r[key]] == EXPECTED[key], key + ' names/order')
        need([x['order'] for x in r[key]] == list(range(len(EXPECTED[key]))), key + ' native order')
    need(r['ignore_empty'] is ignore_empty, 'Null policy')
    mapping = r['output_mapping']
    need(mapping['port'] == 0 and mapping['autosync'] is False, 'output options')
    need([{k: f[k] for k in ['name', 'label', 'type', 'excluded']} for f in mapping['fields']] == EXPECTED['output'], 'full output mapping')
    need([f['source_name'] for f in mapping['fields']] == [f['name'] for f in EXPECTED['output']], 'output sources')
    if executed:
        execution = out['execution']
        need(execution['status'] == 'completed' and bool(execution['execution_id']), 'execution')
        ports = out['output']['ports']
        need(len(ports) == 1, 'one output')
        p = ports[0]
        need(p['port'] == 0 and p['fresh'] is True and p['execution_id'] == execution['execution_id'], 'output freshness')
        need(p['port_guid'] == p['table']['port_guid'], 'table port')
        schema = [f for f in EXPECTED['output'] if not f['excluded']]
        need([{k: f[k] for k in ['name', 'label', 'type']} for f in p['schema']] == [{k: f[k] for k in ['name', 'label', 'type']} for f in schema], 'display schema')
        count = EXPECTED['rows_ignore' if ignore_empty else 'rows_all']
        need(p['row_count'] == count and p['sample_rows'] == min(10, count) and len(p['sample']) == min(10, count), 'bounded sample count')
        need(p['sample_complete'] is (count <= 10), 'sample completion')
        expected_names = ['S', 'I', 'R', 'B', 'D', 'S', 'I', 'R', 'B'] + ([] if ignore_empty else ['D'])
        need([row[2]['value'] for row in p['sample']] == expected_names, 'row-major transposition')
        need(all(len(row) == 5 for row in p['sample']), 'cell cardinality')
        need('variant_display_precision' in p['precision']['limitations'], 'explicit variant limitation')
        need(all(cell[4]['type'] == 'variant' and (cell[4]['is_null'] or (cell[4]['precision'] == 'unverified' and 'value' not in cell[4])) for cell in p['sample']), 'no invented native variant value')
    return {'independent_configuration_display_audit': 'PASS', 'exact_variant_acceptance': 'BLOCKED', 'package_persistence': 'requires_separate_reopen_evidence'}

def mutations(result, operation_id, node_id, ignore_empty, executed):
    edits = [lambda r: r.update(operation_id='foreign'), lambda r: r['output']['node'].update(node_id='foreign'),
             lambda r: r['output']['phases'][3].update(receipt_id='foreign'), lambda r: r['output']['phases'].pop(),
             lambda r: r['output']['configuration']['readback'].update(ignore_empty=not ignore_empty),
             lambda r: r['output']['configuration']['readback']['transposed'].reverse(),
             lambda r: r['output']['configuration']['readback']['output_mapping']['fields'][4].update(type='string'),
             lambda r: r['output']['configuration']['readback']['output_mapping']['fields'][-1].update(excluded=False),
             lambda r: r['output']['configuration']['readback']['output_mapping']['fields'][2].update(label='wrong')]
    if executed:
        edits += [lambda r: r['output']['output']['ports'][0].update(row_count=999),
                  lambda r: r['output']['output']['ports'][0].update(execution_id='old'),
                  lambda r: r['output']['output']['ports'][0]['sample'][0][4].update(value=1, precision='exact'),
                  lambda r: r['output']['output']['ports'][0]['sample'].pop()]
    for change in edits:
        altered = copy.deepcopy(result)
        change(altered)
        try:
            audit(altered, operation_id, node_id, ignore_empty, executed)
        except (ValueError, KeyError):
            continue
        raise AssertionError('negative mutation accepted')
    return len(edits)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('result', type=Path)
    p.add_argument('--operation', required=True)
    p.add_argument('--node', required=True)
    p.add_argument('--ignore-empty', action='store_true')
    p.add_argument('--executed', action='store_true')
    a = p.parse_args()
    r = json.loads(a.result.read_text())
    report = audit(r, a.operation, a.node, a.ignore_empty, a.executed)
    report['negative_mutations_rejected'] = mutations(r, a.operation, a.node, a.ignore_empty, a.executed)
    print(json.dumps(report, indent=2))
