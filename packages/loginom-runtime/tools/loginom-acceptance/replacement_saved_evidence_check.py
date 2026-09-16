"""Replay auditor components on historical local evidence, never autonomous admission."""
import argparse,json
from copy import deepcopy
from pathlib import Path
from replacement_acceptance import FIX
from replacement_evidence_audit import audit
from replacement_evidence_negative import verify_negative_cases
from replacement_persistence_evidence import verify_persistence

def check(root):
 read=lambda p:json.loads(p.read_text())
 events=lambda p:[json.loads(x) for x in (p/'execution-events.jsonl').read_text().splitlines()]
 checks={}
 p=root/'961f9801-0b4f-4eae-bde1-156bf3a1224e';es=events(p);r=next(e['request'] for e in es if e.get('phase')=='node_apply_prepared' and e['request']['parameters'].get('rules') and e['request']['parameters']['rules'][0]['field']['name']=='Category');op=r['operation_id'];es=[e for e in es if e.get('operation_id')==op]
 checks['typed_operation']=audit(es,r,read(FIX/'expected-multi.json'))
 checks['typed_negative']=verify_negative_cases(es,r,read(FIX/'expected-multi.json'))
 p=root/'c6874c61-d27b-41b6-a618-00074f6c9bf4';es=events(p)
 for name,fixture in [('fixed-partial-c','expected-partial-add.json'),('fixed-to-replace','expected-partial-replace.json'),('fixed-to-add','expected-partial-add.json')]:
  r=read(p/('node11-r1-'+name+'-request.json'));checks[name]=audit([e for e in es if e.get('operation_id')==r['operation_id']],r,read(FIX/fixture))
 p=root/'e1368ffd-31b0-4766-968a-076b121d1e6c';b=read(p/'wide-refreshed-request.json');a=read(p/'wide-persisted-request.json');prep=read(p/'prepare-after-save.json');ids=['node11-final-save','node11-final-reopen'];es=[e for e in events(p) if e.get('operation_id') in ids+[b['operation_id'],a['operation_id']]]
 def verify(rows,after,pr):return verify_persistence(rows,b,after,read(FIX/'expected-wide.json'),read(FIX/'expected-diagnostic-graph.json'),'/test-2/Node11-Handler-90de4e18.lgp',pr,ids,revisions={'package.save_checkpoint':'2','package.save_as':'2'})
 checks['historical_persistence']=verify(es,a,prep)
 negative={}
 for case in ('missing_close','foreign_path','changed_settings','reconfigured','foreign_session','changed_graph'):
  rows,after,pr=deepcopy(es),deepcopy(a),deepcopy(prep)
  save=next(e['outcome'] for e in rows if e.get('phase')=='completed' and e.get('operation_id')==ids[1])
  cp=next(e['result'] for e in rows if e.get('phase')=='node_checkpoint' and e.get('operation_id')==a['operation_id'])
  if case=='missing_close':save['trace']=[x for x in save['trace'] if x.get('event')!='saved_package_closed']
  elif case=='foreign_path':save['output']['package_ref']['path']='/foreign.lgp'
  elif case=='changed_settings':cp['configuration']['readback']['rules'][0]['pairs'][0]['to']['value']='changed'
  elif case=='reconfigured':after['parameters']={'output_mode':'add'}
  elif case=='foreign_session':pr['session_id']='foreign'
  else:next(x for x in save['trace'] if x.get('event')=='reopened_package_observed')['graph']['nodes'].pop()
  negative[case]=not verify(rows,after,pr)['passed']
 checks['persistence_negative']=dict(passed=all(negative.values()),checks=negative,count=len(negative))
 return dict(passed=all(c['passed'] for c in checks.values()),checks=checks,autonomous_acceptance=False,scope='saved_evidence_component_regression_only')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--sessions',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=check(a.sessions)
 with a.output.open('x') as f:f.write(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(dict(passed=r['passed'],checks={k:v['passed'] for k,v in r['checks'].items()},autonomous_acceptance=False)));raise SystemExit(0 if r['passed'] else 1)
