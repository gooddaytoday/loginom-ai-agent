"""Bind a real dock_prepare receipt to the unchanged node after final save.

This does not infer persisted settings from a path: native wizard/output audits
are still required after this binding succeeds.
"""
from evidence import PREFIX


def unchanged_patch(baseline, patch):
    if not isinstance(patch, dict) or set(patch) - {'source', 'format', 'columns'}:
        return False
    for group in ('source', 'format'):
        values = patch.get(group, {})
        if not isinstance(values, dict) or any(k not in baseline.get(group, {}) or baseline[group][k] != v for k, v in values.items()):
            return False
    columns = patch.get('columns', [])
    if not isinstance(columns, list):
        return False
    seen = set()
    for column in columns:
        if not isinstance(column, dict) or not isinstance(column.get('name'), str) or column['name'] in seen:
            return False
        seen.add(column['name'])
        matches = [c for c in baseline.get('columns', []) if c.get('name') == column['name']]
        if len(matches) != 1 or any(k not in matches[0] or matches[0][k] != v for k, v in column.items()):
            return False
    return True


def union_unchanged_parameters(a,b):
    try:
        def normalize(p):
            if set(p)!={'prefixes','tables'}:raise ValueError('Union parameters')
            return dict(prefixes=p['prefixes'],tables=[dict(port=t['port'],fields=sorted(t['fields'],key=lambda f:f['source'])) for t in p['tables']])
        return normalize(a)==normalize(b)
    except (KeyError,TypeError,ValueError):return False


def verify_reopen_binding(evidence, seed_request, request, save_operation_id, path, *, calculator=False, grouping=False, sorting=False, reform=False, row_filter=False, join=False, union=False, duplicates=False):
    failures = []
    events = evidence['events']
    saves = [(i, e) for i, e in enumerate(events) if e.get('operation_id') == save_operation_id and e.get('phase') == 'completed']
    declared = [(i, e) for i, e in enumerate(events) if e.get('phase') == 'node_apply_prepared' and e.get('operation_id') == request.get('operation_id')]
    if len(saves) != 1 or len(declared) != 1 or declared[0][1].get('request') != request:
        return dict(passed=False, failures=['reopen_unique_save_and_apply'])
    candidates = [(i, e) for i, e in enumerate(events) if e.get('event') == 'workspace_prepared'
                  and e.get('state', {}).get('workflow_ref') == request.get('workflow_ref')
                  and saves[0][0] < i < declared[0][0]]
    if len(candidates) != 1:
        return dict(passed=False, failures=['reopen_unique_real_preparation'])
    _, event = candidates[0]
    state = event['state']
    calls = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_prepare'
             and c.get('arguments', {}).get('operation_id') == state.get('operation_id')]
    if len(calls) != 1:
        return dict(passed=False, failures=['reopen_unique_prepare_call'])
    call = calls[0]
    replies = [r for r in evidence['tools'] if r.get('tool') == call['tool']
               and r.get('tool_call_id') == call.get('tool_call_id') and r.get('session_id') == call.get('session_id')]
    apply_calls = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_node_apply' and c.get('arguments') == request]
    if (len(replies) != 1 or len(apply_calls) != 1 or call.get('session_id') != apply_calls[0].get('session_id')
            or not call.get('row', -1) < replies[0].get('row', -1) < apply_calls[0].get('row', -1)):
        return dict(passed=False, failures=['reopen_public_pair_order'])
    result = replies[0].get('result', {})
    if (result.get('prepared') is not True or result.get('isError') or result.get('workspace') != state
            or result.get('sessionId') != event.get('session_id')):
        failures.append('reopen_reply_journal')
    args = call['arguments']
    if (args.get('intent') != 'open_package' or args.get('package_path') != path
            or set(args) - {'operation_id', 'intent', 'package_path', 'timeout_ms'}):
        failures.append('reopen_exact_path_intent')
    if (state.get('status') != 'READY' or state.get('phase') != 'exact_workflow_ready'
            or state.get('created_draft') is not False or state.get('authenticated') is not True
            or state.get('target_verified') is not True or state.get('reason') is not None
            or state.get('package_ref', {}).get('path') != path or state.get('package_ref', {}).get('persisted') is not True
            or state.get('session_id') != event.get('session_id')
            or state.get('document_id') != request.get('document_id')
            or event.get('session_id') != saves[0][1].get('session_id')
            or event.get('runtime_revision') != saves[0][1].get('runtime_revision')):
        failures.append('reopen_ready_binding')
    old_flow, new_flow = seed_request.get('workflow_ref', {}), request.get('workflow_ref', {})
    if (request.get('document_id') != seed_request.get('document_id')
            or any(not new_flow.get(k) or new_flow.get(k) == old_flow.get(k) for k in ('workflow_id', 'prefix', 'tab_tid'))):
        failures.append('reopen_fresh_workflow')
    if request.get('mappings'):
        failures.append('reopen_mapping_reapplication')
    if (request.get('target', {}).get('kind') != 'existing'
            or request.get('parameters', {}).get('source') != seed_request.get('parameters', {}).get('source')
            or not (request.get('parameters')==seed_request.get('parameters') if duplicates else union_unchanged_parameters(seed_request.get('parameters'),request.get('parameters')) if union else request.get('parameters')=={'changes':[]} if reform else request.get('parameters')=={} if grouping or sorting or row_filter or join else request.get('parameters')=={'expressions':[]} if calculator else unchanged_patch(seed_request.get('parameters', {}).get('settings', {}), request.get('parameters', {}).get('settings')))):
        failures.append('reopen_unchanged_request')
    return dict(passed=not failures, failures=failures, scope='real_prepare_binding_only',
                settings_persistence_verified=False, hermes_acceptance_verified=False)
