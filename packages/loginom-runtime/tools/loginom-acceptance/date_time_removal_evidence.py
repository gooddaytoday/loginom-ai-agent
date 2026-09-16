"""Prove removed date outputs against pre-edit native bindings and raw transitions."""
import re


def verify_source_fetch(fetch, baseline, raw_maps):
    before, after = fetch['before'], fetch['after']
    def fields(rows):
        result = []
        for row in rows:
            keep = {k: v for k, v in row.items() if k not in ('record_id', 'source', 'exclusion_source')}
            if row['excluded']: keep.pop('field_id', None)
            result.append(keep)
        return result
    count = len(before['target_fields'])
    if (before not in raw_maps or after not in raw_maps or after != baseline
            or before['source_fields'] != [] or not after['source_fields']
            or before['node_context'] != after['node_context'] or before['autosync'] != after['autosync']
            or fields(before['target_fields']) != fields(after['target_fields'][:count])):
        raise ValueError('date_time_source_fetch_changed_existing')
    added = after['target_fields'][count:]
    if added and (before['autosync'] is not True or before['mapping_wizard'] != 'DerivedDataSourceOutputSocketWizard'
                  or after['mapping_wizard'] != before['mapping_wizard']):
        raise ValueError('date_time_source_fetch_extended_fixed_output')
    for target in added:
        source = target.get('source')
        if (not source or source not in after['source_fields'] or source['required'] is not False
                or target['required'] is not False or target['excluded'] is not False
                or target['inherited'] is not False or target['exclusion_source'] is not None
                or any(target[k] != source[k] for k in ('name', 'label', 'type'))):
            raise ValueError('date_time_source_fetch_added_non_passthrough')


def verify_removals(request, config, opening, first, raw_maps, operations):
    if request['target']['kind'] != 'existing' or not request['parameters'].get('fields'):
        if config.get('removed_outputs'):
            raise ValueError('date_time_unexpected_removal')
        return
    pre = opening['preconfiguration']
    baseline = pre['native_mapping']
    if (baseline not in raw_maps or baseline['mapping_wizard'] != 'DerivedDataSourceOutputSocketWizard'
            or baseline.get('verified') is not True or baseline.get('inventory_complete') is not True
            or baseline.get('source_identity_verified') is not True):
        raise ValueError('date_time_original_output_missing')
    if pre.get('source_fetch'):
        verify_source_fetch(pre['source_fetch'], baseline, raw_maps)
    linked = [t.get('source') or t.get('exclusion_source') for t in baseline['target_fields']]
    if (any(source not in baseline['source_fields'] for source in linked)
            or len({source['record_id'] for source in linked}) != len(linked)
            or len(linked) != len(baseline['source_fields'])):
        raise ValueError('date_time_original_output_bijection')
    close = pre['close']
    if (close.get('draft_discarded') is not True or close.get('settings_applied') is not False
            or close.get('cleanup_complete') is not True):
        raise ValueError('date_time_original_output_committed')
    expected = []
    inputs = {f['name']: f for f in config['configuration']['input_fields']}
    for field in request['parameters']['fields']:
        name = field['field']['name']
        desired = {(operations[t['operation']][0], operations[t['operation']][1], False) for t in field['transformations']}
        for row in first[name]:
            for flag in ('first', 'last', 'number', 'string'):
                if not row[flag] or (row['func'], flag, row['iso']) in desired:
                    continue
                matches = [(op, definition) for op, definition in operations.items()
                           if not row['iso'] and definition[:2] == (row['func'], flag)]
                if len(matches) != 1:
                    raise ValueError('date_time_unrecognized_removed_function')
                op, (_, _, suffix, title, field_type) = matches[0]
                sources = [s for s in baseline['source_fields'] if s['required'] is True and s['type'] == field_type
                           and s['label'] == inputs[name]['label'] + ' (' + title + ')'
                           and re.fullmatch(re.escape(name + '_' + suffix) + r'_\d+', s['name'])]
                if len(sources) != 1:
                    raise ValueError('date_time_original_function_source')
                targets = [t for t in baseline['target_fields'] if t.get('source') == sources[0]]
                if len(targets) != 1 or targets[0]['excluded'] or targets[0]['required']:
                    raise ValueError('date_time_original_function_target')
                expected.append(dict(field=name, operation=op, source=sources[0], target=targets[0]))
    if config.get('removed_outputs', []) != expected:
        raise ValueError('date_time_removed_projection')
    if expected and config.get('inline_mapping', {}).get('native_mapping', {}).get('autosync') != baseline.get('autosync'):
        raise ValueError('date_time_removed_autosync_not_restored')
    seen = set()
    for receipt in config.get('inline_mapping', {}).get('removed', []):
        target, origin, after = receipt['target'], receipt['origin'], receipt['after']
        if origin not in expected or target['record_id'] in seen or target.get('source') or target.get('exclusion_source'):
            raise ValueError('date_time_unowned_orphan_deletion')
        seen.add(target['record_id'])
        keys = ('field_id', 'name', 'label', 'type', 'data_kind', 'excluded', 'required')
        if any(target[k] != origin['target'][k] for k in keys):
            raise ValueError('date_time_deleted_original_identity')
        if after not in raw_maps:
            raise ValueError('date_time_deletion_observation_missing')
        candidates = [m for m in raw_maps if m['node_context'] == after['node_context']
                      and m['mapping_wizard'] == 'DerivedDataSourceMappingEngineOutputPortWizard'
                      and target in m['target_fields']]
        def transition(before):
            groups, remaining = {}, []
            for f in before['target_fields']:
                if f['record_id'] == target['record_id']:
                    continue
                group_index = groups.get(f['excluded'], 0)
                groups[f['excluded']] = group_index + 1
                remaining.append(dict(f, index=len(remaining), group_index=group_index))
            wanted = dict(before, autosync=False, target_fields=remaining)
            return {k: v for k, v in wanted.items() if k != 'rendered_indices'} == {
                k: v for k, v in after.items() if k != 'rendered_indices'}
        if not any(transition(m) for m in candidates):
            raise ValueError('date_time_deletion_changed_other_fields')
