"""Independent file/configuration/process audit. No output data or persistence proof."""
from import_limits import import_operation_step_budget

import re
from import_done_evidence import _verify_text_import
from node_procedure_evidence import verify_internal_sequence


def verify_process_scroll_observations(observations, mutations):
    failures=[]
    for step,action,outcome in mutations:
        if action.get('verb')!='scroll':continue
        before=next((s for n,s in reversed(observations) if n<step),{})
        after=next((s for n,s in observations if n>step),{})
        controls=[e for e in before.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
        if len(controls)!=1:
            failures.append('process_scroll_control');continue
        control=controls[0];scroll=control.get('scroll',{});grid=control.get('process_grid',{})
        delta=action.get('delta_y');moves=[t for t in outcome.get('trace',[]) if t.get('event')=='ui_scroll_applied']
        target=min(scroll.get('max_top',0),max(0,scroll.get('top',0)+(delta if type(delta) is int else 0)))
        rows=[e for e in after.get('ui',{}).get('elements',[]) if e.get('process_grid',{}).get('grid_id')==grid.get('grid_id')]
        if (control.get('tid')!='ConsoleForm;ProgressForm;trpProgress;treepanel;tree' or not grid.get('grid_id')
                or scroll.get('ref')!=action.get('ref') or 'scroll' not in control.get('allowed_actions',[])
                or type(delta) is not int or not 0<abs(delta)<=1000 or target==scroll.get('top')
                or len(moves)!=1 or moves[0].get('owner_ref')!=action.get('ref')
                or moves[0].get('from')!=scroll.get('top') or moves[0].get('to')!=target
                or len(rows)!=1 or rows[0].get('scroll',{}).get('top')!=target
                or rows[0].get('scroll',{}).get('ref')!=rows[0].get('ref')):
            failures.append('process_scroll_bound_movement')
        if (before.get('node_processes',{}).get('root_id')!=after.get('node_processes',{}).get('root_id')
                or not before.get('node_processes',{}).get('root_id')):failures.append('process_scroll_history_changed')
    return sorted(set(failures))


def retained_history_matches(baseline, current):
    old={r['process_id']:r for r in baseline['processes'] if r['parent_id'] is None}
    roots={r['process_id']:r for r in current['processes'] if r['parent_id'] is None}
    if current['root_id']!=baseline['root_id']:return False
    missing=[key for key,value in old.items() if roots.get(key,{}).get('record_id')!=value['record_id']]
    if not missing:return True
    fresh=sorted((key for key in roots if key not in old),key=int)
    ordered=sorted(old,key=int)
    # Post-launch table reads can add another group. Every eviction must remain
    # the oldest completed prefix, with all retained identities unchanged.
    return (len(old)>=2 and len(roots)==len(old) and 0<len(missing)<len(old)
            and len(missing)==len(fresh) and sorted(missing,key=int)==ordered[:len(missing)]
            and all(old[k].get('state')=='completed' and old[k].get('error') is False for k in missing)
            and [int(k) for k in fresh]==list(range(int(ordered[-1])+1,int(ordered[-1])+1+len(fresh)))
            and all(roots.get(k,{}).get('record_id')==old[k]['record_id'] for k in ordered[len(missing):])
            and not ({roots[k]['record_id'] for k in fresh}&{r['record_id'] for r in old.values()}))


def verify_execution_observations(observations, mutations, node, *, launch_mode='wizard'):
    failures = []
    same_node = lambda n: n.get('verified') is True and all(n.get(k) == node[k] for k in ('document_id', 'workflow_id', 'node_id'))
    def inventory(s):
        p = s.get('node_processes', {})
        rows = p.get('processes', [])
        ids = [r.get('process_id') for r in rows]
        records = [r.get('record_id') for r in rows]
        valid = (p.get('verified') is True and p.get('inventory_complete') is True
                 and p.get('show_completed') is True and bool(p.get('root_id'))
                 and same_node(p.get('node_context', {})) and len(rows) <= 2000
                 and len(set(ids)) == len(ids) and len(set(records)) == len(records)
                 and all(isinstance(r, str) and r for r in records)
                 and all(isinstance(i, str) and re.fullmatch(r'[1-9][0-9]*(?:\.[1-9][0-9]*)*', i) for i in ids))
        if valid:
            valid = all((r.get('parent_id') is None and '.' not in r['process_id'])
                        or (r.get('parent_id') in ids and r['process_id'].rsplit('.', 1)[0] == r['parent_id']) for r in rows)
        return p if valid else None
    launches = [(step, a, o) for step, a, o in mutations if a.get('verb') in ('execute_wizard','execute_graph_node')]
    navigation = [(step, a, o) for step, a, o in mutations if a.get('verb') == 'show_process_node']
    if len(launches) != 1 or len(navigation) != 1:
        return dict(passed=False, failures=['one_launch_one_owner_navigation'], execution_id=None)
    launch, launch_action, launch_outcome = launches[0]
    go, action, _ = navigation[0]
    failures.extend(verify_process_scroll_observations(observations, [(n,a,o) for n,a,o in mutations if launch<n<go]))
    if launch_mode=='wizard':
        gesture=(launch_action.get('verb')=='execute_wizard' and any(t.get('event')=='wizard_execute_graph_verified'
            and t.get('launch_gesture_verified') is True and t.get('execution_completed') is False
            for t in launch_outcome.get('trace',[])))
    elif launch_mode=='graph':
        state=next((s for n,s in reversed(observations) if n<launch),{})
        controls=[e for e in state.get('ui',{}).get('elements',[]) if e.get('ref')==launch_action.get('ref')]
        trace=launch_outcome.get('trace',[])
        gesture=(launch_action.get('verb')=='execute_graph_node' and launch_outcome.get('status')=='SUCCEEDED'
            and launch_outcome.get('cleanup_complete') is True and launch_outcome.get('output',{}).get('gesture_applied') is True
            and state.get('wizard',{}).get('status')=='absent'
            and same_node(state.get('prepared_node_context',{}))
            and state.get('node_outputs',{}).get('node_selected') is True
            and len(controls)==1 and controls[0].get('graph_execution',{}).get('node_id')==node['node_id']
            and controls[0].get('graph_execution',{}).get('source')=='native_selected_graph_node'
            and len([t for t in trace if t.get('event')=='ui_preconditions_verified'
                and t.get('verb')=='execute_graph_node' and t.get('refs')==[launch_action['ref']]])==1
            and len([t for t in trace if t.get('event')=='ui_gesture_applied' and t.get('verb')=='execute_graph_node'])==1)
    else:
        gesture=False
    if go<=launch or not gesture:
        failures.append('launch_gesture_proof')
    before = [(step, inventory(s)) for step, s in observations if step < launch and inventory(s)]
    after = [(step, s, inventory(s)) for step, s in observations if step > launch and inventory(s)]
    if not before or not after:
        return dict(passed=False, failures=failures+['complete_pre_and_post_history'], execution_id=None)
    baseline = before[-1][1]
    old = {p['process_id']: p['record_id'] for p in baseline['processes'] if p['parent_id'] is None}
    fresh_id = fresh_record = None
    for step, _, p in after:
        roots = {r['process_id']: r['record_id'] for r in p['processes'] if r['parent_id'] is None}
        if not retained_history_matches(baseline,p):
            failures.append('history_replaced')
        fresh = {k:v for k,v in roots.items() if k not in old}
        if step < go and (len(fresh) > 1 or fresh_id is not None and len(fresh) != 1):
            failures.append('ambiguous_new_execution')
        if fresh_id is None and len(fresh) == 1:
            fresh_id, fresh_record = next(iter(fresh.items()))
        if fresh_id is not None and roots.get(fresh_id) != fresh_record:
            failures.append('new_execution_replaced')
    pre_go = [(step, s, p) for step, s, p in after if step < go]
    post_go = [(step, s, p) for step, s, p in after if step > go]
    if not pre_go or not post_go or fresh_id is None:
        return dict(passed=False, failures=failures+['owner_observations_missing'], execution_id=None)
    _, s, p = pre_go[-1]
    selected = [r for r in p['processes'] if r.get('selected') is True]
    controls = [e for e in s.get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
    if (len(selected) != 1 or len(controls) != 1
            or controls[0].get('process_menu', {}).get('action') != 'mniShowNodeToProcess'
            or controls[0].get('process_menu', {}).get('process', {}).get('record_id') != selected[0]['record_id']):
        failures.append('owner_menu_binding')
    child = selected[0] if len(selected) == 1 else {}
    proven = False
    for _, s, p in post_go:
        outputs = s.get('node_outputs', {})
        groups = [r for r in p['processes'] if r['process_id'] == fresh_id and r['record_id'] == fresh_record]
        children = [r for r in p['processes'] if r.get('selected') is True]
        if (len(groups) == len(children) == 1 and groups[0].get('children_loaded') is True
                and groups[0].get('state') == 'completed' and groups[0].get('error') is False
                and children[0].get('process_id', '').startswith(fresh_id+'.')
                and children[0].get('record_id') == child.get('record_id') and children[0].get('rendered') is True
                and children[0].get('state') == 'completed' and children[0].get('error') is False
                and outputs.get('verified') is True and outputs.get('node_selected') is True
                and same_node(outputs.get('node_context', {})) and outputs.get('surface') == 'graph'):
            proven = True
    if not proven:
        failures.append('completed_process_owner_missing')
    execution_id = node['document_id']+':'+baseline['root_id']+':'+fresh_id
    return dict(passed=not failures, failures=sorted(set(failures)), execution_id=execution_id)


def verify_text_import_execution(events, request, source_bytes):
    result = _verify_text_import(events, request, source_bytes, 'execute')
    seq = verify_internal_sequence(events, request['operation_id'], max_steps=import_operation_step_budget(events, request['operation_id']))
    bindings = [s.get('prepared_node_context', {}) for _, s in seq['observations']]
    if not bindings:
        return dict(result, passed=False, failures=result['failures']+['prepared_node_missing'])
    proof = verify_execution_observations(seq['observations'], seq['mutations'], bindings[0])
    failures = result['failures'] + proof['failures']
    checkpoints = [e.get('result', {}) for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_checkpoint']
    if (len(checkpoints) != 1 or checkpoints[0].get('execution', {}).get('execution_id') != proof['execution_id']
            or checkpoints[0].get('output', {}).get('ports') != [] or request.get('read', {}).get('ports') != []):
        failures.append('execution_checkpoint_identity')
    return dict(result, passed=not failures, failures=sorted(set(failures)), execution_verified=not failures,
                execution_id=proof['execution_id'], output_data_verified=False)
