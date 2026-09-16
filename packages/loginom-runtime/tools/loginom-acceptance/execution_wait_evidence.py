"""Verify read-wait interruption, retained launch and explicit continuation.

Input is the authenticated journal; output freshness is still checked separately
by the existing process-owner and table auditors.
"""

def _verify_execution_wait_pauses(events, request):
    rows = [e for e in events if e.get('operation_id') == request['operation_id']]
    pauses = [(i, e) for i, e in enumerate(rows) if e.get('phase') == 'node_phase_paused']
    failures = []
    if not pauses:
        return dict(passed=True, failures=[], pauses=0)
    finishes = [e.get('receipt', {}).get('value', {}) for e in rows
                if e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == 'finish']
    if len(pauses) > 3 or len(finishes) != 1:
        return dict(passed=False, failures=['wait_pause_finish_or_count'], pauses=len(pauses))
    finish = finishes[0]
    execution = finish.get('execution_group', {})
    node = execution.get('node', {})
    for index, (position, event) in enumerate(pauses):
        checkpoint = event.get('receipt', {})
        starts = [(i, e.get('receipt', {})) for i, e in enumerate(rows[:position])
                  if e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == 'execute']
        if not starts:
            failures.append('wait_pause_start'); continue
        start, pending = starts[-1]
        if (checkpoint.get('phase') != 'execute' or checkpoint.get('read_only') is not True
                or checkpoint.get('cleanup_complete') is not True or checkpoint.get('effect_possible') is not False
                or not execution.get('execution_id') or checkpoint.get('execution_id') != execution['execution_id']
                or checkpoint.get('execution_id') != finish.get('execution_id')
                or any(checkpoint.get(k) != pending.get(k) for k in ('phase', 'receipt_id', 'deadline', 'before_node'))
                or checkpoint.get('before_node') != node or type(checkpoint.get('deadline')) is not int):
            failures.append('wait_pause_binding')
        interval = rows[start+1:position]
        if any(e.get('phase') in ('node_step_prepared', 'node_step_completed', 'node_server_stop_requested', 'node_phase_completed') for e in interval):
            failures.append('wait_pause_contains_effect')
        end = pauses[index+1][0] if index+1 < len(pauses) else len(rows)
        following = rows[position+1:end]
        resumes = [i for i, e in enumerate(following) if e.get('phase') == 'node_apply_resume_prepared']
        checks = [(i, e) for i, e in enumerate(following) if e.get('phase') == 'node_continuation_checked']
        restarts = [(i, e.get('receipt', {})) for i, e in enumerate(following)
                    if e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == 'execute']
        if len(resumes) != 1 or len(checks) != 1 or len(restarts) != 1:
            failures.append('wait_explicit_resume'); continue
        checked_at, checked = checks[0]; restarted_at, restarted = restarts[0]
        if not resumes[0] < checked_at < restarted_at:
            failures.append('wait_resume_order')
        if (restarted.get('receipt_id') != checkpoint.get('receipt_id') or type(restarted.get('deadline')) is not int
                or restarted['deadline'] > checkpoint['deadline']):
            failures.append('wait_deadline_extended')
        if checked.get('verified') is not True or checked.get('boundary') != 'execute_wait':
            failures.append('wait_continuation_missing')
        if any(e.get('phase') == 'node_step_prepared' for e in following[:restarted_at]):
            failures.append('wait_resume_repeated_gesture')
        before, after = finish.get('continuation_surface', {}), checked.get('surface', {})
        def same_node(context):
            return (context.get('verified') is True and context.get('surface') == 'graph'
                    and all(node.get(k) and context.get(k) == node[k] for k in ('document_id', 'workflow_id', 'node_id')))
        for surface in (before, after):
            processes, outputs = surface.get('node_processes', {}), surface.get('node_outputs', {})
            if (surface.get('wizard', {}).get('status') != 'absent' or not same_node(surface.get('prepared_node_context', {}))
                    or processes.get('verified') is not True or processes.get('inventory_complete') is not True
                    or processes.get('show_completed') is not True or not same_node(processes.get('node_context', {}))
                    or processes.get('root_id') != execution.get('root_id') or outputs.get('verified') is not True
                    or not same_node(outputs.get('node_context', {})) or len(outputs.get('ports', [])) != 1):
                failures.append('wait_live_owner')
        if not before.get('dom_epoch', {}).get('document') or before.get('dom_epoch', {}).get('document') != after.get('dom_epoch', {}).get('document'):
            failures.append('wait_document_changed')
        roots = lambda s: sorted((p.get('process_id'), p.get('record_id')) for p in s.get('node_processes', {}).get('processes', []) if p.get('parent_id') is None)
        ports = lambda s: [{k: v for k, v in p.items() if k != 'active'} for p in s.get('node_outputs', {}).get('ports', [])]
        if roots(before) != roots(after) or ports(before) != ports(after):
            failures.append('wait_launch_or_ports_changed')
        groups = [p for p in after.get('node_processes', {}).get('processes', []) if p.get('parent_id') is None
                  and p.get('process_id') == execution.get('group_id') and p.get('record_id') == execution.get('group_record_id')]
        if len(groups) != 1 or groups[0].get('error') is not False:
            failures.append('wait_execution_group')
        elif groups[0].get('state') == 'completed':
            if any(p.get('active') is not True for p in after.get('node_outputs', {}).get('ports', [])):
                failures.append('wait_completed_output_deactivated')
        else:
            progress = groups[0].get('progress_state', {})
            if progress.get('verified') is not True or progress.get('terminal') is not False or progress.get('state') not in ('running', 'not_started', 'not_responding'):
                failures.append('wait_execution_terminal')
    return dict(passed=not failures, failures=sorted(set(failures)), pauses=len(pauses))


def verify_execution_wait_pauses(events, request):
    try:
        return _verify_execution_wait_pauses(events, request)
    except (KeyError, TypeError, ValueError, IndexError, AttributeError):
        return dict(passed=False, failures=['malformed_wait_pause_evidence'], pauses=None)
