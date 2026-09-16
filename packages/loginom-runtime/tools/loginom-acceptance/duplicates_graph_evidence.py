"""Check one new marking node and its exact source edge, or unchanged reuse."""
from union_graph_evidence import verify_unchanged_inputs


def verify_duplicates_graph(events,request):
    if request['target']['kind']=='existing':
        result=verify_unchanged_inputs(events,request)
        return dict(result,scope='duplicates_unchanged_existing_graph')
    failures=[]
    try:
        states=[e['target_state'] for e in events if e.get('operation_id')==request['operation_id'] and e.get('phase')=='node_target_checkpoint']
        state=states[-1];before=state['baseline'];after=state['final_graph'];target=state['targetId']
        if not state.get('completed') or state.get('pending') is not None or not before.get('complete') or not after.get('complete'):
            raise ValueError('duplicates_graph_complete')
        def nodes(graph):return {n['ref']['node_id']:{k:v for k,v in n.items() if k!='dom_epoch'} for n in graph['nodes']}
        old,new=nodes(before),nodes(after)
        if set(new)-set(old)!={target} or any(new.get(k)!=v for k,v in old.items()):raise ValueError('duplicates_one_new_node')
        n=new[target]
        if n['type']!='research.duplicates' or n['label']!=request['target']['label'] or n['inputs']!=[0] or n['outputs']!=[0]:
            raise ValueError('duplicates_new_identity')
        if len(request['inputs'])!=1:raise ValueError('duplicates_one_input')
        source=request['inputs'][0]
        edge=dict(source=source['source']['node_id'],output=source['output'],target=target,input=source['input'])
        key=lambda e:(e['source'],e['output'],e['target'],e['input'])
        if sorted(map(key,after['links']))!=sorted(map(key,before['links']+[edge])) or before['foreign_links']!=after['foreign_links']:
            raise ValueError('duplicates_exact_link_delta')
        if not state['receipts'] or any(r.get('verified') is not True or r.get('receipt',{}).get('status')!='SUCCEEDED' or r['receipt'].get('cleanup_complete') is not True for r in state['receipts']):
            raise ValueError('duplicates_graph_receipts')
    except (KeyError,IndexError,TypeError,ValueError) as error:failures.append(str(error))
    return dict(passed=not failures,failures=failures,scope='duplicates_new_node_and_exact_source')
