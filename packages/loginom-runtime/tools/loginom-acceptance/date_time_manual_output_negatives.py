"""Reject seven mutations of a completed manual-output diagnostic journal."""
import copy,json,sys
from pathlib import Path
from date_time_manual_output import verify
p=Path(sys.argv[1]);original=json.loads('['+','.join(p.joinpath('execution-events.jsonl').read_text().splitlines())+']');repeat=json.loads((p/'manual-repeat.json').read_text())
assert verify(p)['passed']
class File:
 def __init__(self,value):self.value=value
 def read_text(self):return self.value
class Evidence:
 def __init__(self,events,repeat):self.events=events;self.repeat=repeat
 def __truediv__(self,name):return File('\n'.join(json.dumps(e) for e in self.events) if name=='execution-events.jsonl' else json.dumps(self.repeat))
def maps(events):
 return [e['outcome']['output']['node_mapping'] for e in events if e.get('operation_id')=='node13-manual-add' and e.get('phase')=='node_observation_completed' and e.get('outcome',{}).get('output',{}).get('node_mapping',{}).get('source_identity_verified') is True and e.get('outcome',{}).get('output',{}).get('node_mapping',{}).get('mapping_wizard') in ('DerivedDataSourceMappingEngineOutputPortWizard','DerivedDataSourceOutputSocketWizard')]
results=[]
for mode in ['autosync','retained_name','retained_exclusion','added_source','selection','missing_create','repeat_effect']:
 events=copy.deepcopy(original);r=copy.deepcopy(repeat);ms=maps(events)
 if mode=='autosync':ms[0]['autosync']=True
 elif mode=='retained_name':next(m for m in ms if len(m['target_fields'])==8)['target_fields'][0]['name']='Changed'
 elif mode=='retained_exclusion':next(f for f in next(m for m in ms if len(m['target_fields'])==8)['target_fields'] if f['excluded'])['excluded']=False
 elif mode=='added_source':next(f for f in next(m for m in ms if len(m['target_fields'])==8)['target_fields'] if f['name']=='DateB_Q_1')['source']['record_id']='foreign'
 elif mode=='selection':
  for m in ms:
   if m.get('source_selection',{}).get('record_ids'):m['source_selection']['record_ids']=['foreign']
 elif mode=='missing_create':
  previous={}
  for e in events:
   if e.get('phase')=='node_observation_completed':previous=e['outcome']['output']
   if e.get('phase')=='node_step_prepared':
    element=next((x for x in previous.get('ui',{}).get('elements',[]) if x['ref']==e.get('action',{}).get('ref')), {})
    if (element.get('tid') or '').endswith(';btnCreateMapping'):e['action']['verb']='other';break
 elif mode=='repeat_effect':r['after']+=1
 result=verify(Evidence(events,r));assert not result['passed'],mode;results.append({'case':mode,'rejected':True,'failures':result['failures']})
out={'passed':True,'rejected':len(results),'cases':results};(p/'manual-negative-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False,indent=2))
