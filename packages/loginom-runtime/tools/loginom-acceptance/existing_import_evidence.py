"""Source-backed seed execution -> existing column patch -> fresh output audit."""
from copy import deepcopy
import csv
import io
from import_execution_evidence import verify_text_import_execution
from import_output_evidence import _verify_text_import_output, verify_text_import_output
from import_patch_evidence import verify_import_patch_observations
from node_procedure_evidence import verify_internal_sequence
from import_limits import import_step_budget
from wizard_open_evidence import verify_wizard_open_sequence
from import_source_binding import source_ordered_settings


def verify_existing_import_output(events, seed_request, request, source_bytes, *, seed_source_bytes=None):
    return _verify_existing_import_output(events, seed_request, request, source_bytes,
                                         seed_source_bytes=seed_source_bytes)


def _verify_existing_import_output(events, seed_request, request, source_bytes, *,
                                   seed_source_bytes=None, reopened_package=False, verified_seed=None, baseline_settings=None, continued_workflow=False,
                                   cancelled_edit=False):
    # The private reopening path is only called after package identity, graph,
    # ordering and fresh workflow bindings have been independently checked.
    failures = []
    if ((seed_request.get('target', {}).get('kind') != 'new' and verified_seed is None) or request.get('target', {}).get('kind') != 'existing'
            or request.get('finish') != 'execute' or seed_request.get('finish') != 'execute'
            or request.get('operation_id') == seed_request.get('operation_id')):
        return {'passed': False, 'failures': ['existing_seed_contract']}
    for key in ('document_id', 'workflow_ref'):
        if seed_request.get(key) != request.get(key) and not ((reopened_package or continued_workflow) and key == 'workflow_ref'):
            failures.append('seed_' + key)
    if seed_request['parameters']['source'] != request['parameters']['source']:
        new_path=request['parameters']['settings'].get('source', {}).get('source_path')
        if (seed_source_bytes is None or not new_path or new_path == seed_request['parameters']['settings']['source']['source_path']
                or request['parameters']['source']['upload_operation_id'] == seed_request['parameters']['source']['upload_operation_id']):
            failures.append('replacement_source_identity')
    elif seed_source_bytes is not None and seed_source_bytes != source_bytes:
        failures.append('seed_source_bytes_mismatch')
    if verified_seed is not None and (verified_seed.get('passed') is not True or baseline_settings is None):
        return {'passed':False,'failures':['verified_seed_required']}
    seed = verified_seed if verified_seed is not None else (verify_text_import_output if seed_request.get('read', {}).get('ports') == [0] else verify_text_import_execution)(events, seed_request, source_bytes if seed_source_bytes is None else seed_source_bytes)
    failures.extend('seed_' + f for f in seed['failures'])
    ids = (seed_request['operation_id'], request['operation_id'])
    positions = []
    for op, expected in zip(ids, (seed_request, request)):
        prepared = [(i, e) for i, e in enumerate(events) if e.get('operation_id') == op and e.get('phase') == 'node_apply_prepared']
        if len(prepared) != 1 or prepared[0][1].get('request') != expected:
            failures.append('declared_request_journal_mismatch')
        positions.append(prepared[0][0] if prepared else -1)
    checkpoints = [(i, e.get('result', {})) for i, e in enumerate(events)
                   if e.get('operation_id') == ids[0] and e.get('phase') == 'node_checkpoint']
    if len(checkpoints) != 1 or not positions[0] < checkpoints[0][0] < positions[1]:
        failures.append('seed_before_patch_required')
    node = request['target'].get('ref', {})
    seed_node = deepcopy(checkpoints[0][1].get('node', {})) if len(checkpoints) == 1 else {}
    if reopened_package:
        seed_node['workflow_id'] = request['workflow_ref']['workflow_id']
    if len(checkpoints) != 1 or seed_node != node:
        failures.append('existing_seed_node_identity')
    identities = {(e.get('session_id'), e.get('runtime_revision'), str(e.get('target')))
                  for e in events if e.get('operation_id') in ids and e.get('internal_provenance') == 'client_node_procedure_v1'}
    if len(identities) != 1:
        failures.append('seed_patch_runtime_mismatch')
    sequence = verify_internal_sequence(events, request['operation_id'], max_steps=import_step_budget(request))
    failures.extend(sequence['failures'])
    rows = [e for e in events if e.get('operation_id') == request['operation_id']]
    def phase(name):
        starts = [i for i, e in enumerate(rows) if e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == name]
        ends = [i for i, e in enumerate(rows) if e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == name]
        steps = set()
        if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
            failures.append('existing_phase_' + name)
        else:
            steps = {e.get('step') for e in rows[starts[0]+1:ends[0]] if e.get('internal_provenance') == 'client_node_procedure_v1'}
        return {'failures': [], 'observations': [(n, s) for n, s in sequence['observations'] if n in steps],
                'mutations': [(n, a, o) for n, a, o in sequence['mutations'] if n in steps]}
    opening_sequence = phase('open')
    begins = [n for n, a, _ in opening_sequence['mutations'] if a.get('verb') == 'begin_wizard']
    if len(begins) == 1:
        start = max((n for n, _ in opening_sequence['observations'] if n < begins[0]), default=0)
        opening_sequence = {**opening_sequence,
                            'observations': [(n, s) for n, s in opening_sequence['observations'] if n >= start],
                            'mutations': [(n, a, o) for n, a, o in opening_sequence['mutations'] if n >= begins[0]]}
    # Only the cancellation composite enables this after independently proving
    # Close on this exact node. The earlier edit already deactivated the seed.
    opening = verify_wizard_open_sequence(opening_sequence, node, expect_deactivation=not (reopened_package or cancelled_edit))
    failures.extend('existing_' + f for f in opening['failures'])
    baseline = deepcopy(baseline_settings if baseline_settings is not None else seed_request['parameters']['settings'])
    if baseline_settings is None:
        try:
            baseline = source_ordered_settings(baseline, source_bytes if seed_source_bytes is None else seed_source_bytes)
        except (ValueError, KeyError, TypeError, UnicodeError, IndexError):
            return {'passed': False, 'failures': failures+['seed_source_field_binding']}
    for c in baseline['columns']:
        c.pop('source_name', None)
    configured = phase('configure')
    patch = request['parameters']['settings']
    source_names=None
    if seed_request['parameters']['source'] != request['parameters']['source']:
        source={**baseline['source'],**patch.get('source',{})};format={**baseline['format'],**patch.get('format',{})}
        codecs={'UTF-8':'utf-8-sig','Windows-1251':'cp1251','Windows-1252':'cp1252','UTF-16 LE':'utf-16-le','UTF-16 BE':'utf-16-be'}
        try:
            text=source_bytes.decode(codecs[source['encoding']])
            text=''.join(text.splitlines(keepends=True)[source['rows_to_skip']:])
            reader=csv.reader(io.StringIO(text),delimiter=format['delimiter'],quotechar=format['text_qualifier'] or None,
                              quoting=csv.QUOTE_MINIMAL if format['text_qualifier'] else csv.QUOTE_NONE)
            first=next(reader)
            source_names=first if source['first_line_as_title'] else ['COL'+str(i+1) for i in range(len(first))]
        except (ValueError,UnicodeError,KeyError,StopIteration,csv.Error):
            return {'passed':False,'failures':failures+['replacement_source_schema_parse']}
    preservation = verify_import_patch_observations(configured['observations'], configured['mutations'], baseline, patch, source_names=source_names)
    failures.extend(preservation['failures'])
    if not preservation['passed']:
        return {'passed': False, 'failures': sorted(set(failures)), 'scope': 'existing_import_seed_patch_output'}
    final = preservation['expected_settings']
    # Preserve the independently known old output order. Native auto-sync
    # appends newly used fields; changing file order is not a mapping request.
    used=[c for c in final['columns'] if c['used']]
    output_columns=[]
    for old in baseline['columns']:
        if not old['used']:continue
        matching=[c for c in used if c.get('source_name',c['name'])==old['name']]
        output_columns.extend(matching)
    output_columns += [c for c in used if c not in output_columns]
    if seed_request.get('mappings') and not request.get('mappings'):
        from port_mapping_evidence import configured_mapping_goal,verify_configured_mapping_final
        try:
            if len(seed_request['mappings'])!=1:raise ValueError('one_seed_mapping_required')
            old_output=configured_mapping_goal(seed_request['mappings'][0],baseline['columns'])
            output_columns=[]
            for old in old_output:
                matches=[c for c in used if c['name']==old['mapping_source_name']]
                if len(matches)!=1:raise ValueError('preserved_mapping_source_missing')
                current=matches[0]
                if current['type']!=old['type'] or current['data_kind']!=old['data_kind']:raise ValueError('mapped_type_change_not_audited')
                output_columns.append({**old,'source_name':current.get('source_name',current['name']),'mapping_source_label':current['label']})
            if len(output_columns)!=len(used):raise ValueError('mapped_schema_change_not_audited')
            mapped=phase('output_mapping')
            failures.extend(verify_configured_mapping_final(mapped['observations'],mapped['mutations'],seed_request['mappings'][0],final['columns'],output_columns))
            if any(a.get('verb')!='wizard_step' for _,a,_ in mapped['mutations']):failures.append('unrequested_mapping_mutation')
        except (ValueError,KeyError,TypeError) as error:failures.append('mapped_preservation:'+str(error))
    # An existing-node request may identify the node solely by its exact ref.
    # Keep checking the label against the independently verified seed rather
    # than requiring the caller to repeat that optional display property.
    expected_label = request['target'].get('label', seed_request['target'].get('label'))
    # An explicit mapping has its own ordered field/identity proof below.
    # The old output order applies only when the caller preserves mappings.
    output = _verify_text_import_output(events, request, source_bytes, settings_override=final,
                                      output_columns_override=None if request.get('mappings') else output_columns,
                                      target_label_override=expected_label)
    failures.extend(output['failures'])
    if not output.get('execution_id') or output['execution_id'] == seed.get('execution_id'):
        failures.append('new_execution_after_patch_required')
    return {**output, 'passed': not failures, 'failures': sorted(set(failures)),
            'scope': 'existing_import_seed_patch_output', 'seed_execution_id': seed.get('execution_id'),
            'expected_settings': final, 'unrequested_settings_preserved': preservation['passed'], 'wizard_open_verified': opening['passed'],
            'deactivation_verified': opening['passed'] and not (reopened_package or cancelled_edit),
            'output_data_verified': not failures, 'package_persistence_verified': False}
