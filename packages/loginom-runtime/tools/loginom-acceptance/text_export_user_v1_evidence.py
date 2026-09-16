"""Consume unmodified real MCP wire replies through the full auditor's projector."""
import json,copy
from pathlib import Path
from evidence import PREFIX
from user_result_evidence import normalize_user_evidence

def wire_evidence(r):
    paths=list((r/'private/dock-state/sessions').iterdir());assert len(paths)==1;s=paths[0]
    metadata=json.loads((s/'session.json').read_text());assert metadata['resultProfile']=='user-v1'
    events=[json.loads(x) for x in (s/'execution-events.jsonl').read_text().splitlines()]
    lines=[json.loads(x) for x in (r/'public-wire.jsonl').read_text().splitlines()]
    calls=[];tools=[]
    for i,e in enumerate(lines):
        common=dict(row=i+1,session_id=metadata['sessionId'],tool_call_id=e['call_id'],tool=PREFIX+e['name'])
        if e['phase']=='request':calls.append(dict(**common,arguments=e['args']))
        else:
            assert e['phase']=='response' and e['reply'].get('isError') is not True
            actual=json.loads(e['reply']['content'][0]['text']);assert actual==e['result']
            tools.append(dict(**common,result=actual))
    return dict(calls=calls,tools=tools,events=events)

def verify_component_wire(r):
    raw=wire_evidence(r);before=copy.deepcopy(raw);normalized,projection=normalize_user_evidence(raw)
    assert raw==before and projection['passed'],projection
    assert projection['scope']=='user_v1_exact_projection_and_prepared_workflow'
    expected={'smoke-source','smoke-original','smoke-reject','smoke-replace'}
    declarations={e['operation_id']:e['request'] for e in raw['events'] if e.get('phase')=='node_apply_prepared'};assert set(declarations)==expected
    public_nodes=[c for c in raw['calls'] if c['tool']==PREFIX+'dock_node_apply'];assert len(public_nodes)==4
    assert all(set(c['arguments']['workflow_ref'])=={'workflow_id'} for c in public_nodes)
    for c in normalized['calls']:
        if c['tool']==PREFIX+'dock_node_apply':assert c['arguments']==declarations[c['arguments']['operation_id']]
    for t in raw['tools']:
        if t['tool'] in {PREFIX+x for x in ['dock_node_apply','dock_node_wait','dock_artifact_deliver','dock_artifact_delivery_status']}:
            assert t['result'].get('result_version')=='user-v1' and 'outcome' not in t['result']
    from text_export_observer_run import verify_run_observer
    run=json.loads((r/'request.json').read_text());outer=verify_run_observer(r,run,declarations['smoke-replace']);assert outer['passed'],outer
    # No normalization may alter the actual dispatcher wire request.
    actual=json.loads((r/'observer/actual-dispatch.jsonl').read_text())
    replace=next(c['arguments'] for c in public_nodes if c['arguments']['operation_id']=='smoke-replace')
    assert actual['request']['params']['arguments']==replace
    return dict(passed=True,scope='real_user_v1_component_only',projection=projection,outer=outer,public_calls=len(raw['calls']),replace_request=declarations['smoke-replace'],full_goal_accepted=False)
