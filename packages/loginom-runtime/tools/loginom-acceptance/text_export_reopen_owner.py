"""Derive same-session saved-package provenance from complete native receipts.

Does not rewrite the draft-only ownership_verified flag and does not grant
ownership to an arbitrary open_package or to an unrelated fresh session.
"""


def one(values, reason):
    assert len(values) == 1, reason
    return values[0]


def graph_identity(graph):
    assert graph['complete'] is True and not graph['foreign_links'], 'Incomplete native ownership graph'
    nodes=graph['nodes']
    assert len({n['ref']['node_id'] for n in nodes})==len(nodes), 'Duplicate native GUID'
    return {'nodes':sorted((n['ref']['node_id'],n['type'],n['label'],tuple(n['inputs']),tuple(n['outputs']),tuple(n['other_ports'])) for n in nodes),
            'links':sorted((l['source'],l['output'],l['target'],l['input']) for l in graph['links'])}


def verify_reopened_owner(events, preparation_index, operation, node):
    current=events[preparation_index];state=current['state'];sid=current['session_id']
    assert state['ownership_verified'] is False and state['created_draft'] is False, 'Expected reopened package, not new draft'
    assert state['phase']=='exact_workflow_ready' and state['package_ref']['persisted'] is True, 'Persisted exact package required'
    assert not any('(только чтение)' in c.get('label','') for c in state['workflow_ref'].get('navigation_path',[])), 'Read-only original package'
    prior=[(i,e) for i,e in enumerate(events[:preparation_index]) if e.get('event')=='workspace_prepared' and e.get('session_id')==sid]
    old_index,old=one(prior,'Unique original owned draft required')
    original=old['state'];keys=('session_id','runtime_revision','manifest_sha256','target')
    def context(e): assert all(e.get(k)==current.get(k) for k in keys), 'Foreign ownership receipt context'
    context(old)
    assert original['status']=='READY' and original['authenticated'] is True and original['ownership_verified'] is True and original['target_verified'] is True and original['created_draft'] is True, 'Original owned draft unverified'
    assert original['document_id']==state['document_id']==node['document_id'], 'Foreign reopened document'
    assert all(original['workflow_ref'][k]!=state['workflow_ref'][k] for k in ('workflow_id','prefix','tab_tid')), 'Reopen did not create fresh workflow'
    path=state['package_ref']['path']
    saves=[(i,e) for i,e in enumerate(events) if old_index<i<preparation_index and e.get('phase')=='completed' and e.get('action_key')=='package.save_as' and e.get('session_id')==sid]
    saved_index,saved=one(saves,'Unique save-close-reopen action required');context(saved)
    action=saved['operation_id']
    started_index,started=one([(i,e) for i,e in enumerate(events) if e.get('operation_id')==action and e.get('phase')=='prepared'],'Unique prepared save action required')
    context(started)
    assert old_index<started_index<saved_index<preparation_index, 'Save/reopen order differs'
    assert all(started.get(k)==saved.get(k) for k in ('action_key','action_revision','parameters','checkpoint')), 'Save receipt mismatch'
    assert started['parameters']['path']==path and started['checkpoint']['path']==path and started['checkpoint']['package_identity']['path']==path, 'Saved package path differs'
    assert started['checkpoint']['workflow_ref']=={k:original['workflow_ref'][k] for k in ('tab_tid','prefix')}, 'Save source owner differs'
    outcome=saved['outcome']
    assert outcome['status']=='SUCCEEDED' and outcome['cleanup_complete'] is True and outcome['operation_id']==action and outcome['action_key']=='package.save_as', 'Save action did not succeed'
    assert outcome['output']['reopened'] is True and outcome['output']['package_ref']['path']==path, 'Wrong reopened package'
    trace=outcome['trace'];assert all(a['at_ms']<=b['at_ms'] for a,b in zip(trace,trace[1:])), 'Reordered save trace'
    names=['save_requested','save_flow_completed','saved_package_closed','reopened_package_observed','postcondition_verified']
    positions=[one([i for i,t in enumerate(trace) if t['event']==name],'Missing/duplicate '+name) for name in names]
    assert positions==sorted(positions), 'Save-close-reopen sequence differs'
    requested,flow,closed,reopened,post=[trace[i] for i in positions]
    assert requested['path']==flow['path']==reopened['requested_path']==reopened['actual_path']==post['package_path']==path, 'Native reopened path differs'
    assert reopened['path_matches'] is True and reopened['graph_matches'] is True and post['reopened'] is True, 'Unverified native reopen'
    assert reopened['graph']==post['graph']==started['checkpoint']['graph'], 'Saved/reopened graph differs'
    preconditions=[t['active_tab'] for t in trace if t['event']=='preconditions_verified']
    assert preconditions==[original['workflow_ref']['prefix'],state['workflow_ref']['prefix']], 'Native reopened tab differs'
    before=[(i,e) for i,e in enumerate(events) if old_index<i<started_index and e.get('phase')=='node_target_checkpoint' and e.get('target_state',{}).get('completed') and e.get('session_id')==sid]
    assert before, 'Missing original native graph'
    _,before_event=before[-1];context(before_event);old_graph=before_event['target_state']['final_graph']
    after_event=one([e for e in events[preparation_index+1:] if e.get('operation_id')==operation and e.get('phase')=='node_target_checkpoint' and e.get('target_state',{}).get('completed')], 'Unique reopened native graph required')
    context(after_event);new_graph=after_event['target_state']['final_graph']
    assert old_graph['document_id']==new_graph['document_id']==node['document_id'], 'Native graph document differs'
    for graph,owner in [(old_graph,original),(new_graph,state)]:
        assert all(graph['workflow_ref'][k]==owner['workflow_ref'][k] for k in ('workflow_id','prefix','tab_tid')), 'Native graph workflow differs'
    assert graph_identity(old_graph)==graph_identity(new_graph), 'Native reopened GUID/graph differs'
    assert one([n for n in new_graph['nodes'] if n['ref']['node_id']==node['node_id']], 'Reopened node missing')['ref']==node, 'Reopened native node differs'
    fingerprint=started['checkpoint']['graph'];labels={n['ref']['node_id']:n['label'] for n in old_graph['nodes'] if n['type']!='bg-vendor-icon-modelvariables'}
    assert sorted(labels.values())==fingerprint['nodes'], 'Action graph labels differ from native GUID graph'
    links=sorted(labels[l['source']]+'|Output_Data['+str(l['output'])+']|'+labels[l['target']]+'|Input_Data['+str(l['input'])+']' for l in old_graph['links'])
    assert links==fingerprint['links'], 'Action graph links differ from native GUID graph'
    return {'verified':True,'kind':'owned_draft_saved_closed_reopened','save_operation_id':action,'path':path,'native_guid_graph_verified':True}
