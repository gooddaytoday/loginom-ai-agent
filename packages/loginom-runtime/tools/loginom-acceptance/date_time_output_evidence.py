"""Derive the requested output from the pre-edit port, never from final labels."""


def initial_output_mapping(events, operation_id, node):
    active = False
    for event in events:
        if event.get('operation_id') != operation_id:
            continue
        if event.get('phase') == 'node_phase_prepared':
            active = event['receipt']['phase'] == 'output_mapping'
        if active and event.get('phase') == 'node_observation_completed':
            mapping = event.get('outcome', {}).get('output', {}).get('node_mapping', {})
            owner = mapping.get('node_context', {})
            if (mapping.get('verified') is True and mapping.get('inventory_complete') is True
                    and mapping.get('source_identity_verified') is True
                    and mapping.get('mapping_wizard') == 'DerivedDataSourceOutputSocketWizard'
                    and owner.get('verified') is True and owner.get('output_port', {}).get('port') == 0
                    and all(owner.get(k) == node[k] for k in ('document_id', 'workflow_id', 'node_id'))):
                return mapping
        if event.get('phase') == 'node_phase_completed' and event['receipt']['phase'] == 'output_mapping':
            break
    raise ValueError('date_time_initial_output_mapping_missing')


def expected_output(baseline, generated, mapping):
    sources = {s['record_id']: s for s in baseline['source_fields']}
    if len(sources) != len(baseline['source_fields']):
        raise ValueError('date_time_initial_output_sources')
    pairs, seen = [], set()
    for field in baseline['target_fields']:
        source = field.get('source') or field.get('exclusion_source')
        if not source or sources.get(source['record_id']) != source or source['record_id'] in seen:
            raise ValueError('date_time_initial_output_binding')
        seen.add(source['record_id'])
        origin = generated.get(source['record_id'], dict(input=source['name']))
        pairs.append(dict(source=source, origin=origin, name=origin.get('configured_name') or field['name'],
                          label=origin.get('configured_label') or field['label'], excluded=field['excluded']))
    if seen != set(sources) or len({p['name'] for p in pairs}) != len(pairs):
        raise ValueError('date_time_initial_output_bijection')
    ordered = [(p, {}) for p in pairs]
    if 'fields' in mapping:
        ordered, used = [], set()
        for wanted in mapping['fields']:
            matches = [p for p in pairs if wanted['source']['kind'] == 'configured_field'
                       and p['name'] == wanted['source']['name']]
            if len(matches) != 1 or matches[0]['source']['record_id'] in used:
                raise ValueError('date_time_requested_output_reference')
            used.add(matches[0]['source']['record_id'])
            ordered.append((matches[0], wanted))
        if used != set(sources):
            raise ValueError('date_time_requested_output_coverage')
    expected = []
    for pair, wanted in ordered:
        source = pair['source']
        name, label = wanted.get('name', pair['name']), wanted.get('label', pair['label'])
        excluded = wanted.get('excluded', pair['excluded'])
        if excluded:
            if (source['required'] or name != source['name']
                    or 'label' in wanted and wanted['label'] != source['label']):
                raise ValueError('date_time_requested_output_exclusion')
            # Native exclusion has a service label equal to the source name.
            label = source['name']
        expected.append(dict(name=name, label=label, type=source['type'], excluded=excluded,
                             source_id=source['record_id'], origin=pair['origin']))
    if len({f['name'].lower() for f in expected}) != len(expected):
        raise ValueError('date_time_requested_output_duplicate_names')
    return [f for f in expected if not f['excluded']] + [f for f in expected if f['excluded']]


def verify_output_mapping(baseline, actual, generated, mapping):
    expected = expected_output(baseline, generated, mapping)
    if actual['source_fields'] != baseline['source_fields'] or len(actual['target_fields']) != len(expected):
        raise ValueError('date_time_output_sources_changed')
    projection = []
    for field, wanted in zip(actual['target_fields'], expected):
        source = field.get('source') or field.get('exclusion_source')
        if (not source or source['record_id'] != wanted['source_id']
                or any(field[k] != wanted[k] for k in ('name', 'label', 'type', 'excluded'))):
            raise ValueError('date_time_requested_output_field')
        if not wanted['excluded']:
            origin = wanted['origin']
            projection.append(dict(name=wanted['name'], label=wanted['label'], type=wanted['type'],
                                   input=origin['input'], **({'operation': origin['operation']} if origin.get('operation') else {})))
    return projection
