"""Bind autonomous public calls to node workers and save journal receipts.

This is an evidence component, not the final business/model acceptance verdict.
"""
import json
from evidence import PREFIX, NODE_TOOLS


def paired_public_calls(evidence):
    failures, pairs = [], []
    calls, replies = evidence['calls'], evidence['tools']
    seen = set()
    for call in calls:
        key = (call.get('session_id'), call.get('tool_call_id'))
        if not all(isinstance(v, str) and v for v in key) or key in seen:
            failures.append('public_unique_call_identity')
        seen.add(key)
        matches = [r for r in replies if (r.get('session_id'), r.get('tool_call_id')) == key]
        if len(matches) != 1:
            failures.append('public_unique_reply')
            continue
        reply = matches[0]
        if (reply.get('tool') != call.get('tool') or reply.get('pairing_error')
                or type(call.get('row')) is not int or type(reply.get('row')) is not int
                or call['row'] >= reply['row']):
            failures.append('public_pair_binding')
        pairs.append((call, reply))
    if any((r.get('session_id'), r.get('tool_call_id')) not in seen for r in replies):
        failures.append('public_orphan_reply')
    if len({c.get('session_id') for c in calls}) != 1:
        failures.append('public_single_caller')
    return pairs, failures


def proven_validation_refusal(call, reply, events, accepted_ids, pairs=()):
    # Only unallocated, paired MCP validation errors may be excluded from the
    # set of executed nodes. A generic tool error or unknown effect never qualifies.
    try:
        operation = call['arguments']['operation_id']
        result = reply['result']
        if (call['tool'] != PREFIX+'dock_node_apply' or not isinstance(operation,str) or not operation
                or not isinstance(result,dict) or result.get('isError') is not True):return False
        if operation in accepted_ids:
            # The public contract tells the caller to correct an unallocated
            # request under the same ID. It must precede every allocated start;
            # those starts still undergo the complete journal binding below.
            starts=[(c,r) for c,r in pairs if c.get('tool')==PREFIX+'dock_node_apply'
                    and c.get('arguments',{}).get('operation_id')==operation
                    and r.get('result',{}).get('state') in ('running','settled')]
            if not starts or any(reply['row']>=c['row'] or c['session_id']!=call['session_id'] for c,r in starts):return False
            if len([e for e in events if e.get('operation_id')==operation and e.get('phase')=='node_apply_prepared'])!=1:return False
        elif any(e.get('operation_id')==operation for e in events):return False
        error, _ = json.JSONDecoder().raw_decode(result['error'])
        state = error['output']['operation']
        return (error.get('status') == 'FAILED' and error.get('action_key') == 'request.validate'
                and error.get('phase') == 'request_rejected' and error.get('request_rejected') is True
                and error.get('effect_possible') is False and error.get('operation_id') is None
                and error.get('trace') == [] and error.get('error',{}).get('code') == 'REQUEST_REJECTED'
                and state.get('operation_id') is None and state.get('state') == 'idle'
                and state.get('outcome') is None and state.get('cleanup_confirmed') is True
                and state.get('effect_state') == 'none')
    except (KeyError,TypeError,ValueError,AttributeError):
        return False


def verify_public_nodes_and_saves(evidence, requests, save_ids, *, allow_validation_refusals=False, terminal_outcomes=None):
    # Only a separate scoped proof may supply terminal failures; defaults stay strict.
    terminal_outcomes=terminal_outcomes or {}
    pairs, failures = paired_public_calls(evidence)
    events = evidence['events']
    allowed_node = {PREFIX+n for n in ('dock_node_apply', 'dock_node_wait', 'dock_node_status')}
    relevant = [(c, r) for c, r in pairs if c.get('tool') in allowed_node]
    refused = [(c,r) for c,r in relevant if allow_validation_refusals and proven_validation_refusal(c,r,events,set(requests),pairs)]
    relevant = [(c,r) for c,r in relevant if not any(c is discarded for discarded,_ in refused)]
    actual_ids = {c.get('arguments', {}).get('operation_id') for c, _ in relevant}
    if actual_ids != set(requests) or not set(terminal_outcomes).issubset(requests):
        failures.append('public_exact_node_operations')
    for operation_id, request in requests.items():
        node_pairs = sorted(((c, r) for c, r in relevant if c.get('arguments', {}).get('operation_id') == operation_id),
                            key=lambda pair: pair[0]['row'])
        starts = [(c, r) for c, r in node_pairs if c['tool'] == PREFIX+'dock_node_apply']
        declarations = [e for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'node_apply_prepared']
        ends = [e for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'completed']
        if (not starts or any(c.get('arguments') != request for c, _ in starts)
                or len(declarations) != 1 or declarations[0].get('request') != request or len(ends) != 1):
            failures.append('public_node_journal:'+operation_id)
            continue
        outcome = ends[0].get('outcome', {})
        if (outcome.get('status') != (terminal_outcomes[operation_id].get('status') if operation_id in terminal_outcomes else 'SUCCEEDED')
                or outcome.get('cleanup_complete') is not True
                or operation_id in terminal_outcomes and (outcome!=terminal_outcomes[operation_id] or outcome.get('status') not in ('FAILED','NOT_APPLIED'))):
            failures.append('public_node_terminal_success:'+operation_id)
        settled, last_row = False, -1
        for index, (call, reply) in enumerate(node_pairs):
            args, snapshot = call.get('arguments', {}), reply.get('result', {})
            if index == 0 and call['tool'] != PREFIX+'dock_node_apply':
                failures.append('public_node_started_before_poll:'+operation_id)
            if call['row'] <= last_row:
                failures.append('public_node_serial_wait:'+operation_id)
            last_row = reply['row']
            if call['tool'] != PREFIX+'dock_node_apply' and set(args) - ({'operation_id', 'timeout_ms'} if call['tool'] == PREFIX+'dock_node_wait' else {'operation_id'}):
                failures.append('public_poll_arguments:'+operation_id)
            if (not isinstance(snapshot, dict) or snapshot.get('isError') or snapshot.get('operation_id') != operation_id
                    or snapshot.get('attempt') != 1 or snapshot.get('state') not in ('running', 'settled')):
                failures.append('public_node_snapshot:'+operation_id)
                continue
            if settled and snapshot.get('state') != 'settled':
                failures.append('public_node_regressed:'+operation_id)
            if snapshot['state'] == 'settled':
                settled = True
                if snapshot.get('outcome') != outcome:
                    failures.append('public_node_outcome_binding:'+operation_id)
            elif snapshot.get('outcome') is not None:
                failures.append('public_running_outcome:'+operation_id)
        if not settled:
            failures.append('public_node_result_not_delivered:'+operation_id)
    saves = [(c, r) for c, r in pairs if c.get('tool') == PREFIX+'dock_action_run']
    if {c.get('arguments', {}).get('operation_id') for c, _ in saves} != set(save_ids):
        failures.append('public_exact_save_operations')
    for operation_id in save_ids:
        ends = [e for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'completed']
        matching = [(c, r) for c, r in saves if c.get('arguments', {}).get('operation_id') == operation_id]
        if len(ends) != 1 or not matching:
            failures.append('public_save_journal:'+operation_id)
            continue
        end = ends[0]
        expected = dict(operation_id=operation_id, action_key=end.get('action_key'), parameters=end.get('parameters'))
        if any(c.get('arguments') != expected or r.get('result') != end.get('outcome') for c, r in matching):
            failures.append('public_save_binding:'+operation_id)
    # Recovery/stop are supported separately, but a resumed attempt cannot use
    # this straight-through proof until its phase receipts are audited as well.
    recovery = NODE_TOOLS - allowed_node - {PREFIX+n for n in ('dock_artifact_deliver', 'dock_artifact_delivery_status')}
    if any(c.get('tool') in recovery for c in evidence['calls']):
        failures.append('public_recovery_requires_separate_proof')
    return dict(passed=not failures, failures=sorted(set(failures)),
                scope='public_node_and_save_receipts', hermes_acceptance_verified=False,
                **({'validation_refusals':[c['arguments']['operation_id'] for c,_ in refused]} if allow_validation_refusals else {}))


def verify_public_delivery(evidence, node_request, prepared):
    pairs, failures = paired_public_calls(evidence)
    starts = [(c, r) for c, r in pairs if c.get('tool') == PREFIX+'dock_artifact_deliver']
    if not starts:
        return dict(passed=False, failures=failures+['public_delivery_missing'])
    first = min(starts, key=lambda pair: pair[0]['row'])[0]
    args = first.get('arguments', {})
    operation_id = args.get('operation_id')
    source = node_request.get('parameters', {}).get('source', {})
    artifacts = prepared.get('input_artifacts', [])
    artifacts = [a for a in artifacts if a.get('artifact_id') == source.get('artifact_id')]
    if len(artifacts) != 1:
        return dict(passed=False, failures=failures+['public_delivery_prepared_artifact'])
    artifact = artifacts[0]; grant = artifact.get('upload', {})
    destination = node_request.get('parameters', {}).get('settings', {}).get('source', {}).get('source_path')
    if (not operation_id or args.get('artifact_id') != artifact.get('artifact_id')
            or not grant.get('grant_id') or args.get('upload_grant_id') != grant.get('grant_id')
            or grant.get('destination') != destination
            or any(k in source and artifact.get(k) != source.get(k) for k in ('bytes', 'sha256'))
            or source.get('upload_operation_id') != str(operation_id)+':upload'
            or any(c.get('arguments') != args for c, _ in starts)):
        failures.append('public_delivery_grant_binding')
    finished = [(i, e) for i, e in enumerate(evidence['events']) if e.get('phase') == 'artifact_delivery_completed'
                and e.get('operation_id') == operation_id]
    applies = [(i, e) for i, e in enumerate(evidence['events']) if e.get('phase') == 'node_apply_prepared'
               and e.get('operation_id') == node_request.get('operation_id')]
    if len(finished) != 1 or len(applies) != 1 or finished[0][0] >= applies[0][0]:
        return dict(passed=False, failures=failures+['public_delivery_before_import'])
    delivery_pairs = sorted(((c, r) for c, r in pairs if c.get('tool') in
                            {PREFIX+'dock_artifact_deliver', PREFIX+'dock_artifact_delivery_status'}),
                            key=lambda pair: pair[0]['row'])
    settled = None
    settled_rows = []
    for call, reply in delivery_pairs:
        snapshot = reply.get('result', {})
        if (call.get('arguments', {}).get('operation_id') != operation_id or snapshot.get('operation_id') != operation_id
                or snapshot.get('upload_operation_id') != source.get('upload_operation_id')
                or snapshot.get('isError') or snapshot.get('state') not in ('running', 'settled')
                or call['row'] < first['row']):
            failures.append('public_delivery_snapshot')
        if snapshot.get('state') == 'settled':
            if snapshot.get('phase') != 'completed' or snapshot.get('outcome') != finished[0][1].get('result'):
                failures.append('public_delivery_result_journal')
            settled = snapshot
            settled_rows.append(reply['row'])
        elif settled is not None:
            failures.append('public_delivery_regressed')
    if settled is None:
        failures.append('public_delivery_result_not_delivered')
    elif any(settled.get('outcome', {}).get(k) != artifact.get(k) for k in ('bytes', 'sha256')):
        failures.append('public_delivery_artifact_bytes')
    node_calls = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_node_apply'
                  and c.get('arguments') == node_request]
    if not node_calls or not settled_rows or min(settled_rows) >= min(c['row'] for c in node_calls):
        failures.append('public_delivery_received_before_import')
    return dict(passed=not failures, failures=sorted(set(failures)), delivery=settled,
                scope='public_delivery_receipts', hermes_acceptance_verified=False)
