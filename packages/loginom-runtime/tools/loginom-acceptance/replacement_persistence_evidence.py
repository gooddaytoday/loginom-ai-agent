"""Codex diagnostic proof of a saved/reopened Replacement and fresh exact output.

The caller supplies the expected graph and independently fixed output. This is
not a Hermes/public-preparation acceptance verifier.
"""
VERIFIER_VERSION = "replacement-persistence-draft-overwrite-v2"

from replacement_evidence_audit import audit
from replacement_lifecycle_evidence import checkpoint, settings


def verify_persistence(events, before_request, after_request, expected, graph, path, preparation, save_ids, *, revisions):
    failures = []
    try:
        if set(revisions) != {'package.save_checkpoint', 'package.save_as'} or any(not isinstance(v, str) or not v for v in revisions.values()): raise ValueError('expected_save_revisions')
        before = checkpoint(events, before_request['operation_id'])
        after = checkpoint(events, after_request['operation_id'])
        for request in (before_request, after_request):
            if not audit(events, request, expected)['passed']: failures.append('output_or_configuration_' + request['operation_id'])
        position = lambda op, phase: [(i, e) for i, e in enumerate(events) if e.get('operation_id') == op and e.get('phase') == phase]
        before_pos = position(before_request['operation_id'], 'node_checkpoint')[0][0]
        after_pos = position(after_request['operation_id'], 'node_apply_prepared')[0][0]
        identity = lambda row: tuple(str(row.get(k)) for k in ('session_id', 'runtime_revision', 'manifest_sha256', 'target'))
        seed_event = position(before_request['operation_id'], 'node_checkpoint')[0][1]
        if any(seed_event.get(k) is None for k in ('session_id', 'runtime_revision', 'manifest_sha256', 'target')): failures.append('persistence_runtime_identity')
        flow = {k: before_request['workflow_ref'][k] for k in ('tab_tid', 'prefix')}
        drafts = [(i, e) for i, e in enumerate(events) if e.get('event') == 'workspace_prepared'
                  and {k: e.get('state', {}).get('workflow_ref', {}).get(k) for k in flow} == flow]
        if len(drafts) != 1: raise ValueError('unique_initial_draft')
        draft_pos, draft_event = drafts[0]; draft = draft_event['state']
        draft_ref = draft.get('package_ref', {})
        if (not draft_pos < before_pos or identity(draft_event) != identity(seed_event)
                or draft.get('status') != 'READY' or draft.get('created_draft') is not True
                or draft.get('ownership_verified') is not True or draft.get('session_id') != seed_event['session_id']
                or draft.get('document_id') != before_request['document_id']
                or draft_ref.get('path', 'missing') is not None or draft_ref.get('persisted') is not False
                or not isinstance(draft_ref.get('name'), str) or not draft_ref['name']):
            failures.append('initial_draft_binding')
        previous_saved_path = None
        previous = before_pos
        if len(save_ids) != 2 or len(set(save_ids)) != 2: raise ValueError('two_unique_saves')
        for op, key, reopened in zip(save_ids, ('package.save_checkpoint', 'package.save_as'), (False, True)):
            starts, ends = position(op, 'prepared'), position(op, 'completed')
            if len(starts) != 1 or len(ends) != 1: raise ValueError('unique_save_receipts')
            si, start = starts[0]; ei, end = ends[0]
            if not previous < si < ei < after_pos: failures.append('save_order')
            previous = ei
            params = dict(path=path, conflict_policy='replace' if reopened else 'fail')
            for row in (start, end):
                if row.get('action_key') != key or row.get('action_revision') != revisions[key] or row.get('parameters') != params or identity(row) != identity(seed_event): failures.append('save_contract_identity')
            cp = start['checkpoint']
            if cp != end.get('checkpoint') or cp.get('path') != path or cp.get('graph') != graph or cp.get('workflow_ref') != flow or cp.get('package_identity', {}).get('path') != (previous_saved_path if reopened else ''): failures.append('save_before_graph')
            if not reopened and cp.get('package_identity') != dict(path='', name=draft_ref.get('name')):
                failures.append('initial_draft_identity')
            if reopened and previous_saved_path != path: failures.append('previous_save_path')
            result = end['outcome']; out = result['output']
            if result.get('status') != 'SUCCEEDED' or result.get('operation_id') != op or result.get('action_key') != key or result.get('phase') != 'verified' or result.get('cleanup_complete') is not True or result.get('error') is not None or out.get('package_ref') != dict(kind='package',path=path,active_identity=path) or out.get('reopened') is not reopened: failures.append('save_outcome')
            trace = result['trace']
            names = ['save_requested', 'save_conflict_observed', 'overwrite_confirmed', 'save_flow_completed', 'saved_package_closed', 'package_open_command_ready', 'reopened_package_observed', 'postcondition_verified'] if reopened else ['save_requested', 'save_flow_completed', 'open_saved_package_observed', 'postcondition_verified']
            selected = []
            for name in names:
                found = [(i, t) for i, t in enumerate(trace) if t.get('event') == name]
                if len(found) != 1: raise ValueError('save_trace_' + name)
                selected.append(found[0])
            if [i for i, _ in selected] != sorted(i for i, _ in selected): failures.append('save_trace_order')
            observed, post = selected[-2][1], selected[-1][1]
            if observed.get('actual_path') != path or observed.get('requested_path') != path or observed.get('path_matches') is not True or observed.get('graph_matches') is not True or observed.get('graph') != graph or post.get('graph') != graph or post.get('package_path') != path or post.get('reopened') is not reopened: failures.append('save_raw_path_graph')
            conflicts = [(i, t) for i, t in enumerate(trace) if t.get('event') == 'save_conflict_observed']
            overwrites = [i for i, t in enumerate(trace) if t.get('event') == 'overwrite_confirmed']
            if not reopened and (conflicts or overwrites): failures.append('draft_unexpected_overwrite')
            if conflicts or overwrites:
                if len(conflicts) != 1 or len(overwrites) != 1 or conflicts[0][1].get('path') != path or not selected[0][0] < conflicts[0][0] < overwrites[0] < next(i for i, t in selected if t.get('event') == 'save_flow_completed'): failures.append('save_overwrite_binding')
            previous_saved_path = out['package_ref']['path']
        if preparation.get('status') != 'READY' or preparation.get('created_draft') is not False or preparation.get('package_ref', {}).get('path') != path or preparation.get('package_ref', {}).get('persisted') is not True or preparation.get('document_id') != after_request['document_id'] or preparation.get('workflow_ref') != after_request['workflow_ref']: failures.append('reopen_preparation')
        old, new = before['node'], after['node']
        if preparation.get('session_id') != seed_event.get('session_id') or any(before_request['workflow_ref'][k] == after_request['workflow_ref'][k] for k in ('prefix', 'tab_tid')): failures.append('reopen_session_and_tab')
        if old['node_id'] != new['node_id'] or old['document_id'] != new['document_id'] or old['workflow_id'] == new['workflow_id'] or after_request['target']['ref'] != new: failures.append('reopen_node_identity')
        if after_request['parameters'] or after_request['mappings'] or after_request['finish'] != 'execute' or settings(before) != settings(after): failures.append('reopen_settings_unchanged')
        if before['execution']['execution_id'] == after['execution']['execution_id']: failures.append('reopen_execution_freshness')
    except (KeyError, TypeError, ValueError, IndexError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=failures, scope='codex_replacement_save_reopen_reexecute', autonomous_acceptance=False)
