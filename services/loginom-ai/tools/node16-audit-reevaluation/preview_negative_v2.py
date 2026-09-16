"""Prove the bounded new-node missing-field preview without accepting mutations.

The three UI actions are port selection, F3 and closing that same preview.
Nothing else is exempted from the negative-case no-step rule.
"""
import hashlib,json

def verify_preview_negative(v,e,op):
    need=v.need
    events=[x for x in e['events'] if x.get('operation_id')==op]
    request=v.event(e,op,'node_apply_prepared')['request']
    need(request['target']['kind']=='new' and request['target']['type']=='transform.collapse_columns' and request['mappings']==[],'Preview exception requires unmapped new Collapse')
    port=v.one(request['inputs'],'One explicit source required')
    need(port['input']==0 and port['output']==0,'Preview exception requires port zero')
    source=port['source']
    need(source['document_id']==request['document_id'] and source['workflow_id']==request['workflow_ref']['workflow_id'],'Foreign preview source')
    proof=v.event(e,op,'collapse_preflight_completed')['proof']
    need(proof['verified'] is True and proof['cleanup_complete'] is True and proof['settings_changed'] is False and proof['parameters_valid'] is False,'Preview did not reject cleanly')
    need(proof['source']==source and proof['port']==0,'Preview source differs')
    steps=[x for x in events if x['phase']=='node_step_prepared']
    observations=[x for x in events if x['phase']=='node_observation_completed']
    ends=[x for x in events if x['phase']=='node_step_completed']
    need([x['step'] for x in steps]==[2,4,6] and [x['step'] for x in observations]==[1,3,5,7] and [x['step'] for x in ends]==[2,4,6],'Unexpected preview actions or observations')
    # Require terminal target refusal: no target creation, linking, wizard or execution.
    allowed={'prepared','node_apply_prepared','node_phase_prepared','node_phase_completed','node_observation_sample','node_observation_completed','node_step_prepared','node_step_completed','collapse_preflight_completed','node_phase_refused','completed'}
    need(all(x['phase'] in allowed for x in events),'Unaccounted negative event')
    for x in events:
        if x['phase'].startswith('node_phase_'):
            need(x.get('receipt',{}).get('phase') in ('source','workflow','target'),'Negative reached a mutating node phase')
    phases=[(x['phase'],x['receipt']['phase']) for x in events if x['phase'].startswith('node_phase_')]
    need(phases==[('node_phase_prepared','source'),('node_phase_completed','source'),('node_phase_prepared','workflow'),('node_phase_completed','workflow'),('node_phase_prepared','target'),('node_phase_refused','target')],'Unexpected negative phase sequence')
    for x in events:
        if x['phase'] in ('node_phase_completed','node_phase_refused'):
            need(x['receipt']['effect_possible'] is False,'Negative phase had effects')
    before,selected,preview,after=[x['outcome']['output'] for x in observations]
    for x in observations:
        need(x['outcome']['status']=='SUCCEEDED' and x['readiness']['satisfied'] is True,'Incomplete preview observation')
    context=before['prepared_node_context']
    need(context['verified'] is True and context['surface']=='graph' and context['locked'] is False and all(context[k]==value for k,value in source.items()),'Unowned source context')
    for state in (before,selected,preview,after):
        need(state['prepared_node_context']==context and state['wizard']['status']=='absent' and state['scan']['complete'] is True and state['scan']['omitted_regions']==[],'Incomplete or foreign preview surface')
    ports=before['node_outputs'];need(ports['verified'] is True and ports['node_context']==context,'Unverified source output')
    output=v.one([x for x in ports['ports'] if x['index']==0],'Source output ambiguity')
    need(output['active'] is True and isinstance(output['port_guid'],str) and output['port_guid'],'Source port inactive')
    schema=preview['node_preview_schema']
    need(schema['verified'] is True and schema['inventory_complete'] is True and schema['settings_changed'] is False and schema['node_context']==context and schema['node_id']==source['node_id'] and schema['port_guid']==output['port_guid'] and schema['port']==0,'Preview ownership/schema mismatch')
    need(schema==proof['preview'] and schema['fields']==proof['schema'] and proof['node_context']==after['prepared_node_context'],'Preview proof differs from observations')
    fields=schema['fields']
    need([f['index'] for f in fields]==list(range(len(fields))) and '__MissingField__' not in [f['name'] for f in fields],'Missing-field rejection not established')
    expected=[('click',output['tid']),('press',output['tid']),('click',schema['root_tid']+';p.h;close')]
    digest=lambda value:hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    for step,obs,end,(verb,tid) in zip(steps,observations,ends,expected):
        state=obs['outcome']['output'];action=step['action'];ref=action['ref']
        element=v.one([x for x in state['ui']['elements'] if x['ref']==ref],'Unbound preview action')
        need(element['tid']==tid and verb in element['allowed_actions'],'Wrong preview control')
        need(action==({'verb':verb,'ref':ref,'key':'F3'} if verb=='press' else {'verb':verb,'ref':ref}),'Different preview gesture')
        need(step['internal_operation_id']==op+':n'+str(step['step']) and step['observation_sha256']==digest(state) and step['signature']==digest([step['internal_operation_id'],action,state]),'Preview action snapshot binding')
        result=end['outcome']
        need(result['status']=='SUCCEEDED' and result['cleanup_complete'] is True and result['action_key']=='ui.act' and result['operation_id']==step['internal_operation_id'],'Preview action did not complete')
        need(events.index(obs)<events.index(step)<events.index(end),'Preview event order')
    ordered=[observations[0],steps[0],ends[0],observations[1],steps[1],ends[1],observations[2],steps[2],ends[2],observations[3]]
    need([events.index(x) for x in ordered]==sorted(events.index(x) for x in ordered),'Overlapping preview actions')
    # Selection may regenerate UI refs. Preserve every other graph/port property.
    def graph(state):
        nodes=json.loads(json.dumps(state['nodes']))
        for n in nodes:
            for p in n['ports']:p.pop('ui_ref',None)
        return [nodes,state['links'],state['graph_identity'],state['package_identity'],state['workflow_ref']]
    need(graph(before)==graph(selected)==graph(after),'Negative changed graph topology or package')
    need(not after.get('node_preview_schema') and events.index(observations[-1])<events.index(v.event(e,op,'collapse_preflight_completed')),'Preview was not closed before refusal')
    terminal=v.event(e,op,'completed')['outcome']
    need(terminal['status']=='NOT_APPLIED' and terminal['effect_possible'] is False and terminal['cleanup_complete'] is True and terminal['output'].get('node') is None,'Negative allocated or modified target')
    return True
