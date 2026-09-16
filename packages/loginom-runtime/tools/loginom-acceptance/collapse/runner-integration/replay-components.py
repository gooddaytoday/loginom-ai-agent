"""Offline component exercise using historical native data in synthetic pairs.
Not a model-run receipt and never a full acceptance result.
"""
import sys,json,copy
from pathlib import Path
P=Path(__file__).resolve().parent;W=P.parents[1];R=W.parents[1];sys.path.insert(0,str(W))
import collapse_node_acceptance as audit
D=R/'.dock/node16/live-1789304119268';events=[json.loads(l) for l in (D/'execution-events.jsonl').read_text().splitlines()]
body=json.loads((D/'public-user-mixed.json').read_text());op=body['operation_id'];proof=audit.event({'events':events},op,'collapse_native_full_completed')['proof'];imp=proof['source_profile']['import_operation_id']
e={'calls':[],'tools':[],'events':events}
for i,operation in enumerate([imp,op]):
 req=audit.event(e,operation,'node_apply_prepared')['request'];end=audit.event(e,operation,'completed')['outcome'];n=end['output']
 b=body if operation==op else dict(result_version='user-v1',state='settled',operation_id=operation,status=end['status'],node=n['node'],configuration=n['configuration'],execution=n['execution'],output=n['output'])
 c=dict(session_id='SYNTHETIC_COMPONENT_ONLY',tool_call_id=str(i),row=2*i+1,tool=audit.PREFIX+'dock_node_apply',arguments=copy.deepcopy(req))
 e['calls'].append(c);e['tools'].append(dict(session_id=c['session_id'],tool_call_id=c['tool_call_id'],row=c['row']+1,tool=c['tool'],result=b,raw_content=json.dumps(b)))
audit.native_case(e,audit.pairs(e),op,'mixed');denied=0
for mutate in [lambda b:b['tools'][-1]['result']['output']['ports'][0]['exact_table']['rows'].pop(),lambda b:b['events'].clear(),lambda b:b['events'].remove(next(x for x in b['events'] if x['phase']=='collapse_native_full_completed' and x['operation_id']==op)),lambda b:audit.event(b,op,'collapse_native_full_completed')['proof']['source_profile']['source'].__setitem__('sha256','0'*64),lambda b:audit.event(b,op,'collapse_native_full_completed')['proof']['loaded_runtime']['functions'].clear(),lambda b:audit.event(b,op,'node_apply_prepared')['request'].__setitem__('parameters',{'ignore_empty':True})]:
 bad=copy.deepcopy(e);mutate(bad)
 # Cell mutation with matching raw text must still fail values/internal binding.
 for r in bad['tools']:r['raw_content']=json.dumps(r['result'])
 try:audit.native_case(bad,audit.pairs(bad),op,'mixed')
 except (ValueError,AssertionError,KeyError,TypeError):denied+=1
 else:raise AssertionError('Negative accepted')
print(json.dumps(dict(status='COMPONENT_REPLAY_PASS',cells=60,negative_mutations_rejected=denied,synthetic_transport=True,model_run=False,acceptance=False)))
