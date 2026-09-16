"""Bind public MCP requests and worker responses to independently audited events.

This checks the operator wire harness, not the remote bridge connection or Hermes.
"""


def verify_public_node_wire(rows, events, requests, outcomes, delivery, save_parameters, *, checkpoint_mode=False):
    failures = []
    pending, calls = {}, []
    for row in rows:
        key = row.get('id')
        if row.get('phase') == 'request':
            if key != len(calls) + len(pending) + 1 or key in pending:
                failures.append('public_request_sequence')
            pending[key] = row
        elif row.get('phase') == 'response' and key in pending:
            start = pending.pop(key)
            reply = row.get('reply', {})
            import json
            try:
                parsed = json.loads(reply['content'][0]['text'])
            except (KeyError, IndexError, TypeError, ValueError):
                parsed = None
            if reply.get('isError') or parsed is None or parsed != reply.get('structuredContent'):
                failures.append('public_response_consistency')
            if type(start.get('before')) is not int or type(row.get('after')) is not int or row['after'] < start['before']:
                failures.append('public_browser_sequence')
            calls.append((start, row, parsed or {}))
        else:
            failures.append('public_response_without_request')
    if pending:
        failures.append('public_pending_response')
    allowed = {'dock_artifact_deliver', 'dock_node_apply', 'dock_node_wait', 'dock_action_run'}
    if any(start['request'].get('name') not in allowed for start, _, _ in calls):
        failures.append('public_unexpected_tool')
    deliveries = [(s, r, out) for s, r, out in calls if s['request']['name'] == 'dock_artifact_deliver']
    if len(deliveries) != 2:
        failures.append('public_delivery_count')
    else:
        a, b = deliveries
        if (a[0]['request'] != b[0]['request'] or a[2] != delivery or b[2] != delivery
                or b[0]['before'] != b[1]['after']
                or a[0]['request']['arguments'].get('operation_id') != delivery.get('operation_id')):
            failures.append('public_delivery_binding_or_replay')
    for operation_id, request in requests.items():
        applies = [(s, r, out) for s, r, out in calls if s['request']['name'] == 'dock_node_apply'
                   and s['request']['arguments'].get('operation_id') == operation_id]
        if len(applies) != 2:
            failures.append('public_apply_count_' + operation_id)
            continue
        if any(s['request']['arguments'] != request for s, _, _ in applies):
            failures.append('public_apply_request_' + operation_id)
        initial, replay = applies
        if (replay[0]['before'] != replay[1]['after'] or replay[2].get('state') != 'settled'
                or replay[2].get('outcome') != outcomes[operation_id]):
            failures.append('public_node_replay_' + operation_id)
        waits = [(s, r, out) for s, r, out in calls if s['request']['name'] == 'dock_node_wait'
                 and s['request']['arguments'].get('operation_id') == operation_id]
        if any(not initial[0]['id'] < s['id'] < replay[0]['id'] for s, _, _ in waits):
            failures.append('public_wait_order_' + operation_id)
        snapshots = [initial[2]] + [out for _, _, out in waits]
        if (not waits or snapshots[-1].get('state') != 'settled' or snapshots[-1].get('outcome') != outcomes[operation_id]
                or any(out.get('operation_id') != operation_id or out.get('attempt') != 1 for out in snapshots)
                or any(out.get('state') != 'running' for out in snapshots[:-1])):
            failures.append('public_worker_lifecycle_' + operation_id)
        declarations = [e for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'node_apply_prepared']
        completions = [e for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'completed']
        if (len(declarations) != 1 or declarations[0].get('request') != request
                or len(completions) != 1 or completions[0].get('outcome') != outcomes[operation_id]):
            failures.append('public_node_journal_' + operation_id)
    node_ids = {s['request']['arguments'].get('operation_id') for s, _, _ in calls
                if s['request']['name'] in {'dock_node_apply', 'dock_node_wait'}}
    if node_ids != set(requests):
        failures.append('public_extra_node_operation')
    saves = [(s, r, out) for s, r, out in calls if s['request']['name'] == 'dock_action_run']
    expected = {'action_key': 'package.save_checkpoint' if checkpoint_mode else 'package.save_as', 'parameters': save_parameters, 'operation_id': 'save-import'}
    saved = [e for e in events if e.get('operation_id') == 'save-import' and e.get('phase') == 'completed']
    if (len(saves) != 2 or len(saved) != 1 or any(s['request']['arguments'] != expected or out != saved[0]['outcome'] for s, _, out in saves)
            or saves[-1][0]['before'] != saves[-1][1]['after']):
        failures.append('public_save_binding_or_replay')
    return {'passed': not failures, 'failures': failures, 'public_calls': len(calls),
            'node_operations': sorted(requests), 'scope': 'operator_mcp_wire_not_remote_bridge_or_hermes'}


def verify_delivery_root_return(events, setup, destination, upload_id):
    failures = []
    uploads = [i for i, e in enumerate(events) if e.get('operation_id') == upload_id and e.get('phase') == 'prepared']
    if len(uploads) != 1:
        return {'passed': False, 'failures': ['root_return_upload_count']}
    before_upload = events[:uploads[0]]
    navigations = [(i, e) for i, e in enumerate(before_upload) if e.get('action_key') == 'ui.act' and e.get('phase') == 'completed']
    if not navigations:
        return {'passed': False, 'failures': ['root_return_missing_navigation']}
    position, root = navigations[0]
    def directory(e):
        return e.get('outcome', {}).get('output', {}).get('file_storage', {}).get('directory')
    observed = [e for e in before_upload[:position] if e.get('phase') == 'observation_completed' and directory(e)]
    initial = observed[-1] if observed else {}
    prefix = initial.get('outcome', {}).get('output', {}).get('workflow_ref', {}).get('prefix')
    if (not prefix or directory(initial) != setup.get('directory') or setup.get('before', {}).get('directory') != destination
            or setup.get('directory') != destination + '/' + str(setup.get('created_child'))):
        failures.append('root_return_initial_directory')
    if (root.get('parameters', {}).get('action', {}).get('verb') != 'click'
            or root.get('checkpoint', {}).get('target_tids') != [str(prefix) + ';cnrNaviMode;b.s_Сервер>Файлы']
            or root.get('outcome', {}).get('status') != 'SUCCEEDED'
            or root.get('outcome', {}).get('cleanup_complete') is not True):
        failures.append('root_return_bound_click')
    next_navigation = navigations[1][0] if len(navigations) > 1 else len(before_upload)
    if not any(directory(e) == '/' for e in before_upload[position + 1:next_navigation]):
        failures.append('root_return_not_observed')
    directories = [directory(e) for e in before_upload if e.get('phase') == 'observation_completed' and directory(e)]
    if not directories or directories[-1] != destination:
        failures.append('root_return_destination_before_upload')
    return {'passed': not failures, 'failures': failures, 'start_directory': setup.get('directory'), 'destination': destination}
