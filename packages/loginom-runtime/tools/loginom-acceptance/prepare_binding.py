"""Narrow evidence binding, not a claim all preparation failures lack effects."""
_ALREADY_PREPARED = ('Workspace is already prepared. Use dock_workspace_observe for the current UI and '
                    'dock_action_describe to reread input_artifacts. Preparation has not changed the workspace.')


def successful_prepare(evidence, prefix, caller_session, before_row):
    """One successful preparation; tolerate only the pinned explicit repeat refusal.

    workspace.mjs rejects this exact case before calling browser prepare. bridge
    may already have refreshed skill metadata: no general no-effect assertion.
    Runtime/source pin verification remains the outer auditor's responsibility.
    """
    if any(isinstance(t.get('result'), dict) and isinstance(t['result'].get('workspace'), dict)
           and 'operation_id' in t['result']['workspace'] for t in evidence['tools'] if t.get('tool') == prefix+'dock_prepare'):
        return verified_prepare_v1(evidence, prefix, caller_session, before_row)
    calls = [c for c in evidence['calls'] if c.get('tool') == prefix+'dock_prepare']
    replies = [t for t in evidence['tools'] if t.get('tool') == prefix+'dock_prepare']
    if not calls or len(calls) != len(replies):
        return None
    ids = [c.get('tool_call_id') for c in calls]
    if any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
        return None
    pairs = []
    for call in calls:
        matching = [t for t in replies if t.get('tool_call_id') == call['tool_call_id']]
        if len(matching) != 1:
            return None
        reply = matching[0]
        if call.get('session_id') != caller_session or reply.get('session_id') != caller_session:
            return None
        if type(call.get('row')) is not int or type(reply.get('row')) is not int or not call['row'] < reply['row']:
            return None
        if not isinstance(reply.get('result'), dict) or call.get('arguments') != {}:
            return None
        pairs.append((call, reply))
    good = [(c,t) for c,t in pairs if t['result'].get('prepared') is True and t['result'].get('isError') is not True]
    if len(good) != 1:
        return None
    call, reply = good[0]
    result = reply['result']
    if reply['row'] >= before_row or not isinstance(result.get('sessionId'), str) or not result['sessionId']:
        return None
    if not isinstance(result.get('workspace'), dict) or result['workspace'].get('created_draft') is not True:
        return None
    events = [e for e in evidence['events'] if e.get('event') == 'workspace_prepared']
    if len(events) != 1 or events[0].get('session_id') != result['sessionId'] or events[0].get('state') != result['workspace']:
        return None
    for other_call, other_reply in pairs:
        if other_reply is reply:
            continue
        if other_call['row'] <= reply['row'] or other_reply['result'] != {'isError': True, 'error': _ALREADY_PREPARED}:
            return None
    return result


def verified_prepare_v1(evidence, prefix, caller_session, before_row):
    if not isinstance(caller_session,str) or not caller_session:return None
    calls = [c for c in evidence['calls'] if c.get('tool') == prefix+'dock_prepare']
    replies = [t for t in evidence['tools'] if t.get('tool') == prefix+'dock_prepare']
    events = [e for e in evidence['events'] if e.get('event') == 'workspace_prepared']
    if not calls or len(calls) != len(replies) or len(events) != len(replies): return None
    if len({c.get('tool_call_id') for c in calls}) != len(calls): return None
    first = None
    previous_reply = -1
    identity_keys = ('session_id','operation_id','document_id','workflow_ref','package_ref','ownership_verified','target')
    for call in sorted(calls,key=lambda c:c.get('row',-1)):
        matching = [t for t in replies if t.get('tool_call_id') == call.get('tool_call_id')]
        if len(matching) != 1 or not call.get('tool_call_id'): return None
        reply = matching[0]; result = reply.get('result',{}); state = result.get('workspace',{})
        args = call.get('arguments')
        if (not isinstance(args,dict) or set(args)-{'operation_id','intent','timeout_ms'}
            or args.get('intent','new_draft') != 'new_draft'
            or call.get('session_id') != caller_session or reply.get('session_id') != caller_session
            or type(call.get('row')) is not int or type(reply.get('row')) is not int
            or not previous_reply < call['row'] < reply['row'] < before_row
            or result.get('prepared') is not True or result.get('isError') is True
            or state.get('status') != 'READY' or state.get('authenticated') is not True
            or state.get('created_draft') is not True or state.get('ownership_verified') is not True
            or state.get('target_verified') is not True or state.get('reason') is not None
            or state.get('session_id') != result.get('sessionId')
            or state.get('operation_id') != args.get('operation_id','prepare')
            or not state.get('document_id') or not state.get('workflow_ref',{}).get('tab_tid')
            or not state.get('workflow_ref',{}).get('navigation_path')
            or state.get('package_ref',{}).get('persisted') is not False
            or state.get('package_ref',{}).get('path') is not None): return None
        preserved = state.get('preserved_workflows')
        if not isinstance(preserved,list) or any(p.get('graph_unchanged') is not True for p in preserved): return None
        event_matches = [e for e in events if e.get('session_id') == result['sessionId'] and e.get('state') == state]
        if len(event_matches) != 1:return None
        events.remove(event_matches[0])
        if first is None: first=result
        elif any(state.get(k) != first['workspace'].get(k) for k in identity_keys) or state.get('replayed') is not True:return None
        previous_reply=reply['row']
    return first
