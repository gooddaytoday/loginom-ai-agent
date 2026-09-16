"""Audit the focused existing manual schema case from raw operation evidence."""
import argparse
import json
from pathlib import Path
from date_time_audit import audit


def semantic(field):
    source = field.get('source') or field.get('exclusion_source')
    return {k: field[k] for k in ('name', 'label', 'type', 'data_kind', 'excluded')} | {'source': source['name']}


def verify(directory, operation_id='node13-manual-add'):
    failures = []
    try:
        events = [json.loads(x) for x in (directory / 'execution-events.jsonl').read_text().splitlines()]
        rows = [e for e in events if e.get('operation_id') == operation_id]
        requests = [e['request'] for e in rows if e.get('phase') == 'node_apply_prepared']
        checkpoints = [e['result'] for e in rows if e.get('phase') == 'node_checkpoint']
        if len(requests) != 1 or len(checkpoints) != 1 or requests[0]['target']['kind'] != 'existing':
            raise ValueError('one_existing_operation_required')
        request, final = requests[0], checkpoints[0]
        result = audit(events, request)
        if not result['passed']:
            failures.append('independent_configuration_or_values_failed')
        node = final['node']
        def owned(m):
            c = m.get('node_context', {})
            return (m.get('verified') is True and m.get('inventory_complete') is True
                    and m.get('source_identity_verified') is True
                    and all(c.get(k) == node[k] for k in node)) and m.get('mapping_wizard') in (
                'DerivedDataSourceOutputSocketWizard', 'DerivedDataSourceMappingEngineOutputPortWizard')
        maps = [e['outcome']['output']['node_mapping'] for e in rows if e.get('phase') == 'node_observation_completed'
                and owned(e.get('outcome', {}).get('output', {}).get('node_mapping', {}))]
        if not maps or any(m['autosync'] is not False for m in maps):
            raise ValueError('manual_autosync_not_preserved')
        baseline = maps[0]
        if len(baseline['target_fields']) != 7 or not any(f['name'] == 'Amount' and f['excluded'] for f in baseline['target_fields']):
            raise ValueError('manual_seven_field_excluded_baseline_required')
        previous, pending, creations = None, None, []
        for e in rows:
            if e.get('phase') == 'node_observation_completed':
                previous = e['outcome']['output']
                m = previous.get('node_mapping', {})
                if pending and owned(m):
                    before, selected = pending
                    old_ids = {f['record_id'] for f in before['target_fields']}
                    retained = [f for f in m['target_fields'] if f['record_id'] in old_ids]
                    added = [f for f in m['target_fields'] if f['record_id'] not in old_ids]
                    if ([semantic(f) for f in retained] != [semantic(f) for f in before['target_fields']]
                            or len(added) != 1 or m['source_fields'] != before['source_fields']
                            or added[0].get('source') != selected or added[0]['excluded']):
                        raise ValueError('creation_changed_retained_definition')
                    creations.append((before, selected, added[0])); pending = None
            if e.get('phase') == 'node_step_prepared':
                action = e.get('action', {})
                element = next((x for x in previous.get('ui', {}).get('elements', []) if x['ref'] == action.get('ref')), {})
                tid = element.get('tid') or ''
                if tid.endswith(';btnAutoSyncThroughColumns'):
                    failures.append('autosync_gesture_forbidden')
                if action.get('verb') == 'click' and tid.endswith(';btnCreateMapping'):
                    m = previous.get('node_mapping', {})
                    selected = m.get('source_selection', {})
                    if not owned(m) or selected.get('verified') is not True or len(selected.get('record_ids', [])) != 1:
                        raise ValueError('exact_selected_source_required')
                    source = next(f for f in m['source_fields'] if f['record_id'] == selected['record_ids'][0])
                    if not source['required'] or source['name'] not in ('DateB_Q_1', 'DateB_HRS_1'):
                        raise ValueError('unrequested_source_created')
                    pending = (m, source)
        if pending or len(creations) != 2 or [c[1]['name'] for c in creations] != ['DateB_Q_1', 'DateB_HRS_1']:
            raise ValueError('two_exact_source_creations_required')
        if len(creations[0][0]['source_fields']) != 9 or len(creations[0][0]['target_fields']) != 7:
            raise ValueError('original_nine_sources_seven_targets_required')
        actual = maps[-1]['target_fields']
        old_names = {f['name'] for f in baseline['target_fields']}
        if [semantic(f) for f in actual if f['name'] in old_names] != [semantic(f) for f in baseline['target_fields']]:
            failures.append('old_mapping_or_exclusion_changed')
        if [f['name'] for f in actual if f['name'] not in old_names] != ['SmallQuarter', 'SmallHour']:
            failures.append('requested_added_names_missing')
        repeat = json.loads((directory / 'manual-repeat.json').read_text())
        if not repeat['before'] == repeat['middle'] == repeat['after'] or repeat['repeat'] != 'SUCCEEDED' or repeat['resume'] != 'SUCCEEDED':
            failures.append('repeat_has_effects')
    except (KeyError, ValueError, TypeError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), scope='existing_manual_date_time_output', hermes_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    args = parser.parse_args()
    result = verify(args.session)
    (args.session / 'date-time-manual-output-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
