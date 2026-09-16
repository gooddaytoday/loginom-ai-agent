"""Original workflow receipt recovery and explicit continuation, not a full goal."""
from workflow_activation_evidence import verify_workflow_activation


def verify_workflow_recovery(events, request):
    failures = list(verify_workflow_activation(events, request)['failures'])
    rows = [e for e in events if e.get('operation_id') == request.get('operation_id')]

    def unique(predicate):
        found = [(i, e) for i, e in enumerate(rows) if predicate(e)]
        if len(found) != 1:
            raise ValueError('unique_recovery_boundary')
        return found[0]

    try:
        identity = tuple(rows[0].get(k) for k in ('session_id', 'runtime_revision', 'target'))
        if not all(identity) or any(tuple(e.get(k) for k in ('session_id', 'runtime_revision', 'target')) != identity for e in rows):
            failures.append('recovery_journal_identity')
        start, prepared = unique(lambda e: e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == 'workflow')
        pause, paused = unique(lambda e: e.get('phase') == 'completed' and e.get('outcome', {}).get('output', {}).get('pending_phase') == 'workflow')
        end, completed = unique(lambda e: e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == 'workflow')
        reconcile, recovered = unique(lambda e: e.get('phase') == 'reconciled' and e.get('outcome', {}).get('error', {}).get('code') == 'NODE_PHASE_RECOVERED')
        resume, resumed = unique(lambda e: e.get('phase') == 'node_apply_resume_prepared')
        verify, continuation = unique(lambda e: e.get('phase') == 'node_continuation_checked' and e.get('boundary') == 'workflow')
        target, _ = unique(lambda e: e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == 'target')
        if not start < pause < end < reconcile < resume < verify < target:
            failures.append('recovery_order')
        if not prepared.get('signature') or prepared['signature'] != completed.get('signature'):
            failures.append('recovery_signature')
        old, new = paused['outcome'], recovered['outcome']
        if (old.get('status') != 'AMBIGUOUS' or old.get('cleanup_complete') is not False
                or old.get('output', {}).get('node') is not None or old.get('operation_id') != request['operation_id']
                or new.get('status') != 'AMBIGUOUS' or new.get('cleanup_complete') is not True
                or new.get('output', {}).get('pending_phase') is not None or new.get('output', {}).get('node') is not None
                or new.get('operation_id') != request['operation_id'] or resumed.get('parameters') != request):
            failures.append('recovery_not_a_completed_node')
        source = unique(lambda e: e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == 'source')[1]['receipt']['value']
        current = continuation.get('current', {})
        trace = current.get('trace', [])
        if (continuation.get('verified') is not True or continuation.get('source') != source
                or current.get('status') != 'SUCCEEDED' or current.get('verified') is not True
                or current.get('cleanup_complete') is not True or current.get('effect_possible') is not False
                or current.get('document_id') != request['document_id'] or current.get('workflow_ref') != request['workflow_ref']
                or [e.get('event') for e in trace] != ['prepared_workflow_observed', 'prepared_workflow_active']
                or any(e.get('active') is not True or e.get('document_id') != request['document_id']
                       or e.get('workflow_ref') != request['workflow_ref'] or e.get('tab_tid') != request['workflow_ref']['tab_tid'] for e in trace)):
            failures.append('recovery_live_document_and_source')
    except (KeyError, TypeError, ValueError, IndexError, AttributeError):
        failures.append('recovery_missing_or_malformed_evidence')
    return dict(passed=not failures, failures=failures, scope='workflow_receipt_and_explicit_continuation',
                full_node_verified=False, package_persistence_verified=False, hermes_acceptance_verified=False)
