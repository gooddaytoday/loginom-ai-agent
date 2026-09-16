"""Check the exact Union graph delta independently from its handler result."""
from copy import deepcopy

def verify_unchanged_inputs(events,request):
    """Restating existing links must not create any graph gesture or delta."""
    failures=[]
    try:
        op=request['operation_id'];target=request['target']['ref']['node_id']
        state=[e['target_state'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_target_checkpoint'][-1]
        if not state.get('completed') or state.get('pending') is not None or state['targetId']!=target:raise ValueError('graph_unfinished')
        before,after=state['baseline'],state['final_graph']
        if not before.get('complete') or not after.get('complete'):raise ValueError('graph_incomplete')
        def graph(g):
            return dict(nodes=sorted(({k:v for k,v in n.items() if k!='dom_epoch'} for n in g['nodes']),key=lambda n:n['ref']['node_id']),
                links=sorted(g['links'],key=lambda e:(e['source'],e['output'],e['target'],e['input'])),foreign_links=g['foreign_links'])
        if graph(before)!=graph(after):raise ValueError('existing_graph_changed')
        if state['receipts'] or any(e.get('operation_id')==op and e.get('phase')=='node_target_effect_prepared' for e in events):raise ValueError('unexpected_graph_effect')
        for i in request['inputs']:
            if dict(source=i['source']['node_id'],output=i['output'],target=target,input=i['input']) not in before['links']:raise ValueError('existing_link_request')
    except (KeyError,IndexError,ValueError,TypeError) as error:failures.append(str(error))
    return dict(passed=not failures,failures=failures,scope='unchanged_existing_union_graph')

def verify_third_input(events,request):
    failures=[]
    try:
        op=request['operation_id'];target=request['target']['ref']['node_id']
        states=[e['target_state'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_target_checkpoint']
        state=states[-1]
        if not state.get('completed') or state.get('pending') is not None:raise ValueError('graph_unfinished')
        before=deepcopy(state['baseline']);after=deepcopy(state['final_graph'])
        if not before.get('complete') or not after.get('complete'):raise ValueError('graph_incomplete')
        def nodes(g):return {n['ref']['node_id']:{k:v for k,v in n.items() if k!='dom_epoch'} for n in g['nodes']}
        b,a=nodes(before),nodes(after)
        if set(a)!=set(b) or state['targetId']!=target:raise ValueError('graph_node_identity')
        if b[target]['type']!='transform.union_data' or b[target]['inputs']!=[0,1] or a[target]['inputs']!=[0,1,2]:raise ValueError('graph_input_inventory')
        a[target]['inputs']=[0,1]
        if a!=b:raise ValueError('graph_unrelated_node_change')
        third=[i for i in request['inputs'] if i['input']==2]
        if len(third)!=1 or any(i['input'] not in (0,1,2) for i in request['inputs']):raise ValueError('third_input_request')
        for i in request['inputs']:
            if i['input']<2 and dict(source=i['source']['node_id'],output=i['output'],target=target,input=i['input']) not in before['links']:raise ValueError('existing_link_request')
        src=third[0];edge={'source':src['source']['node_id'],'output':src['output'],'target':target,'input':2}
        key=lambda e:(e['source'],e['output'],e['target'],e['input'])
        if sorted(map(key,after['links']))!=sorted(map(key,before['links']+[edge])):raise ValueError('graph_link_delta')
        if before['foreign_links']!=after['foreign_links']:raise ValueError('foreign_link_change')
        effects=[e['effect'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_target_effect_prepared']
        receipts=state['receipts']
        if [e['kind'] for e in effects]!=['add_input','connect'] or [e['kind'] for e in receipts]!=['add_input','connect']:raise ValueError('duplicate_graph_effect')
        if any(r.get('verified') is not True or r['id']!=e['id'] for r,e in zip(receipts,effects)):raise ValueError('graph_receipt')
        if receipts[0]['receipt']['after']!=effects[1]['before']:raise ValueError('graph_observation_chain')
        if any(r['receipt'].get('status')!='SUCCEEDED' or r['receipt'].get('cleanup_complete') is not True for r in receipts):raise ValueError('graph_receipt_outcome')
        link=receipts[1]['receipt']
        if link.get('action_key')!='link.create' or link.get('operation_id')!=effects[1]['id'] or not link.get('output',{}).get('link_ref',{}).get('tid'):raise ValueError('graph_link_receipt')
    except (KeyError,IndexError,ValueError,TypeError) as error:failures.append(str(error))
    return {'passed':not failures,'failures':failures,'scope':'same_union_exact_third_input'}
