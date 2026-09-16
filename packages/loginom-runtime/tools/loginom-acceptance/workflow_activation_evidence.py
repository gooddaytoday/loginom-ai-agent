"""Verify explicit prepared-workflow activation, including a no-click path."""


def verify_workflow_activation(events, request):
    rows = [e for e in events if e.get('operation_id') == request.get('operation_id')]
    starts = [(i, e) for i, e in enumerate(rows) if e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == 'workflow']
    ends = [(i, e) for i, e in enumerate(rows) if e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == 'workflow']
    failures = []
    if len(starts) != 1 or len(ends) != 1 or starts[0][0] >= ends[0][0]:
        return dict(passed=False, failures=['workflow_unique_phase_pair'])
    receipt = ends[0][1]['receipt']; value = receipt.get('value', {})
    trace = value.get('trace', [])
    clicked = len(trace) == 3
    expected_names = ['prepared_workflow_observed'] + (['prepared_workflow_clicked'] if clicked else []) + ['prepared_workflow_active']
    if ([t.get('event') for t in trace] != expected_names or receipt.get('status') != 'verified'
            or receipt.get('receipt_id') != starts[0][1]['receipt'].get('receipt_id')
            or receipt.get('effect_possible') is not clicked or value.get('effect_possible') is not clicked
            or value.get('status') != 'SUCCEEDED' or value.get('verified') is not True or value.get('cleanup_complete') is not True
            or value.get('document_id') != request.get('document_id') or value.get('workflow_ref') != request.get('workflow_ref')):
        failures.append('workflow_verified_receipt')
    if len(trace) >= 2:
        for position in (0, -1):
            observed = trace[position]
            if (observed.get('document_id') != request.get('document_id') or observed.get('workflow_ref') != request.get('workflow_ref')
                    or observed.get('tab_tid') != request.get('workflow_ref', {}).get('tab_tid')
                    or observed.get('active') is not (True if position == -1 else not clicked)):
                failures.append('workflow_original_identity')
        if clicked and trace[1].get('tab_tid') != request.get('workflow_ref', {}).get('tab_tid'):
            failures.append('workflow_clicked_wrong_tab')
    return dict(passed=not failures, failures=failures, scope='workflow_activation_only')
