"""Independent import -> exact package save/reopen -> unchanged settings/output audit.

This dedicated QA composition permits a fresh workspace binding after closing a
package. Ordinary existing-node patch audits still require the original binding.
Journal evidence is not a cryptographic authentication claim.
"""
import argparse
import json
import re
from pathlib import Path
from existing_import_evidence import _verify_existing_import_output


def verify_saved_package_transition(events, seed_request, request, save_operation_id, save_parameters, *, checkpoint_mode=False):
    failures = []
    def unique(phase, operation_id):
        matches = [(i, e) for i, e in enumerate(events)
                   if e.get('phase') == phase and e.get('operation_id') == operation_id]
        if len(matches) != 1:
            failures.append('unique_' + phase)
            return -1, {}
        return matches[0]
    seed_pos, seed = unique('node_checkpoint', seed_request.get('operation_id'))
    start_pos, start = unique('prepared', save_operation_id)
    end_pos, end = unique('completed', save_operation_id)
    preparations = [(i, e) for i, e in enumerate(events)
                    if e.get('phase') == 'saved_package_prepared' and e.get('save_operation_id') == save_operation_id]
    if len(preparations) != 1:
        return {'passed': False, 'failures': failures + ['unique_saved_preparation']}
    prepare_pos, prepare_event = preparations[0]
    request_pos, declared = unique('node_apply_prepared', request.get('operation_id'))
    if not (0 <= seed_pos < start_pos < end_pos < prepare_pos < request_pos):
        failures.append('save_reopen_order')
    if len({seed_request.get('operation_id'), request.get('operation_id'), save_operation_id,
            prepare_event.get('operation_id')}) != 4:
        failures.append('distinct_operation_ids')
    if declared.get('request') != request:
        failures.append('reopened_declared_request')
    path = save_parameters.get('path')
    if (not isinstance(path, str) or not path.startswith('/') or not path.endswith('.lgp')
            or any(part in ('', '.', '..') for part in path.split('/')[1:])
            or save_parameters.get('conflict_policy') != 'fail'):
        failures.append('exact_new_package_path')
    # This acceptance covers a new file and a no-op patch only. Changing settings
    # here could conceal a failure to persist the original configuration.
    columns = seed_request.get('parameters', {}).get('settings', {}).get('columns', [])
    patch = {'columns': [{'name': columns[0]['name'], 'label': columns[0]['label']}]} if columns else None
    if (request.get('mappings')
            or request.get('parameters', {}).get('settings') != patch
            or request.get('parameters', {}).get('source') != seed_request.get('parameters', {}).get('source')):
        failures.append('reopened_noop_patch_required')
    outcome = end.get('outcome', {})
    checkpoint = start.get('checkpoint', {})
    for row in (start, end):
        if (row.get('action_key') != ('package.save_checkpoint' if checkpoint_mode else 'package.save_as') or row.get('action_revision') != '1'
                or row.get('parameters') != save_parameters or row.get('checkpoint') != checkpoint):
            failures.append('save_action_contract')
    old = seed_request.get('workflow_ref', {})
    new = request.get('workflow_ref', {})
    if (checkpoint.get('path') != path or checkpoint.get('workflow_ref') != {k: old.get(k) for k in ('tab_tid', 'prefix')}
            or checkpoint.get('package_identity', {}).get('path') != ''):
        failures.append('save_original_draft_binding')
    label = seed_request.get('target', {}).get('label')
    tid_label = re.sub(r'\s', '_', str(label)).replace(',', '')
    expected_graph = {'nodes': [label], 'ports': [{'node_label': label, 'tids': [tid_label+';Input_Connection[0]',
                      tid_label+';Input_Var[0]', tid_label+';Output_Data[0]']}], 'links': []}
    if checkpoint.get('graph') != expected_graph:
        failures.append('save_original_graph')
    expected_output = {'package_ref': {'kind': 'package', 'path': path, 'active_identity': path}, 'reopened': not checkpoint_mode}
    if checkpoint_mode:
        expected_output.update(workflow_preserved=True, save_completed=True, persisted_content_verified=False)
    if checkpoint_mode and 'workflow_continuations' in outcome.get('output', {}):
        continuations = outcome['output']['workflow_continuations']
        expected_output['workflow_continuations'] = continuations
        observed = [t for t in outcome.get('trace', []) if t.get('event') == 'save_continuations_observed']
        matching = [c for c in continuations if c.get('document_id') == seed_request.get('document_id')
                    and c.get('previous_workflow_ref') == old]
        if (len(observed) != 1 or observed[0].get('continuations') != continuations or len(matching) != 1
                or any(matching[0].get('workflow_ref', {}).get(k) != old.get(k) for k in ('workflow_id','tab_tid','prefix'))):
            failures.append('saved_workflow_continuation')
    if (outcome.get('status') != 'SUCCEEDED' or outcome.get('phase') != 'verified'
            or outcome.get('cleanup_complete') is not True or outcome.get('error') is not None
            or outcome.get('operation_id') != save_operation_id or outcome.get('action_key') != ('package.save_checkpoint' if checkpoint_mode else 'package.save_as')
            or outcome.get('output') != expected_output):
        failures.append('save_verified_outcome')
    trace = outcome.get('trace', [])
    names = (['save_requested', 'save_flow_completed', 'open_saved_package_observed', 'postcondition_verified']
             if checkpoint_mode else ['save_requested', 'saved_package_closed', 'package_open_command_ready',
                                      'reopened_package_observed', 'postcondition_verified'])
    selected = []
    for name in names:
        matches = [(i, t) for i, t in enumerate(trace) if t.get('event') == name]
        if len(matches) != 1:
            failures.append('save_trace_' + name)
        else:
            selected.append(matches[0])
    if len(selected) == len(names):
        if [i for i, _ in selected] != sorted(i for i, _ in selected):
            failures.append('save_trace_order')
        saved = selected[0][1]
        observed, post = [t for _, t in selected[-2:]]
        if (saved.get('path') != path or observed.get('requested_path') != path or observed.get('actual_path') != path
                or observed.get('path_matches') is not True or observed.get('graph_matches') is not True
                or observed.get('graph') != expected_graph or post.get('graph') != expected_graph
                or post.get('package_path') != path or post.get('reopened') is not (not checkpoint_mode)):
            failures.append('reopened_path_graph_evidence')
    qa_ids = set()
    if checkpoint_mode:
        if any(t.get('event') in ('saved_package_closed', 'reopened_package_observed') for t in trace):
            failures.append('checkpoint_must_not_close_or_reopen')
        open_rows = [t for t in trace if t.get('event') == 'open_saved_package_observed']
        post_rows = [t for t in trace if t.get('event') == 'postcondition_verified']
        if (len(open_rows) != 1 or open_rows[0].get('workflow_ref') != checkpoint.get('workflow_ref')
                or open_rows[0].get('workflow_matches') is not True or len(post_rows) != 1
                or post_rows[0].get('proof') != 'awaited_save_flow_same_open_workflow'
                or post_rows[0].get('persisted_content_verified') is not False):
            failures.append('checkpoint_open_workflow_receipt')
        qa_rows = [(i,e) for i,e in enumerate(events) if e.get('phase') == 'checkpoint_reopen_qa'
                   and e.get('save_operation_id') == save_operation_id]
        checks = [(i,e) for i,e in enumerate(events) if e.get('phase') == 'reopened_package_checkpoint'
                  and e.get('save_operation_id') == save_operation_id]
        if len(qa_rows) != 1 or len(checks) != 1:
            failures.append('independent_checkpoint_reopen_required')
        else:
            qi, qe = qa_rows[0]; ci, ce = checks[0]; qa_ids = {qe.get('operation_id'), ce.get('operation_id')}
            qa = qe.get('qa', {}); fresh = ce.get('checkpoint', {})
            if not end_pos < qi < ci < prepare_pos:
                failures.append('checkpoint_qa_order')
            expected_trace = [dict(event='qa_menu_opened'), dict(event='qa_close_clicked'),
                dict(event='qa_saved_package_closed', workflow_ref=old), dict(event='qa_menu_opened'),
                dict(event='qa_open_clicked'), dict(event='qa_open_confirmed', path=path),
                dict(event='qa_reopened_path_observed', path=path)]
            if (qa.get('status') != 'SUCCEEDED' or qa.get('path') != path or qa.get('old_workflow_ref') != old
                    or qa.get('closed') is not True or qa.get('reopened') is not True
                    or qa.get('save_performed') is not False or qa.get('trace') != expected_trace):
                failures.append('checkpoint_qa_no_resave')
            fresh_cp = fresh.get('checkpoint', {})
            if (fresh.get('status') != 'NOT_APPLIED' or fresh.get('phase') != 'prepared'
                    or fresh.get('effect_possible') is not False or fresh.get('cleanup_complete') is not True
                    or fresh_cp.get('path') != path or fresh_cp.get('package_identity', {}).get('path') != path
                    or fresh_cp.get('workflow_ref') != {k: new.get(k) for k in ('tab_tid', 'prefix')}
                    or fresh_cp.get('graph') != expected_graph):
                failures.append('checkpoint_reopened_graph')
            for row in (qe, ce):
                if any(row.get(k) != seed.get(k) for k in ('session_id', 'runtime_revision', 'target')):
                    failures.append('checkpoint_qa_runtime')
    if any(t.get('event') in ('overwrite_confirmed', 'conflict_rejected') for t in trace):
        failures.append('unexpected_package_conflict')
    prep = prepare_event.get('preparation', {})
    if (prepare_event.get('requested_path') != path or prep.get('status') != 'READY'
            or prep.get('phase') != 'exact_workflow_ready' or prep.get('created_draft') is not False
            or prep.get('effect_possible') is not False or prep.get('target_verified') is not True
            or prep.get('package_ref', {}).get('path') != path or prep.get('package_ref', {}).get('persisted') is not True
            or prep.get('document_id') != request.get('document_id') or prep.get('workflow_ref') != new
            or prep.get('session_id') != prepare_event.get('session_id')
            or prep.get('operation_id') != prepare_event.get('operation_id')):
        failures.append('exact_saved_preparation')
    old_node = seed.get('result', {}).get('node', {})
    node = request.get('target', {}).get('ref', {})
    if (not old_node.get('node_id') or node.get('node_id') != old_node['node_id']
            or node.get('document_id') != seed_request.get('document_id')
            or request.get('document_id') != seed_request.get('document_id')
            or node.get('workflow_id') != new.get('workflow_id')
            or any(not new.get(k) or new.get(k) == old.get(k) for k in ('workflow_id', 'tab_tid', 'prefix'))):
        failures.append('reopened_same_node_fresh_workflow')
    relevant = [seed, start, end, prepare_event, declared]
    identities = {(e.get('session_id'), e.get('runtime_revision'), json.dumps(e.get('target'), sort_keys=True)) for e in relevant}
    if len(identities) != 1 or any(not seed.get(k) for k in ('session_id', 'runtime_revision', 'target')):
        failures.append('save_runtime_session_binding')
    # No intervening operation may modify or execute the saved workflow before
    # the declared inspection. Replays leave no new prepared journal records.
    allowed = {seed_request.get('operation_id'), save_operation_id, prepare_event.get('operation_id')} | qa_ids
    for e in events[seed_pos+1:request_pos]:
        request_preflight = (e.get('operation_id') == request.get('operation_id')
                             and e.get('phase') == 'prepared' and e.get('action_key') == 'node.apply'
                             and e.get('parameters') == request)
        if e.get('operation_id') not in allowed and not request_preflight:
            failures.append('intervening_operation')
    return {'passed': not failures, 'failures': sorted(set(failures)), 'package_path': path,
            'graph_reopened_verified': not failures, 'journal_authentication_verified': False}


def verify_saved_import_output(events, seed_request, request, source_bytes, save_operation_id, save_parameters, *, checkpoint_mode=False):
    transition = verify_saved_package_transition(events, seed_request, request, save_operation_id, save_parameters, checkpoint_mode=checkpoint_mode)
    if not transition['passed']:
        return {**transition, 'package_persistence_verified': False}
    result = _verify_existing_import_output(events, seed_request, request, source_bytes, reopened_package=True)
    return {**result, 'scope': 'intermediate_save_separate_reopen_unchanged_settings_fresh_output' if checkpoint_mode else 'saved_import_reopen_unchanged_settings_fresh_output',
            'package_path': transition['package_path'], 'package_persistence_verified': result['passed'],
            'graph_reopened_verified': True, 'hermes_acceptance_verified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--run-dir', required=True)
    args = parser.parse_args(); directory = Path(args.run_dir)
    read = lambda name: json.loads((directory / name).read_text())
    artifact = read('artifact.json')
    result = verify_saved_import_output([json.loads(x) for x in (directory/'execution-events.jsonl').read_text().splitlines()],
        read('request.json'), read('reopened-request.json'), (directory/artifact['name']).read_bytes(),
        read('save-result.json')['operation_id'], read('save-request.json'),
        checkpoint_mode=read('save-result.json')['action_key']=='package.save_checkpoint')
    (directory/'independent-saved-import-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False)); raise SystemExit(0 if result['passed'] else 1)
