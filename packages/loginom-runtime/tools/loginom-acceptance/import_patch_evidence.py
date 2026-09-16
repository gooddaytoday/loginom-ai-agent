"""Independent evidence for partial settings of an existing import draft.

The operator supplies the known pre-edit settings, not the handler's preservation
summary. Both the original and final schemas must appear in native observations.
The general verifier includes source/format changes with the same known schema.
Done and persistence require their own evidence.
"""
from import_limits import import_operation_step_budget

from copy import deepcopy
from import_fields_evidence import verify_import_field_observations
from node_procedure_evidence import verify_internal_sequence


def verify_text_import_column_patch(events, operation_id, before, patch):
    sequence = verify_internal_sequence(events, operation_id, max_steps=import_operation_step_budget(events, operation_id))
    return verify_column_patch_observations(sequence['observations'], sequence['mutations'],
                                            before, patch, sequence['failures'])


def verify_text_import_column_patch_roundtrip(events, operation_id, qa_operation_id, before, patch):
    """Add a separate Done/reopen QA proof; never require reopen in the handler."""
    result = verify_text_import_column_patch(events, operation_id, before, patch)
    if not result['passed']:
        return result
    original = verify_internal_sequence(events, operation_id, max_steps=import_operation_step_budget(events, operation_id))
    qa = verify_internal_sequence(events, qa_operation_id, max_steps=import_operation_step_budget(events, qa_operation_id))
    failures = list(qa['failures'])
    positions = {key: [i for i, e in enumerate(events) if e.get('operation_id') == key
                      and e.get('internal_provenance') == 'client_node_procedure_v1']
                 for key in (operation_id, qa_operation_id)}
    if (operation_id == qa_operation_id or not all(positions.values())
            or max(positions[operation_id]) >= min(positions[qa_operation_id])):
        failures.append('roundtrip_operation_order')
    identities = {(e.get('session_id'), e.get('runtime_revision'), str(e.get('target')))
                  for e in events if e.get('operation_id') in positions
                  and e.get('internal_provenance') == 'client_node_procedure_v1'}
    if len(identities) != 1:
        failures.append('roundtrip_journal_session_mismatch')
    nodes = []
    for _, state in original['observations'] + qa['observations']:
        node = state.get('prepared_node_context', {})
        nodes.append(tuple(node.get(k) for k in ('document_id', 'workflow_id', 'node_id')))
        if node.get('verified') is not True or not all(nodes[-1]):
            failures.append('roundtrip_node_identity_missing')
    if not nodes or any(n != nodes[0] for n in nodes):
        failures.append('roundtrip_node_identity_changed')
    finishes = [(s, o) for s, a, o in qa['mutations'] if a.get('verb') == 'finish_wizard']
    opens = [(s, o) for s, a, o in qa['mutations'] if a.get('verb') == 'open_wizard']
    if len(finishes) != 1 or len(opens) != 1 or finishes[0][0] >= opens[0][0]:
        failures.append('roundtrip_finish_open_order')
        return {**result, 'passed': False, 'failures': sorted(set(failures))}
    for (_, outcome), event in [(finishes[0], 'wizard_finish_graph_verified'), (opens[0], 'wizard_open_verified')]:
        if len([t for t in outcome.get('trace', []) if t.get('event') == event]) != 1:
            failures.append('roundtrip_' + event)
    if any(a.get('verb') not in ('click', 'wizard_step', 'finish_wizard', 'open_wizard', 'scroll_horizontal')
           for _, a, _ in qa['mutations']):
        failures.append('roundtrip_unexpected_mutation')
    start = opens[0][0]
    expected = deepcopy(before)
    original_names = [c['name'] for c in before['columns']]
    for change in patch['columns']:
        identity = change.get('source_name', change.get('name'))
        column = expected['columns'][original_names.index(identity)]
        column.update({k: v for k, v in change.items() if k != 'source_name'})
    observed = [(s, o) for s, o in qa['observations'] if s > start]
    mutations = [(s, a, o) for s, a, o in qa['mutations'] if s > start]
    connections = [o['wizard']['import_source'].get('fields', {}).get('connection', {})
                   for _, o in original['observations'] + observed
                   if o.get('wizard', {}).get('stage') == 'text_import_file']
    if not connections or any(f.get('status') != 'observed' or f.get('truncated') is True
                              or not f.get('value') or f.get('value') != connections[0].get('value')
                              for f in connections):
        failures.append('roundtrip_connection_preservation')
    if any(a.get('verb') not in ('wizard_step', 'scroll_horizontal') for _, a, _ in mutations):
        failures.append('roundtrip_readback_changed_settings')
    readback = verify_import_field_observations(observed, mutations, expected)
    failures.extend('roundtrip_' + f for f in readback['failures'])
    return {**result, 'passed': not failures, 'failures': sorted(set(failures)),
            'settings_saved_verified': not failures, 'qa_roundtrip_verified': not failures,
            'scope': 'existing_import_column_patch_done_and_separate_qa_roundtrip'}


def verify_column_patch_observations(observations, mutations, before, patch, sequence_failures=()):
    failures = list(sequence_failures)
    if (not isinstance(patch, dict) or set(patch) != {'columns'}
            or not isinstance(patch['columns'], list) or not patch['columns']):
        return {'passed': False, 'failures': ['column_patch_required']}
    return verify_import_patch_observations(observations, mutations, before, patch, sequence_failures)


def verify_import_patch_observations(observations, mutations, before, patch, sequence_failures=(), *, source_names=None):
    """Preserve a known existing schema while applying explicit source/format/field changes."""
    failures = list(sequence_failures)
    if (not isinstance(patch, dict) or set(patch) - {'source','format','columns'}
            or not isinstance(patch.get('columns', []), list)):
        return {'passed': False, 'failures': ['invalid_import_patch']}
    expected = deepcopy(before)
    for group, allowed in [('source', {'source_path','encoding','rows_to_skip','first_line_as_title'}),
                           ('format', {'delimiter','text_qualifier','null_marker','decimal_separator'})]:
        change = patch.get(group, {})
        if not isinstance(change, dict) or set(change) - allowed:
            return {'passed': False, 'failures': ['invalid_patch_' + group]}
        expected[group].update(change)
    if source_names is not None:
        if (not isinstance(source_names,list) or not 1 <= len(source_names) <= 1000
                or any(not isinstance(n,str) or not n for n in source_names) or len(set(source_names)) != len(source_names)):
            return {'passed': False, 'failures': ['replacement_schema_identity']}
        if source_names != [c['name'] for c in before['columns']] and not (patch.get('source') or patch.get('format')):
            return {'passed': False, 'failures': ['unrequested_schema_change']}
        columns=[]
        for name in source_names:
            old=next((c for c in before['columns'] if c['name']==name),None)
            if old is not None:
                columns.append(deepcopy(old));continue
            changes=[c for c in patch.get('columns',[]) if c.get('source_name',c.get('name'))==name]
            if len(changes)!=1 or not {'name','label','type','data_kind','used'} <= set(changes[0]):
                return {'passed':False,'failures':['new_field_explicit_semantics_required']}
            columns.append({**{k:changes[0][k] for k in ('label','type','data_kind','used')},'name':name})
        expected['columns']=columns
    names = [c['name'] for c in expected['columns']]

    if len(names) != len(set(names)):
        return {'passed': False, 'failures': ['baseline_names_not_unique']}
    seen = set()
    for change in patch.get('columns', []):
        if not isinstance(change, dict) or set(change) - {'source_name', 'name', 'label', 'type', 'data_kind', 'used'}:
            return {'passed': False, 'failures': ['invalid_column_patch']}
        identity = change.get('source_name', change.get('name'))
        if not isinstance(identity, str) or identity not in names or identity in seen:
            return {'passed': False, 'failures': ['patch_column_identity']}
        seen.add(identity)
        index = names.index(identity)
        for key, value in change.items():
            if key != 'source_name':
                expected['columns'][index][key] = value
        if expected['columns'][index]['name'] != identity:
            expected['columns'][index]['source_name'] = identity
    if len({c['name'] for c in expected['columns']}) != len(names):
        return {'passed': False, 'failures': ['patch_name_collision']}

    edits = [step for step, action, _ in mutations
             if action.get('verb') not in ('wizard_step', 'scroll_horizontal')]
    boundary = min(edits) if edits else float('inf')
    baseline_observations = [(s, o) for s, o in observations if s < boundary]
    # Configuration may revisit individual pages and scroll to the final field
    # after reading the baseline. Find a complete ordered sweep before editing;
    # the last page-zero visit alone is not a complete wide-schema baseline.
    offset, schema, cutoff = 0, None, None
    for step, state in baseline_observations:
        definitions = state.get('wizard', {}).get('import_columns', {})
        page = definitions.get('page', {})
        if page.get('status') != 'complete_definition_page':
            continue
        if page.get('offset') == 0:
            offset, schema = 0, page.get('schema_id')
        if (not schema or page.get('schema_id') != schema or page.get('offset') != offset
                or page.get('total_columns') != len(before['columns'])):
            offset, schema = 0, None
            continue
        offset += len(definitions.get('fields', []))
        if offset == len(before['columns']) and page.get('next_offset') is None:
            cutoff = step
            break
    if cutoff is None:
        failures.append('baseline_complete_definition_sweep_missing')
        cutoff = boundary
    baseline_observations = [(s, o) for s, o in baseline_observations if s <= cutoff]
    baseline_mutations = [(s, a, o) for s, a, o in mutations if s < cutoff]
    original = verify_import_field_observations(baseline_observations, baseline_mutations, before)
    failures.extend('baseline_' + f for f in original['failures'])
    final = verify_import_field_observations(observations, mutations, expected)
    failures.extend(final['failures'])
    # The connection is not an editable request parameter, but must also survive.
    connections = [o['wizard']['import_source'].get('fields', {}).get('connection', {})
                   for _, o in observations if o.get('wizard', {}).get('stage') == 'text_import_file']
    if (not connections or any(f.get('status') != 'observed' or f.get('truncated') is True
                              or not f.get('value') or f.get('value') != connections[0].get('value')
                              for f in connections)):
        failures.append('connection_preservation')
    return {**final, 'passed': not failures, 'failures': sorted(set(failures)),
            'baseline_verified': original['passed'], 'unrequested_settings_preserved': not failures,
            'expected_settings': expected, 'scope': 'existing_import_patch_draft_only'}
