"""Prove saves at semantic boundaries of a naturally planned sales graph."""
import re


def graph_at(requests, results):
    labels = {results[r['operation_id']]['node']['node_id']: re.sub(r'\s', '_', r['target']['label']).replace(',', '') for r in requests}
    nodes, ports, links = [], [], []
    for r in requests:
        label = labels[results[r['operation_id']]['node']['node_id']]
        kind = r['target']['type']
        suffixes = (['Input_Connection[0]', 'Input_Var[0]', 'Output_Data[0]'] if kind == 'imports.text'
                    else ['Input_Data[0]', 'Input_Var[0]', 'Output_Data[0]'] if kind == 'transform.calculator'
                    else ['Input_Data[0]', 'Output_Data[0]'])
        nodes.append(label)
        ports.append(dict(node_label=label, tids=[label+';'+s for s in suffixes]))
        for source in r['inputs']:
            links.append(labels[source['source']['node_id']]+'|Output_Data[0]|'+label+'|Input_Data[0]')
    return dict(nodes=sorted(nodes), ports=sorted(ports, key=lambda p: p['node_label']), links=sorted(links))


def verify_checkpoint_schedule(events, declarations, roots, revisions, *, policy='legacy', reopen_requested=False):
    failures = []
    def need(v, name):
        if not v: raise ValueError(name)
    keys = ('package.save_checkpoint', 'package.save_as')
    try:
        need(policy in ('legacy', 'user'), 'save_policy')
        need(set(revisions) == set(keys) and all(isinstance(v, str) and v for v in revisions.values()), 'save_revision_contract')
        new = [r for r in declarations if r['target']['kind'] == 'new']
        checkpoints = {e['operation_id']: (i, e) for i, e in enumerate(events) if e.get('phase') == 'node_checkpoint'}
        results = {op: e['result'] for op, (_, e) in checkpoints.items()}
        starts = [(i, e) for i, e in enumerate(events) if e.get('phase') == 'prepared' and e.get('action_key') in keys]
        ends = [(i, e) for i, e in enumerate(events) if e.get('phase') == 'completed' and e.get('action_key') in keys]
        need((4 if policy == 'legacy' else 1) <= len(starts) == len(ends) <= 12, 'checkpoint_attempt_count')
        expected_keys = ([keys[0]]*(len(starts)-1)+[keys[1]] if policy == 'legacy'
                         else [keys[1] if reopen_requested else keys[0]]*len(starts))
        need([e['action_key'] for _, e in starts] == expected_keys, 'requested_save_mode')
        seed = next(r for r in new if r['target']['type'] == 'imports.text')
        seed_event = checkpoints[seed['operation_id']][1]
        identity = lambda e: (e.get('session_id'), e.get('runtime_revision'), e.get('target'))
        need(all(identity(seed_event)), 'save_source_identity')
        used_ids, saved_path, previous_end = set(), '', -1
        persisted, declined = [], []
        for (start_pos, start), (end_pos, end) in zip(starts, ends):
            operation = start['operation_id']; key = start['action_key']; reopened = key == keys[1]
            need(operation not in used_ids and previous_end < start_pos < end_pos, 'save_sequence')
            used_ids.add(operation); previous_end = end_pos
            path = start['parameters']['path']; parameters = start['parameters']; cp = start['checkpoint']
            need(isinstance(path, str) and path.endswith('.lgp') and not any(p in ('', '.', '..') for p in path.split('/')[1:]) and '\\' not in path
                 and any(path.startswith(root.rstrip('/')+'/') for root in roots), 'save_allowed_path')
            need(parameters == dict(path=path, conflict_policy=parameters.get('conflict_policy')) and parameters['conflict_policy'] in ('fail', 'replace'), 'save_parameters')
            if parameters['conflict_policy'] == 'replace': need(bool(saved_path) and path == saved_path, 'replace_only_current_owned_package')
            accepted = [r for r in new if checkpoints[r['operation_id']][0] < start_pos]
            expected = graph_at(accepted, results)
            prior_matches = cp['package_identity']['path'] == saved_path or (policy == 'user' and not saved_path and cp['package_identity']['path'] is None)
            need(cp['path'] == path and cp['graph'] == expected and prior_matches, 'save_graph_and_prior_path')
            need(cp['workflow_ref'] == {k: seed['workflow_ref'][k] for k in ('tab_tid', 'prefix')}, 'save_workflow')
            need(all(e['operation_id'] == operation and e['action_key'] == key and e['action_revision'] == revisions[key]
                     and e['parameters'] == parameters and e['checkpoint'] == cp and identity(e) == identity(seed_event) for e in (start, end)), 'save_receipt_binding')
            outcome = end['outcome']; out = outcome['output']; trace = outcome['trace']
            if outcome.get('status') == 'NOT_APPLIED':
                need(not reopened and parameters['conflict_policy'] == 'fail'
                     and outcome['phase'] == 'applying' and outcome['effect_possible'] is True
                     and outcome['cleanup_complete'] is True and outcome['error'] is None
                     and outcome['operation_id'] == operation and outcome['action_key'] == key
                     and outcome['action_revision'] == revisions[key]
                     and out == dict(path=path, conflict=True), 'declined_conflict_outcome')
                need([t.get('event') for t in trace] == ['action_started', 'preconditions_verified',
                     'save_requested', 'save_conflict_observed', 'conflict_rejected', 'cleanup_completed']
                     and trace[0]['capability'] == 'package.save_checkpoint.v1' and trace[0]['mode'] == 'apply'
                     and trace[1]['active_tab'] == cp['workflow_ref']['prefix']
                     and trace[2]['path'] == trace[3]['path'] == path
                     and trace[5]['resource'] == 'transient_dialog', 'declined_conflict_trace')
                declined.append(operation)
                continue
            need(outcome['status'] == 'SUCCEEDED' and outcome['phase'] == 'verified' and outcome['cleanup_complete'] is True
                 and outcome['error'] is None and outcome['operation_id'] == operation and outcome['action_key'] == key
                 and (policy == 'legacy' or outcome.get('action_revision') == revisions[key])
                 and out['package_ref'] == dict(kind='package', path=path, active_identity=path) and out['reopened'] is reopened, 'save_verified_outcome')
            names = (['save_requested', 'saved_package_closed', 'package_open_command_ready', 'reopened_package_observed', 'postcondition_verified'] if reopened
                     else ['save_requested', 'save_flow_completed', 'open_saved_package_observed', 'postcondition_verified'])
            selected = []
            for name in names:
                found = [(i, t) for i, t in enumerate(trace) if t.get('event') == name]
                need(len(found) == 1, 'save_trace_'+name); selected.append(found[0])
            need([i for i, _ in selected] == sorted(i for i, _ in selected), 'save_trace_order')
            requested, observed, post = selected[0][1], selected[-2][1], selected[-1][1]
            need(requested['path'] == observed['requested_path'] == observed['actual_path'] == post['package_path'] == path
                 and observed['path_matches'] is True and observed['graph_matches'] is True
                 and observed['graph'] == post['graph'] == expected and post['reopened'] is reopened, 'save_observed_path_graph')
            if not reopened:
                need(out['workflow_preserved'] is True and out['save_completed'] is True and out['persisted_content_verified'] is False
                     and observed['workflow_ref'] == cp['workflow_ref'] and observed['workflow_matches'] is True
                     and post['proof'] == 'awaited_save_flow_same_open_workflow' and post['persisted_content_verified'] is False
                     and not any(t.get('event') in ('saved_package_closed', 'reopened_package_observed') for t in trace), 'checkpoint_open_workflow')
            conflicts = [(i, t) for i, t in enumerate(trace) if t.get('event') == 'save_conflict_observed']
            overwrites = [(i, t) for i, t in enumerate(trace) if t.get('event') == 'overwrite_confirmed']
            if conflicts or overwrites:
                need(path == saved_path and parameters['conflict_policy'] == 'replace' and len(conflicts) == len(overwrites) == 1
                     and conflicts[0][1]['path'] == path and selected[0][0] < conflicts[0][0] < overwrites[0][0] < selected[1][0], 'save_owned_overwrite_trace')
            need(not any(t.get('event') == 'conflict_rejected' for t in trace), 'save_conflict_rejected')
            saved_path = path
            persisted.append(((start_pos, start), (end_pos, end)))
        need(4 <= len(persisted) <= 8 if policy == 'legacy' else len(persisted) == 1, 'checkpoint_count')
        starts = [start for start, _ in persisted]; ends = [end for _, end in persisted]
        used_sources = {s['source']['node_id'] for r in new for s in r['inputs']}
        boundaries = [r for r in new if r['target']['type'] == 'imports.text' or results[r['operation_id']]['node']['node_id'] not in used_sources]
        new_starts = [i for i, e in enumerate(events) if e.get('phase') == 'node_apply_prepared' and e['request']['target']['kind'] == 'new']
        for r in boundaries if policy == 'legacy' else []:
            end_pos = checkpoints[r['operation_id']][0]
            limit = min([i for i in new_starts if i > end_pos]+[starts[-1][0]])
            need(any(end_pos < a < b < limit and s['action_key'] == keys[0] for (a, s), (b, _) in zip(starts, ends)), 'missing_boundary_save:'+r['operation_id'])
        need(starts[-1][0] > max(checkpoints[r['operation_id']][0] for r in new), 'final_after_all_nodes')
        return dict(passed=True, failures=[], saves=len(starts), boundaries=len(boundaries) if policy == 'legacy' else 0, package_path=saved_path,
                    declined_conflicts=declined,
                    scope='journal_bound_import_branch_checkpoints_and_final_reopen' if policy == 'legacy'
                    else 'journal_bound_user_final_save' + ('_with_requested_reopen' if reopen_requested else '_without_reopen'))
    except (KeyError, TypeError, ValueError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=False, failures=failures)
