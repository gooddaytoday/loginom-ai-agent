"""Independent bounded Done audit; no execution, persistence or Hermes admission."""
import hashlib
from import_fields_evidence import verify_import_field_observations
from node_procedure_evidence import verify_internal_sequence
from import_limits import import_step_budget
from execution_wait_evidence import verify_execution_wait_pauses
from import_source_binding import source_ordered_settings, source_with_delivery_metadata


def _verify_text_import(events, request, source_bytes, finish, *, settings_override=None, output_columns_override=None, target_label_override=None):
    operation_id = request['operation_id']
    sequence = verify_internal_sequence(events, operation_id, max_steps=import_step_budget(request))
    failures = list(sequence['failures'])
    failures.extend(verify_execution_wait_pauses(events, request)['failures'])
    rows = [e for e in events if e.get('operation_id') == operation_id]
    identity_keys=('session_id','runtime_revision','target')
    identity=tuple(rows[0].get(k) for k in identity_keys) if rows else ()
    if (not identity or not all(identity)
            or any(tuple(e.get(k) for k in identity_keys)!=identity for e in rows)):
        failures.append('node_phase_journal_identity')
    expected_phases = ['source', 'target', 'input_mapping', 'open', 'configure', 'output_mapping', 'finish'] + (['execute', 'read'] if finish == 'execute' else [])
    if any(e.get('receipt', {}).get('phase') == 'workflow' for e in rows):
        from workflow_activation_evidence import verify_workflow_activation
        expected_phases.insert(1, 'workflow')
        failures.extend(verify_workflow_activation(events, request)['failures'])
    completed, pending, intervals = [], None, {}
    for index, e in enumerate(rows):
        if e.get('phase') == 'node_phase_prepared':
            if pending is not None:
                failures.append('phase_overlap')
            pending = (e.get('receipt', {}), index)
        if e.get('phase') == 'node_phase_paused':
            # The dedicated verifier above proves the read-only interruption,
            # explicit resume, original launch and non-extended deadline.
            if not pending or e.get('receipt', {}).get('phase') != 'execute':
                failures.append('invalid_phase_pause')
            pending = None
        if e.get('phase') == 'node_phase_completed':
            receipt = e.get('receipt', {})
            if (not pending or receipt.get('receipt_id') != pending[0].get('receipt_id')
                    or receipt.get('phase') != pending[0].get('phase') or receipt.get('status') != 'verified'):
                failures.append('phase_receipt_pair')
            else:
                intervals[receipt['phase']] = (pending[1], index)
            completed.append(receipt.get('phase'))
            pending = None
    if pending or completed != expected_phases:
        failures.append('phase_order_or_incomplete')
    if request.get('finish') != finish or request.get('inputs'):
        failures.append('unsupported_done_audit_request')
    p = request['parameters']; source = source_with_delivery_metadata(events, p['source']); settings = settings_override if settings_override is not None else p['settings']
    if settings_override is None and request.get('target', {}).get('kind') == 'new':
        try:
            settings = source_ordered_settings(settings, source_bytes)
        except (ValueError, KeyError, TypeError, UnicodeError, IndexError):
            failures.append('source_field_binding')
    if len(source_bytes) != source['bytes'] or hashlib.sha256(source_bytes).hexdigest() != source['sha256']:
        failures.append('original_source_bytes')
    uploads = [e.get('outcome', {}) for e in events if e.get('operation_id') == source['upload_operation_id']
               and e.get('outcome', {}).get('status') == 'SUCCEEDED'
               and e.get('outcome', {}).get('output', {}).get('server_copy_verification')]
    if not uploads:
        failures.append('verified_upload_receipt_missing')
    for upload in uploads:
        o = upload['output']; proof = o['server_copy_verification']
        if (upload.get('action_key') != 'artifact.upload' or upload.get('cleanup_complete') is not True
                or o.get('artifact_id') != source['artifact_id'] or proof.get('status') != 'SUCCEEDED'
                or proof.get('bytes_verified') is not True or proof.get('upload_completion_verified') is not True
                or any(v.get('bytes') != source['bytes'] or v.get('sha256') != source['sha256']
                       or v.get('destination') != settings['source']['source_path'] for v in [o, proof])):
            failures.append('upload_identity')
        download_rows = [e for e in events if e.get('operation_id') == proof.get('verification_id')]
        phases = [e.get('phase') for e in download_rows]
        normal = ['download_prepared', 'download_completed', 'download_verified', 'verification_completed']
        recovered = ['download_prepared', 'download_transport_uncertain', 'download_completed', 'download_verified', 'verification_completed']
        if phases not in (normal, recovered):
            failures.append('download_phase_order')
        elif phases == recovered:
            uncertain = download_rows[1].get('outcome', {})
            if (uncertain.get('status') != 'AMBIGUOUS' or uncertain.get('error', {}).get('code') != 'BROWSER_CALL_UNCERTAIN'
                    or uncertain.get('operation_id') != proof.get('verification_id')
                    or download_rows[1].get('parameters') != download_rows[0].get('parameters')):
                failures.append('download_recovered_receipt_binding')
        verifications = [e.get('outcome', {}) for e in download_rows if e.get('phase') == 'verification_completed']
        if len(verifications) != 1:
            failures.append('download_verification_receipt')
        else:
            v = verifications[0]
            out = v.get('output', {})
            if (v.get('status') != 'SUCCEEDED' or v.get('cleanup_complete') is not True
                    or out.get('bytes_verified') is not True or out.get('upload_completion_verified') is not True
                    or out.get('upload_operation_id') != source['upload_operation_id']
                    or out.get('artifact_id') != source['artifact_id'] or out.get('bytes') != source['bytes']
                    or out.get('sha256') != source['sha256'] or out.get('destination') != settings['source']['source_path']):
                failures.append('download_verification_identity')
    def phase_steps(name):
        start, end = intervals.get(name, (-1, -1))
        return {e.get('step') for e in rows[start+1:end] if e.get('internal_provenance') == 'client_node_procedure_v1'}
    configured_steps = phase_steps('configure')
    field_audit = verify_import_field_observations(
        [(step, s) for step, s in sequence['observations'] if step in configured_steps],
        [(step, a, o) for step, a, o in sequence['mutations'] if step in configured_steps], settings)
    failures.extend(field_audit['failures'])
    bindings = [s.get('prepared_node_context', {}) for _, s in sequence['observations']]
    node_ids = {b.get('node_id') for b in bindings}
    if (not bindings or len(node_ids) != 1 or None in node_ids or any(b.get('verified') is not True
            or b.get('document_id') != request['document_id'] or b.get('workflow_id') != request['workflow_ref']['workflow_id'] for b in bindings)):
        failures.append('prepared_node_binding')
    graph_states = [e.get('target_state', {}) for e in rows if e.get('phase') == 'node_target_checkpoint']
    graph = next((s['final_graph'] for s in reversed(graph_states)
                  if s.get('completed') is True and s.get('final_graph', {}).get('complete') is True), None)
    if graph is None:
        graph = next((s.get('last_graph') for s in reversed(graph_states) if s.get('last_graph')), {})
    nodes = [n for n in graph.get('nodes', []) if n.get('ref', {}).get('node_id') in node_ids]
    if (len(nodes) != 1 or nodes[0].get('type') != 'imports.text'
            or nodes[0].get('label') != (target_label_override if target_label_override is not None else request['target'].get('label'))
            or nodes[0].get('inputs') != [] or nodes[0].get('outputs') != [0]):
        failures.append('target_graph_identity')
    output_fields = output_columns_override if output_columns_override is not None else [c for c in settings['columns'] if c['used']]
    mapping_steps = phase_steps('output_mapping')
    if request.get('mappings'):
        from port_mapping_evidence import configured_mapping_goal, verify_configured_mapping_final
        try:
            if len(request['mappings'])!=1 or output_columns_override is not None:raise ValueError('one_explicit_mapping_required')
            output_fields=configured_mapping_goal(request['mappings'][0],settings['columns'])
            failures.extend(verify_configured_mapping_final(
                [(step,s) for step,s in sequence['observations'] if step in mapping_steps],
                [(step,a,o) for step,a,o in sequence['mutations'] if step in mapping_steps],
                request['mappings'][0],settings['columns'],output_fields))
        except (ValueError,KeyError,TypeError) as error:failures.append('unsupported_mapping_goal:'+str(error))
    mappings = [s['wizard']['output_columns'] for step, s in sequence['observations'] if step in mapping_steps
                and s.get('wizard', {}).get('output_columns', {}).get('definition_coverage', {}).get('status') == 'complete_configured_rows']
    pages = [s['wizard']['output_columns'] for step, s in sequence['observations'] if step in mapping_steps
             and s.get('wizard', {}).get('output_columns', {}).get('page', {}).get('status') == 'complete_definition_page']
    if pages:
        starts = [i for i, m in enumerate(pages) if m['page'].get('offset') == 0]
        pages = pages[starts[-1]:] if starts else []
        offset, schema_id, all_fields = 0, None, []
        for m in pages:
            p = m['page']; fields = m.get('fields', [])
            if (p.get('offset') != offset or p.get('total_columns') != len(output_fields)
                    or p.get('limit') != 8 or p.get('returned') != len(fields)
                    or len(fields) != min(8, len(output_fields)-offset)
                    or not p.get('schema_id') or schema_id and schema_id != p['schema_id']
                    or any(f.get('index') != offset+i for i, f in enumerate(fields))):
                failures.append('output_page_identity_or_coverage')
            offset += len(fields); schema_id = p.get('schema_id'); all_fields.extend(fields)
            if p.get('next_offset') != (None if offset == len(output_fields) else offset):
                failures.append('output_page_cursor')
        if offset != len(output_fields):
            failures.append('output_page_sweep_incomplete')
        mappings = [{'fields': all_fields, 'definition_coverage': {'count': offset}}]
    if not mappings:
        failures.append('complete_output_mapping_missing')
    for m in mappings:
        cols = m.get('fields', [])
        if len(cols) != len(output_fields) or m['definition_coverage'].get('count') != len(cols):
            failures.append('output_mapping_coverage')
        for c, wanted in zip(cols, output_fields):
            if (any(c.get(k) != wanted[k] for k in ['name', 'label', 'type', 'data_kind'])
                    or c.get('source', {}).get('status') != 'rendered_source'
                    or c['source'].get('label') != wanted.get('mapping_source_label',wanted['label']) or c['source'].get('type') != wanted['type']):
                failures.append('output_mapping_values')
    actions = sequence['mutations']
    if finish == 'close':
        from node_procedure_evidence import bound_wizard_close_confirmation
        finish_steps = phase_steps('finish')
        close_actions = [(step, a, o) for step, a, o in actions if step in finish_steps]
        if (sum(a.get('verb') in ('open_wizard', 'begin_wizard') for _, a, _ in actions) != 1
                or any(a.get('verb') in ('finish_wizard', 'execute_wizard') for _, a, _ in actions)
                or [a.get('verb') for _, a, _ in close_actions] != ['click', 'confirm_wizard_close']):
            failures.append('one_open_close_confirmation_required')
        else:
            first, confirmation = close_actions
            before = next((state for step, state in reversed(sequence['observations']) if step < first[0]), {})
            targets = [e for e in before.get('ui', {}).get('elements', []) if e.get('ref') == first[1].get('ref')]
            if len(targets) != 1 or targets[0].get('tid') != before.get('wizard', {}).get('root_tid', '') + ';btnClose':
                failures.append('wizard_close_button_owner')
            before_confirmation = next((state for step, state in reversed(sequence['observations']) if step < confirmation[0]), {})
            if (not bound_wizard_close_confirmation(before_confirmation)
                    or not any(t.get('event') == 'wizard_cancel_graph_verified' for t in confirmation[2].get('trace', []))):
                failures.append('wizard_close_confirmation_missing')
    else:
        verb = 'execute_wizard' if finish == 'execute' else 'finish_wizard'
        if (sum(a.get('verb') in ('open_wizard', 'begin_wizard') for _, a, _ in actions) != 1
                or sum(a.get('verb') == verb for _, a, _ in actions) != 1
                or any(a.get('verb') == ('finish_wizard' if finish == 'execute' else 'execute_wizard') for _, a, _ in actions)):
            failures.append('one_open_one_done_required' if finish == 'done' else 'one_open_one_execute_required')
        finishes = [o for _, a, o in actions if a.get('verb') == verb]
        event = 'wizard_execute_graph_verified' if finish == 'execute' else 'wizard_finish_graph_verified'
        if not finishes or not any(t.get('event') == event for t in finishes[0].get('trace', [])):
            failures.append('done_graph_receipt_missing' if finish == 'done' else 'execute_graph_receipt_missing')
    if not sequence['observations'] or sequence['observations'][-1][1].get('wizard', {}).get('status') != 'absent':
        failures.append('final_graph_missing')
    if finish == 'close':
        context = sequence['observations'][-1][1].get('prepared_node_context', {}) if sequence['observations'] else {}
        if (context.get('verified') is not True or context.get('surface') != 'graph'
                or context.get('locked') is not False or context.get('node_id') not in node_ids):
            failures.append('close_same_node_unlocked_missing')
    checkpoints = [e.get('result', {}) for e in rows if e.get('phase') == 'node_checkpoint']
    if (len(checkpoints) != 1 or checkpoints[0].get('execution', {}).get('status') != ('completed' if finish == 'execute' else 'not_requested')
            or checkpoints[0].get('output', {}).get('status') not in (['complete', 'partial'] if finish == 'execute' and request.get('read', {}).get('ports') else ['complete' if finish == 'execute' else 'not_refreshed'])
            or checkpoints[0].get('package_saved') is not False):
        failures.append('done_checkpoint_semantics' if finish == 'done' else 'execute_checkpoint_semantics')
    if finish == 'close' and (not checkpoints or checkpoints[0].get('configuration', {}).get('status') != 'discarded'
                             or checkpoints[0].get('checkpoint_kind') != 'local_node_cancellation'):
        failures.append('close_checkpoint_semantics')
    return {'passed': not failures, 'failures': sorted(set(failures)), 'columns_verified': field_audit['columns_verified'],
            'scope': 'verified_upload_to_node_'+finish, 'execution_verified': False, 'package_persistence_verified': False,
            'hermes_acceptance_verified': False, 'journal_authentication_verified': False}


def verify_text_import_done(events, request, source_bytes):
    return _verify_text_import(events, request, source_bytes, 'done')


def verify_text_import_close(events, request, source_bytes, reopened):
    result = _verify_text_import(events, request, source_bytes, 'close')
    failures = list(result['failures'])
    rows = [e for e in events if e.get('operation_id') == request['operation_id']]
    opened = [e['outcome']['output'] for e in rows if e.get('phase') == 'node_observation_completed'
              and e.get('outcome', {}).get('output', {}).get('wizard', {}).get('stage') == 'text_import_file']
    before = opened[0] if opened else {}
    if not cancelled_new_node_source_matches(before, reopened, request):
        failures.append('cancelled_new_node_source_roundtrip')
    result.update(passed=not failures, failures=sorted(set(failures)),
                  scope='new_import_draft_cancel_and_source_roundtrip', draft_discard_verified=not failures)
    return result

def cancelled_new_node_source_matches(before, reopened, request):
    def source_values(state):
        return {name: f.get('value') for name, f in state.get('wizard', {}).get('import_source', {}).get('fields', {}).items()
                if f.get('status') == 'observed' and not f.get('truncated')}
    node = before.get('prepared_node_context', {})
    actual = reopened.get('prepared_node_context', {})
    if (request.get('target', {}).get('kind') != 'new' or source_values(before).get('source_path') != ''
            or set(source_values(before)) != {'source_path', 'connection', 'encoding', 'rows_to_skip', 'first_line_as_title'} or source_values(reopened) != source_values(before)
            or actual.get('verified') is not True
            or any(actual.get(k) != node.get(k) for k in ('document_id', 'workflow_id', 'node_id'))):
        return False
    return True
