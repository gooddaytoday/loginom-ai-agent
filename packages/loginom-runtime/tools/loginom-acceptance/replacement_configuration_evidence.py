"""Independent audit of raw Replacement observations and mutation ownership.

The enclosing scenario audit must separately establish source/session pins,
persistence and fresh output. Handler-produced success flags are insufficient.
"""
from decimal import Decimal
from node_procedure_evidence import verify_internal_sequence


def scalar(value):
    kind, raw = value['type'], value['value']
    if raw is None: return (kind, None)
    if kind == 'integer': return (kind, int(raw))
    if kind == 'real': return (kind, Decimal(str(raw)))
    if kind == 'string' and isinstance(raw, str): return (kind, raw)
    raise ValueError('replacement_scalar')


def rule_from_native(native):
    field = next(f for f in native['input_fields'] if f['name'] == native['selected'])
    return dict(field=dict(kind='input_field', name=field['name']), type=field['type'],
                pairs=[dict(from_=scalar(p['from']), to=scalar(p['to'])) for p in native['pairs']],
                other=(native['other']['mode'], scalar(native['other']['value']) if native['other']['mode'] == 'value' else None),
                option=native['case_sensitive'] if field['type'] == 'string' else native['precision'])


def normalized(rule):
    return dict(field=rule['field'], type=rule['type'],
                pairs=[dict(from_=scalar(p['from']), to=scalar(p['to'])) for p in rule['pairs']],
                other=(rule['other']['mode'], scalar(rule['other']['value']) if rule['other']['mode'] == 'value' else None),
                option=rule['case_sensitive'] if rule['type'] == 'string' else rule['precision'])


def verify_replacement_configuration(events, request):
    failures = []
    try:
        op = request['operation_id']
        declared = [e.get('request') for e in events if e.get('operation_id') == op and e.get('phase') == 'node_apply_prepared']
        if declared != [request] or request['target']['type'] != 'transform.replace_columns' or request['mode'] != 'exact':
            raise ValueError('replacement_request_binding')
        sequence = verify_internal_sequence(events, op, max_steps=8192)
        failures.extend(sequence['failures'])
        checkpoints = [e['result'] for e in events if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint']
        if len(checkpoints) != 1 or checkpoints[0].get('status') != 'SUCCEEDED': raise ValueError('replacement_checkpoint')
        result, node = checkpoints[0], checkpoints[0]['node']
        if request['target']['kind'] == 'existing' and request['target']['ref'] != node:
            raise ValueError('replacement_requested_node')
        def owned(c): return c.get('verified') is True and all(c.get(k) == node[k] for k in ('document_id', 'workflow_id', 'node_id'))
        phases = [e['receipt'] for e in events if e.get('operation_id') == op and e.get('phase') == 'node_phase_completed']
        def phase(name):
            found = [p for p in phases if p['phase'] == name]
            if len(found) != 1 or found[0]['status'] != 'verified': raise ValueError('replacement_phase_' + name)
            return found[0]['value']
        configured = phase('configure'); config = configured['configuration']
        if not owned(config['node_context']) or configured['validation']['status'] != 'accepted_by_loginom_next': raise ValueError('replacement_config_owner')
        native = [s['node_replacement'] for _, s in sequence['observations'] if s.get('node_replacement', {}).get('verified') is True]
        if not native or any(not owned(n['node_context']) or n.get('inventory_complete') is not True for n in native): raise ValueError('replacement_raw_owner')
        schema = lambda n: [(f['record_id'], f['name'], f['label'], f['type']) for f in n['input_fields']]
        refresh = config.get('input_inventory_refresh')
        if refresh:
            before_schema, after_schema = (schema(dict(input_fields=refresh[k])) for k in ('before', 'after'))
            semantic = lambda rows: [{k: v for k, v in f.items() if k != 'record_id'} for f in rows]
            transitions = []
            for n in native:
                current = schema(n)
                if not transitions or transitions[-1] != current: transitions.append(current)
            expected_transitions = [before_schema] if before_schema == after_schema else [before_schema, after_schema]
            policies = [s['node_mapping'] for _, s in sequence['observations'] if s.get('node_mapping')]
            if (semantic(refresh['before']) != semantic(refresh['after']) or transitions != expected_transitions
                    or refresh['policy'] not in policies or request['parameters'].get('output_mode') is not None
                    or schema(config) != after_schema): failures.append('replacement_input_refresh')
            if before_schema != after_schema:
                step = next(step for step, s in sequence['observations'] if s.get('node_replacement', {}).get('verified') and schema(s['node_replacement']) == after_schema)
                action = [a for n, a, _ in sequence['mutations'] if n < step][-1]
                if action.get('verb') != 'wizard_step' or action.get('expected_stage') != 'replacement': failures.append('replacement_input_refresh_navigation')
        elif any(schema(n) != schema(native[0]) for n in native): failures.append('replacement_input_identity')
        before, after = {}, {}
        for n in native:
            if n.get('selected') and not n.get('editor_open'):
                field = next(f for f in n['input_fields'] if f['name'] == n['selected'])
                if field['mode'] == 'manual':
                    before.setdefault(n['selected'], rule_from_native(n)); after[n['selected']] = rule_from_native(n)
        saved_rules = {r['field']['name']: normalized(r) for r in config['rules']}
        wanted = {r['field']['name']: normalized(r) for r in request['parameters'].get('rules', [])}
        if len(saved_rules) != len(config['rules']) or saved_rules != after: failures.append('replacement_receipt_not_raw')
        for name, rule in saved_rules.items():
            if rule != wanted.get(name, before.get(name)): failures.append('replacement_rules_' + name)
        if not set(wanted).issubset(saved_rules): failures.append('replacement_missing_field')
        active = {f['name'] for f in config['input_fields'] if f['mode'] == 'manual'}
        if active != set(saved_rules): failures.append('replacement_membership')
        for step, action, _ in sequence['mutations']:
            previous = [s for n, s in sequence['observations'] if n < step]
            if not previous: raise ValueError('replacement_action_before')
            state = previous[-1]; element = next((e for e in state['ui']['elements'] if e['ref'] == action.get('ref')), {})
            binding = element.get('replacement_field')
            if binding:
                n = state.get('node_replacement', {})
                if binding['role'] == 'pair':
                    if n.get('selected') != binding['field_key'] or not any(p['record_id'] == binding['record_id'] for p in n.get('pairs', [])): failures.append('replacement_pair_binding')
                elif not any(f['record_id'] == binding['record_id'] and f['name'] == binding['field_key'] for f in n.get('input_fields', [])): failures.append('replacement_field_binding')
        mapping = phase('output_mapping')['native_mapping']; inp = phase('input_mapping')['native_mapping']
        raw_maps = [s['node_mapping'] for _, s in sequence['observations'] if s.get('node_mapping')]
        if mapping not in raw_maps or inp not in raw_maps or not owned(mapping['node_context']) or not owned(inp['node_context']): raise ValueError('replacement_mapping_not_raw')
        mode = 'add' if mapping.get('produce_mode') == 'supplement' else 'replace' if mapping.get('produce_mode') in ('default', 'replace') else None
        if mode is None or request['parameters'].get('output_mode', mode) != mode: failures.append('replacement_output_mode')
        expected = {}
        for f in config['input_fields']:
            name, kind, label = f['name'], f['type'], f['label']
            if name not in active or mode == 'add': expected[name] = (kind, label)
            if name in active:
                expected[name + ('_Replace' if mode == 'add' else '')] = (kind, label + ' Замена')
                expected[name + '_Replaced'] = ('boolean', label + ' Заменен')
        if {f['name']: (f['type'], f['label']) for f in mapping['source_fields']} != expected: failures.append('replacement_generated_schema')
        sources = {f['record_id']: f for f in mapping['source_fields']}; seen = set()
        for f in mapping['target_fields']:
            src = f.get('source') or f.get('exclusion_source')
            if not src or sources.get(src['record_id']) != src or src['record_id'] in seen: raise ValueError('replacement_output_link')
            seen.add(src['record_id'])
        if seen != set(sources): failures.append('replacement_output_coverage')
        for name in ('node_finish', 'finish'):
            finished = phase(name)
            if finished.get('settings_applied') is not True or not owned(finished['node_context']): failures.append('replacement_finish')
        readback = result['configuration']['readback']
        if readback['rules'] != config['rules'] or readback['output_mode'] != mode: failures.append('replacement_readback')
    except (KeyError, IndexError, TypeError, ValueError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=failures, scope='replacement_raw_configuration')
