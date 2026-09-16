"""Independent saved graph identity / empty-result verification across sessions."""
import copy
import json
import sys
from pathlib import Path
from audit_edge_cases import audit_empty, negatives

def chain(snapshot):
    nodes={n['label']:n['id'] for n in snapshot['nodes']}
    ids=[nodes[n] for n in ['Node16Types','Node16EmptySource','Node16EmptyCollapse']]
    links=[]
    for source,target in zip(ids,ids[1:]):
        match=[l for l in snapshot['links'] if l['source']['node']==source and l['target']['node']==target]
        assert len(match)==1
        l=match[0];links.append((l['id'],source,l['source']['port'],target,l['target']['port']))
    return ids,links

def audit(before,after,saved,result,operation):
    assert chain(before)==chain(after)
    assert saved['status']=='SUCCEEDED' and saved['output']['save_completed'] is True
    assert saved['output']['package_ref']['path']==saved['output']['package_ref']['active_identity']
    continuations=saved['output']['workflow_continuations']
    assert continuations and all(c['document_id']!=result['output']['node']['document_id'] for c in continuations)
    audit_empty(result,operation)
    assert result['output']['node']['node_id']==chain(after)[0][2]
    assert result['output']['configuration']['readback']['input_mapping']['fields']

if __name__=='__main__':
    before,after,saved,result=[json.loads(Path(p).read_text()) for p in sys.argv[1:5]]
    operation=sys.argv[5];audit(before,after,saved,result,operation)
    rejected=negatives(result,'empty',operation)
    for mutation in ['link','port','owner']:
        a=copy.deepcopy(after)
        target=chain(a)[0][2];l=next(l for l in a['links'] if l['target']['node']==target)
        if mutation=='link':l['id']='wrong'
        elif mutation=='port':l['source']['port']='wrong'
        else:l['source']['node']='wrong'
        try:audit(before,a,saved,result,operation)
        except (AssertionError,KeyError):rejected+=1
        else:raise AssertionError('Graph identity mutation accepted')
    print(json.dumps({'diagnostic':'PASS','graph_chain_unchanged':True,'empty_reexecution':True,'negative_mutations_rejected':rejected,'exact_non_null_variant':'BLOCKED'},indent=2))
