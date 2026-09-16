"""Audit raw observations/receipts independently of the JS date handler."""
import re
from node_procedure_evidence import verify_internal_sequence
from date_time_removal_evidence import verify_removals
from date_time_output_evidence import initial_output_mapping, verify_output_mapping

# Native semantics confirmed in the real 7.4.2 wizard, not imported from JS.
OPERATIONS = {
    'year': (4, 'number', 'Y', 'Год', 'integer'),
    'quarter': (5, 'number', 'Q', 'Квартал', 'integer'),
    'month': (6, 'number', 'M', 'Месяц', 'integer'),
    'day_of_month': (10, 'number', 'DM', 'День месяца', 'integer'),
    'hour': (12, 'number', 'HRS', 'Часы', 'integer'),
    'year_start': (4, 'first', 'Y', 'Год, Первый день', 'datetime'),
    'year_end': (4, 'last', 'Y', 'Год, Последний день', 'datetime'),
    'quarter_start': (0, 'first', 'YQ', 'Год + Квартал, Первый день', 'datetime'),
    'quarter_end': (0, 'last', 'YQ', 'Год + Квартал, Последний день', 'datetime'),
    'month_start': (1, 'first', 'YM', 'Год + Месяц, Первый день', 'datetime'),
    'month_end': (1, 'last', 'YM', 'Год + Месяц, Последний день', 'datetime'),
    'date': (16, 'first', 'D', 'Дата', 'datetime'),
}

def verify_date_time_configuration(events, request):
    failures, projection = [], []
    try:
        op = request['operation_id']
        if request['target']['type'] != 'transform.date_time' or request['mode'] != 'calendar':
            raise ValueError('date_time_request')
        sequence = verify_internal_sequence(events, op, max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints = [e['result'] for e in events if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint']
        if len(checkpoints) != 1 or checkpoints[0]['status'] != 'SUCCEEDED':
            raise ValueError('date_time_checkpoint')
        result, observations = checkpoints[0], sequence['observations']
        node = result['node']
        def owned(c):
            return c.get('verified') is True and all(c.get(k) == node[k] for k in ('document_id', 'workflow_id', 'node_id'))
        native = [s['node_date_time'] for _, s in observations if s.get('node_date_time')]
        if not native or any(not owned(c.get('node_context', {})) or c.get('inventory_complete') is not True for c in native):
            raise ValueError('date_time_native_owner')
        first, last = {}, {}
        for c in native:
            name = c['selected']['name']
            first.setdefault(name, c['matrix'])
            last[name] = c['matrix']
        if set(last) != {f['name'] for f in native[-1]['fields']}:
            raise ValueError('date_time_field_coverage')
        requested = {f['field']['name']: f['transformations'] for f in request['parameters'].get('fields', [])}
        receipts = [e['receipt'] for e in events if e.get('operation_id') == op and e.get('phase') == 'node_phase_completed']
        def phase(name):
            xs = [r for r in receipts if r['phase'] == name]
            if len(xs) != 1 or xs[0]['status'] != 'verified' or xs[0]['receipt_id'] != op + ':' + name:
                raise ValueError('date_time_phase_' + name)
            value = xs[0]['value']
            if value.get('verified') is not True or value.get('cleanup_complete') is not True:
                raise ValueError('date_time_unverified_phase')
            return value
        config, out, incoming = phase('configure'), phase('output_mapping'), phase('input_mapping')
        if config['validation']['status'] != 'accepted_by_loginom_next' or not owned(config['validation']['node_context']):
            raise ValueError('date_time_validation')
        if {f['name']: f['matrix'] for f in config['configuration']['field_matrices']} != last:
            raise ValueError('date_time_matrix_projection')
        for name, matrix in last.items():
            if len(matrix) != 29 or len({(r['func'], r['iso']) for r in matrix}) != 29:
                raise ValueError('date_time_matrix_incomplete')
            actual = {(r['func'], key, r['iso']) for r in matrix for key in ('first', 'last', 'number', 'string') if r[key]}
            if name in requested:
                expected = {(OPERATIONS[t['operation']][0], OPERATIONS[t['operation']][1], False) for t in requested[name]}
                if actual != expected:
                    raise ValueError('date_time_requested_flags')
            elif matrix != first[name]:
                raise ValueError('date_time_unrequested_field_changed')
        raw_maps = [s['node_mapping'] for _, s in observations if s.get('node_mapping')]
        verify_removals(request, config, phase('open'), first, raw_maps, OPERATIONS)
        for direction, value in [('input', incoming), ('output', out)]:
            m = value['native_mapping']
            if m not in raw_maps or not owned(m['node_context']) or m.get('inventory_complete') is not True or m['node_context'].get(direction + '_port', {}).get('port') != 0:
                raise ValueError('date_time_mapping_owner')
            if not value['finish'].get('settings_applied') or not owned(value['finish']['node_context']):
                raise ValueError('date_time_mapping_finish')
            source_ids = {s['record_id']: s for s in m['source_fields']}
            seen = set()
            for i, f in enumerate(m['target_fields']):
                source = f.get('source') or f.get('exclusion_source')
                if not source or source_ids.get(source['record_id']) != source or source['record_id'] in seen or f['index'] != i:
                    raise ValueError('date_time_mapping_origin')
                seen.add(source['record_id'])
            if seen != set(source_ids):
                raise ValueError('date_time_mapping_bijection')
        inputs = incoming['native_mapping']['target_fields']
        input_request = next((m for m in request['mappings'] if m['direction'] == 'input' and m['port'] == 0), {})
        if 'autosync' in input_request and incoming['native_mapping']['autosync'] != input_request['autosync']:
            raise ValueError('date_time_requested_input_autosync')
        if 'fields' in input_request:
            desired = input_request['fields']
            if (len(inputs) != len(desired) or any(w['source']['kind'] != 'configured_field'
                    or f['source']['name'] != w['source']['name'] for f, w in zip(inputs, desired))):
                raise ValueError('date_time_requested_input_order')
            originals = next(m['target_fields'] for m in raw_maps if m['mapping_wizard'] == 'TuneDataSourceMappingWizard'
                             and m.get('source_identity_verified') is True and len(m['target_fields']) == len(inputs)
                             and all(t.get('source') for t in m['target_fields']))
            for field, wanted in zip(inputs, desired):
                original = next(t for t in originals if t.get('source', {}).get('name') == wanted['source']['name'])
                if any(field[k] != wanted.get(k, original[k]) for k in ('name', 'label')) or field['type'] != original['type']:
                    raise ValueError('date_time_requested_input_field')
        native_sources = out['native_mapping']['source_fields']
        generated, assigned = {}, set()
        for name, matrix in last.items():
            source_input = next(f for f in inputs if f['name'] == name)
            for operation, (func, flag, suffix, label, kind) in OPERATIONS.items():
                if not any(r['func'] == func and not r['iso'] and r[flag] for r in matrix):
                    continue
                matches = [s for s in native_sources if s['required'] and s['type'] == kind
                           and s['label'] == source_input['label'] + ' (' + label + ')'
                           and re.fullmatch(re.escape(name + '_' + suffix) + r'_\d+', s['name'])]
                if len(matches) != 1 or matches[0]['record_id'] in assigned:
                    raise ValueError('date_time_generated_origin')
                s = matches[0]
                assigned.add(s['record_id'])
                wanted = next((t for t in requested.get(name, []) if t['operation'] == operation), None)
                generated[s['record_id']] = dict(input=name, operation=operation, configured_name=wanted['name'] if wanted else None,
                                                  configured_label=wanted['label'] if wanted else None)
        if assigned != {s['record_id'] for s in native_sources if s['required']}:
            raise ValueError('date_time_generated_coverage')
        mapping = next((m for m in request['mappings'] if m['direction'] == 'output'), {})
        if ('autosync' in mapping or 'fields' in mapping) and out['native_mapping']['autosync'] != mapping.get('autosync', False):
            raise ValueError('date_time_requested_output_autosync')
        baseline = initial_output_mapping(events, op, node)
        projection = verify_output_mapping(baseline, out['native_mapping'], generated, mapping)
        for name in ('node_finish', 'finish'):
            f = phase(name)
            if not f.get('settings_applied') or not owned(f['node_context']) or f['mode'] != ('done' if name == 'node_finish' else request['finish']):
                raise ValueError('date_time_finish')
    except (KeyError, IndexError, TypeError, ValueError, AttributeError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), projection=projection, scope='date_time_raw_configuration')
