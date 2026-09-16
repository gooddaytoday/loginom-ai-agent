"""Audit an actual post-gesture lost reply and fail-closed replay, not recovery."""
import copy
import json
from pathlib import Path

def audit(loss,replay,native,gesture):
    o=loss['outcome'];body=o['output'];drop=loss['dropped']
    assert o['status']=='AMBIGUOUS' and o['operation_id']=='node16-drop-flag-reply' and o['phase']=='configure'
    assert body['pending_phase']=='configure' and body['cleanup_complete'] is False
    assert len(drop)==1 and drop[0]['operation_id']==o['operation_id'] and drop[0]['verb']=='set_checked' and drop[0]['gesture_applied'] is True
    assert drop[0]['browser_sequence']==replay['before']==replay['after']==replay['after_resume']
    assert replay['same_result'] is True and replay['replay_status']=='AMBIGUOUS' and 'unresolved phase' in replay['resumed']['error']
    assert gesture['operation_id']==o['operation_id']
    act=gesture['output']['value'];assert act['status']=='SUCCEEDED' and act['action_key']=='ui.act' and act['output']['gesture_applied'] is True
    context=act['output']['prepared_node_context']
    assert context['node_id']==body['node']['node_id'] and context['document_id']==body['node']['document_id']
    assert native['skip'] is False and native['variable'] is False
    fields=native['grids'][0]['source']
    assert [f['data']['Name']for f in sorted((f for f in fields if f['data']['Disposition']==7),key=lambda f:f['data']['Order'])]==['B','I']
    return {'post_gesture_loss':'PASS','replay_no_browser_work':'PASS','automatic_resume':'REFUSED_UNRESOLVED_PHASE','runtime_continuation':'ORIGINAL_RUNTIME_REMAINS_BLOCKED'}

def negatives(args):
    edits=[lambda l,r,n,g:l['outcome'].update(status='SUCCEEDED'),lambda l,r,n,g:r.update(after_resume=r['after_resume']+1),lambda l,r,n,g:l['dropped'].append(l['dropped'][0]),lambda l,r,n,g:n.update(skip=True),lambda l,r,n,g:g['output']['value']['output']['prepared_node_context'].update(node_id='foreign'),lambda l,r,n,g:g['output']['value']['output'].update(gesture_applied=False)]
    for edit in edits:
        changed=copy.deepcopy(args);edit(*changed)
        try:audit(*changed)
        except (AssertionError,KeyError):continue
        raise AssertionError('loss mutation accepted')
    return len(edits)

if __name__=='__main__':
    import sys
    root=Path(sys.argv[1]);loss,replay,native=[json.loads((root/name).read_text())for name in ['lost-reply.json','replay-lost.json','lost-native-state.json']]
    tool=json.loads((root/f"browser-{loss['dropped'][0]['browser_sequence']}.json").read_text())
    text='\n'.join(c.get('text','')for c in tool['content']);gesture=json.loads(text.split('### Result\n')[1].split('\n### ')[0])
    args=(loss,replay,native,gesture);r=audit(*args);r['negative_mutations_rejected']=negatives(args);print(json.dumps(r,indent=2))
