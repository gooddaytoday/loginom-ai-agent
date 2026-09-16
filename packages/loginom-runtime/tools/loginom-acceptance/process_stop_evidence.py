"""Independent evidence audit for one typed stop of an observed node process."""


def verify_typed_process_stop(launch, stop, terminal):
    def require(value, message):
        if not value:
            raise ValueError(message)

    execution = launch['execution']
    baseline = launch['baseline']
    before = launch['processes']
    after = terminal['state']
    require(before['verified'] and after['verified'], 'Native process inventories required')
    require(before['inventory_complete'] and after['inventory_complete'], 'Complete inventories required')
    require(baseline['root_id'] == before['root_id'] == after['root_id'] == execution['root_id'], 'Process root changed')
    require(execution['node'] == baseline['node'] == terminal['binding']['node'], 'Node binding changed')
    require(execution['execution_id'] == ':'.join((execution['node']['document_id'], execution['root_id'], execution['group_id'])), 'Execution identity mismatch')
    old = {p['process_id']: p['record_id'] for p in baseline['roots']}
    groups = {p['process_id']: p['record_id'] for p in before['processes'] if p['parent_id'] is None}
    require(execution['group_id'] not in old and groups == {**old, execution['group_id']: execution['group_record_id']}, 'Expected one new execution')
    require(groups == {p['process_id']: p['record_id'] for p in after['processes'] if p['parent_id'] is None}, 'Execution history changed')
    children = [p for p in before['processes'] if p['parent_id'] == execution['group_id']]
    if len(children) == 1:
        child = children[0]
    else:
        owned = [p for p in children if p.get('owner') == dict(verified=True, node_id=execution['node']['node_id'], source='native_process_model_identity')]
        require(len(owned) == 1, 'Unique native-owned child required among dependencies')
        child = owned[0]
        final_children = [p for p in after['processes'] if p['parent_id'] == execution['group_id']]
        final_owned = [p for p in final_children if p.get('owner') == child['owner']]
        require(len(final_owned) == 1 and final_owned[0]['record_id'] == child['record_id'] and final_owned[0]['process_id'] == child['process_id'], 'Terminal native ownership changed')
    require(child['progress_state'] == dict(verified=True, state='running', terminal=False, can_cancel=True, source='native_progress_record'), 'Running cancellable child required')
    attempts = stop['attempts']
    require(len(attempts) == 1, 'One typed gesture receipt required')
    receipt = attempts[0]
    require(receipt['proof'] == dict(root_id=execution['root_id'], record_id=child['record_id'], process_id=child['process_id'], node_id=execution['node']['node_id'], owner_verified=True, can_cancel=True, source='native_process_model_identity'), 'Native ownership proof mismatch')
    require(receipt['status'] == 'SUCCEEDED' and receipt['effect_possible'] is True and receipt['cleanup_complete'] is True and receipt['error'] is None, 'Confirmed stop gesture required')
    gestures = [e for e in receipt['trace'] if e['event'] == 'ui_gesture_applied']
    require(len(gestures) == 1 and gestures[0]['verb'] == 'cancel_process', 'Exactly one typed cancel required')
    for pid, rid in [(execution['group_id'], execution['group_record_id']), (child['process_id'], child['record_id'])]:
        matches = [p for p in after['processes'] if p['process_id'] == pid and p['record_id'] == rid]
        require(len(matches) == 1, 'Terminal record replaced')
        require(matches[0]['progress_state'] == dict(verified=True, state='cancelled', terminal=True, can_cancel=False, source='native_progress_record'), 'Same record must be terminal cancelled')
    return dict(verified=True, execution_id=execution['execution_id'], child_record_id=child['record_id'], cancel_gestures=1)


def verify_journalled_process_stop(launch, journal, result, runtime_revision):
    def require(value, message):
        if not value:
            raise ValueError(message)
    require(journal and all(r['runtime_revision'] == runtime_revision for r in journal), 'Runtime pin changed')
    require(len({r['session_id'] for r in journal}) == 1 and len({r['operation_id'] for r in journal}) == 1, 'Journal ownership changed')
    prepared = [r for r in journal if r['phase'] == 'node_step_prepared' and r['action']['verb'] == 'cancel_process']
    require(len(prepared) == 1, 'Exactly one prepared cancel required')
    request = prepared[0]
    index = journal.index(request)
    observations = [r for r in journal[:index] if r['phase'] == 'node_observation_completed']
    require(bool(observations), 'Stop observation missing')
    observed = observations[-1]['outcome']['output']
    items = [e for e in observed['ui']['elements'] if e['ref'] == request['action']['ref']]
    require(len(items) == 1 and items[0]['tid'] == 'mnContextMenu;mniCancel' and items[0]['allowed_actions'] == ['cancel_process'], 'Typed cancel reference missing')
    completed = [r for r in journal[index+1:] if r['phase'] == 'node_step_completed' and r['internal_operation_id'] == request['internal_operation_id']]
    require(len(completed) == 1, 'Durable stop receipt missing')
    receipt = completed[0]['outcome']
    terminal = [r for r in journal[journal.index(completed[0])+1:] if r['phase'] == 'node_observation_completed'
                and r.get('readiness', {}).get('condition') == 'same node execution terminal after cancel']
    require(len(terminal) == 1, 'Post-stop native observation missing')
    compact = {key: receipt[key] for key in ['status', 'effect_possible', 'cleanup_complete', 'error', 'trace']}
    compact['proof'] = items[0]['process_menu']['cancellation']
    verified = verify_typed_process_stop(launch, {'attempts': [compact]}, {
        'binding': {'node': launch['execution']['node']}, 'state': terminal[0]['outcome']['output']['node_processes']})
    require(result['stopped'] == result['replay'] and result['beforeReplay'] == result['afterReplay'], 'Stop replay performed additional work')
    require(result['stopped']['execution_id'] == verified['execution_id'] and result['stopped']['process_record_id'] == verified['child_record_id'], 'Driver result changed execution')
    require(result['stopped']['status'] == 'cancelled' and result['stopped']['stop_verified'] is True and result['stopped']['cleanup_complete'] is True, 'Driver cancellation not verified')
    final = [r for r in journal if r['phase'] == 'node_observation_completed'][-1]
    require(final['readiness']['condition'] == 'process console closed' and final['readiness']['satisfied'] is True, 'Console cleanup not observed')
    require(not any(e['tid'] == 'ConsoleForm;ProgressForm;trpProgress;grd;tbl' for e in final['outcome']['output']['ui']['elements']), 'Console remains open')
    # Every rejected preparation must have a strictly pre-gesture receipt.
    for r in journal:
        if r['phase'] != 'node_step_completed':
            continue
        out = r['outcome']
        if out['status'] != 'SUCCEEDED':
            require(out['status'] == 'NOT_APPLIED' and out['effect_possible'] is False and out['cleanup_complete'] is True
                    and out['error']['code'] == 'UI_EPOCH_CHANGED'
                    and not any(e['event'] in ['ui_preconditions_verified', 'ui_gesture_applied'] for e in out['trace']), 'Unsafe gesture retry')
    return {**verified, 'journal_verified': True, 'runtime_revision': runtime_revision, 'replay_steps_added': 0}


def verify_long_execution_stop(launch, journal, result, runtime_revision):
    verified = verify_journalled_process_stop(launch, journal, result, runtime_revision)
    wait = result.get('waitResult', {})
    if wait.get('interrupted_by_stop') is not True or not isinstance(wait.get('elapsed_ms'), int) or wait['elapsed_ms'] < 25000:
        raise ValueError('Long wait was not interrupted by its explicit stop request')
    condition = 'new node execution completed'
    timeouts = [r for r in journal if r['phase'] == 'node_observation_timeout' and r.get('condition') == condition]
    if not timeouts or any(r.get('effect_possible') is not False or r.get('elapsed_ms', 0) < 14000 for r in timeouts):
        raise ValueError('Bounded read timeout evidence missing')
    samples = [r for r in journal if r['phase'] == 'node_observation_sample' and r.get('readiness', {}).get('condition') == condition]
    execution = launch['execution']
    if len({r['step'] for r in samples}) < 2:
        raise ValueError('No second observation window for the original execution')
    for sample in samples:
        processes = sample['outcome']['output'].get('node_processes', {})
        if processes.get('verified') is not True or processes.get('root_id') != execution['root_id']:
            raise ValueError('Long wait lost its native process root')
        groups = [p for p in processes['processes'] if p['process_id'] == execution['group_id'] and p['record_id'] == execution['group_record_id']]
        if len(groups) != 1 or groups[0].get('progress_state', {}).get('state') != 'running':
            raise ValueError('Long wait did not preserve the running execution')
    if not any(journal.index(s) > journal.index(timeouts[0]) for s in samples):
        raise ValueError('No continued observation after timeout')
    return {**verified, 'long_execution_wait_verified': True, 'bounded_timeouts': len(timeouts), 'wait_ms': wait['elapsed_ms']}
