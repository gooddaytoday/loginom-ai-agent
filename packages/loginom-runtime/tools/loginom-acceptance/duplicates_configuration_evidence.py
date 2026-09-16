"""Independent audit of Duplicates roles, complete mappings and finish ownership."""
from node_procedure_evidence import verify_internal_sequence

SERVICES = [('Duplicate', 'Дубликат', 'boolean'), ('DuplicateGroup', 'Группа дубликата', 'integer'),
            ('Contradiction', 'Противоречие', 'boolean'), ('ContradictionGroup', 'Группа противоречия', 'integer')]


def verify_duplicates_configuration(events, request):
    failures = []
    try:
        op = request['operation_id']
        if request['target']['type'] != 'research.duplicates' or request['mode'] != 'mark' or request['mappings']:
            raise ValueError('duplicates_contract')
        seq = verify_internal_sequence(events, op, max_steps=4096)
        failures.extend(seq['failures'])
        checks = [e['result'] for e in events if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint']
        if len(checks) != 1 or checks[0]['status'] != 'SUCCEEDED':
            raise ValueError('duplicates_checkpoint')
        result = checks[0]; node = result['node']
        def need(value, reason):
            if not value:
                raise ValueError(reason)
        def owned(c):
            return c.get('verified') is True and all(c.get(k) == node[k] for k in ('document_id', 'workflow_id', 'node_id'))
        def phase(name):
            starts = [i for i, e in enumerate(events) if e.get('operation_id') == op and e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == name]
            ends = [(i, e['receipt']) for i, e in enumerate(events) if e.get('operation_id') == op and e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == name]
            need(len(starts) == len(ends) == 1 and starts[0] < ends[0][0], 'duplicates_phase_order:' + name)
            end, receipt = ends[0]
            need(receipt['status'] == 'verified' and receipt['receipt_id'] == op + ':' + name, 'duplicates_phase_receipt:' + name)
            value = receipt['value']
            need(value.get('verified') is True and value.get('cleanup_complete') is True, 'duplicates_phase_cleanup:' + name)
            steps = {e.get('step') for e in events[starts[0]+1:end] if e.get('operation_id') == op}
            return value, [s for n, s in seq['observations'] if n in steps]
        config, observations = phase('configure')
        raw = [s['node_duplicates'] for s in observations if s.get('node_duplicates')]
        need(bool(raw) and all(owned(c['node_context']) and c.get('inventory_complete') is True for c in raw), 'duplicates_native_roles')
        before, after = raw[0], raw[-1]
        def stable(c):
            return [{k: v for k, v in f.items() if k not in ('usage_type', 'selected', 'origin_type')} for f in c['fields']]
        need(stable(before) == stable(after), 'duplicates_unrelated_field_change')
        fields = after['fields']; p = request['parameters']
        names = [f['name'] for f in fields]; keys = p['input_fields']; values = p['output_fields']
        need(bool(keys) and len(set(names)) == len(names), 'duplicates_unique_fields')
        need(len(set(keys + values)) == len(keys + values) and set(keys + values) <= set(names), 'duplicates_declared_roles')
        need(all(f['usage_type'] == (3 if f['name'] in keys else 4 if f['name'] in values else 0) for f in fields), 'duplicates_requested_roles')
        need(config['validation']['status'] == 'accepted_by_loginom_next' and owned(config['validation']['node_context']), 'duplicates_roles_validation')
        c = config['configuration']
        need(owned(c['node_context']) and c.get('source_identity_verified') is True, 'duplicates_configuration_owner')
        need([{k:v for k,v in f.items() if k != 'input_field'} for f in c['fields']] == fields, 'duplicates_configuration_projection')
        incoming, input_states = phase('input_mapping'); outgoing, output_states = phase('output_mapping')
        im = incoming['native_mapping']; om = outgoing['native_mapping']
        for direction, value, states in [('input', incoming, input_states), ('output', outgoing, output_states)]:
            m = value['native_mapping']; finish = value['finish']
            need(m in [s.get('node_mapping') for s in states], 'duplicates_raw_mapping:' + direction)
            need(owned(m['node_context']) and m.get('inventory_complete') is True and m.get('source_identity_verified') is True and m['node_context'].get(direction + '_port', {}).get('port') == 0, 'duplicates_mapping_owner:' + direction)
            need(finish.get('settings_applied') is True and owned(finish['node_context']), 'duplicates_mapping_finish:' + direction)
            sources = {s['record_id']: s for s in m['source_fields']}; seen = set()
            need(len(sources) == len(m['source_fields']) == len(m['target_fields']), 'duplicates_mapping_cardinality:' + direction)
            for index, f in enumerate(m['target_fields']):
                s = f['source']
                need(f['index'] == index and sources.get(s['record_id']) == s and s['record_id'] not in seen, 'duplicates_mapping_correspondence:' + direction)
                seen.add(s['record_id'])
                if direction == 'output':
                    need(f.get('excluded') is False and all(f[k] == s[k] for k in ('name', 'label', 'type')), 'duplicates_output_preservation')
        need(len(im['target_fields']) == len(fields), 'duplicates_input_count')
        for f, bound in zip(fields, c['fields']):
            candidates = [t for t in im['target_fields'] if t['field_id'] == f['field_id']]
            need(len(candidates) == 1, 'duplicates_input_field_identity')
            t = candidates[0]; source = t['source']
            need(all(t[k] == f[k] for k in ('index', 'name', 'label', 'type', 'data_kind')), 'duplicates_effective_input')
            expected = dict(field_id=t['field_id'], name=t['name'], label=t['label'], type=t['type'], index=t['index'], source_name=source['name'], source_field_id=source['field_id'])
            need(bound['input_field'] == expected, 'duplicates_input_projection')
        def schema(fs):
            return sorted((f['name'], f['label'], f['type']) for f in fs)
        need(schema(om['source_fields']) == sorted(SERVICES + schema(fields)), 'duplicates_service_schema')
        for name, mode in [('node_finish', 'done'), ('finish', request['finish'])]:
            f, _ = phase(name)
            need(f.get('settings_applied') is True and owned(f['node_context']) and f['mode'] == mode and mode in ('done', 'execute'), 'duplicates_finish:' + name)
        rb = result['configuration']['readback']
        need(rb['kind'] == 'duplicates' and rb['node'] == node and rb['package_persistence_verified'] is False, 'duplicates_readback_owner')
        need(rb['fields'] == [{k:f[k] for k in ('index','field_id','name','label','type','data_kind','usage_type','input_field')} for f in c['fields']], 'duplicates_readback_roles')
        need(rb['output_mapping'] == dict(port=0, fields=[dict(name=f['name'],label=f['label'],type=f['type'],source_name=f['source']['name']) for f in om['target_fields']]), 'duplicates_readback_output')
    except (KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), scope='duplicates_raw_configuration', package_persistence_verified=False)
