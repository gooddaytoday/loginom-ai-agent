"""Explicitly versioned independent reevaluation; execution harness stays frozen."""
import hashlib,importlib.util,json,sys
from pathlib import Path
RUN_ID='20260913-205733-a38816e5'
VERSION='node16-user-v1-reevaluation-v1'
ROOT=Path.cwd();WORK=ROOT/'tools/loginom-acceptance'
sys.path.insert(0,str(WORK))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def build(run):
 run=Path(run);request=json.loads((run/'request.json').read_text())
 if request['run_id']!=RUN_ID:raise ValueError('This verifier authorizes one explicit original run only')
 original=WORK/'collapse_node_acceptance.py'
 if sha(original)!=request['harness_inputs']['collapse_node_acceptance.py']:raise ValueError('Original execution auditor changed')
 for name,digest in request['harness_inputs'].items():
  if sha(WORK/name)!=digest:raise ValueError('Original execution harness changed: '+name)
 spec=importlib.util.spec_from_file_location('node16_original_auditor_preserved',original);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
 # A separately versioned independent implementation replaces only node projection.
 projection=Path(__file__).with_name('auditor-node-projection-candidate.py')
 exec(compile(projection.read_text(),str(projection),'exec'),v.__dict__)
 native=v.native_case
 def bind_restart(e,ps):
  old=RUN_ID+':reconfigured';final=old+'-final';source=old+'-source'
  rows=[(c,r) for c,r in ps if c['arguments'].get('operation_id')==old]
  v.need([c['tool'].removeprefix(v.PREFIX) for c,r in rows]==['dock_node_apply','dock_node_wait','dock_node_apply','dock_node_resume','dock_node_wait'],'Different recovery sequence')
  first,first_reply=rows[0];first_done=rows[1][1]['result'];replay_call,replay_reply=rows[2];resume_call,resume_reply=rows[3];resume_done=rows[4][1]['result']
  v.need(first_reply['result']['state']=='running' and first_done['state']=='settled' and first_done['status']=='NOT_APPLIED' and first_done['effect_possible'] is False and first_done['cleanup_complete'] is True,'Original operation had effects')
  v.need(replay_call['arguments']==resume_call['arguments']==first['arguments'] and replay_reply['result']==first_done,'Cached replay request/result changed')
  outcome=v.event(e,old,'completed')['outcome']
  v.need(outcome['status']=='NOT_APPLIED' and outcome['effect_possible'] is False and outcome['cleanup_complete'] is True,'Original journal had effects')
  v.need(not any(x.get('operation_id')==old and x.get('phase','').startswith('node_step') for x in e['events']),'Original operation dispatched a node step')
  v.need(sum(x.get('operation_id')==old and x.get('phase')=='node_apply_prepared' for x in e['events'])==1,'Replay/resume prepared extra work')
  v.need(resume_reply['result']['state']=='running' and resume_done['state']=='settled' and resume_done.get('status') is None and resume_done.get('outcome') is None and resume_done['error']['code']=='NODE_WORKER_REJECTED' and resume_done['error']['message']=='Resume requires the original inspected node checkpoint without an unresolved phase','Resume was not a refusal')
  target_call,target_reply=v.one([(c,r) for c,r in ps if c['tool']==v.PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==final],'Final operation identity')
  v.need({**first['arguments'],'operation_id':final}==target_call['arguments'] and target_call['arguments']['target']['kind']=='existing','Final target/parameters changed')
  v.need(rows[4][1]['row']<target_call['row'],'Final began before resume refusal')
  source_call,source_body=v.node(e,ps,source)
  v.need(source_body['status']=='SUCCEEDED' and source_body['execution']['status']=='completed','Source execution missing')
  sc,sr=v.one([(c,r) for c,r in ps if c['tool']==v.PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==source],'Source start')
  terminals=[r for c,r in ps if c['arguments'].get('operation_id')==source and r['result'].get('state')=='settled']
  v.need(rows[1][1]['row']<sc['row'] and terminals and max(r['row'] for r in terminals)<replay_call['row'],'Source execution order')
  proof=v.event(e,final,'collapse_native_full_completed')['proof']['source_profile']
  v.need(proof['import_operation_id']==source and proof['node_id']==source_body['node']['node_id'] and proof['execution_id']==source_body['execution']['execution_id'],'Different source execution')
  for c,r in ps:
   if first['row']<c['row']<target_call['row']:
    v.need(c['arguments'].get('operation_id') in (old,source) and c['tool'] in [v.PREFIX+n for n in ('dock_node_apply','dock_node_wait','dock_node_resume')],'Unaccounted intervening operation')
  v.saved_checkpoint(e,ps,RUN_ID+':save-reconfigured')
  return final
 def native_case(e,ps,op,key):
  if key=='reconfigured' and op==RUN_ID+':reconfigured':op=bind_restart(e,ps)
  return native(e,ps,op,key)
 v.native_case=native_case;v.bind_restart=bind_restart
 return v

def report(run,independent=None):
 run=Path(run);v=build(run);request=json.loads((run/'request.json').read_text());evidence=json.loads((run/'evidence.json').read_text())
 saved=json.loads((run/'original-export-hashes.json').read_text())
 for name,digest in saved.items():
  if sha(run/name)!=digest:raise ValueError('Original raw export/audit was changed: '+name)
 result=v.audit(request,evidence,(run/'scenario.txt').read_text(),independent)
 return {'scope':'explicitly versioned reevaluation of the original model run','verifier_version':VERSION,'run_id':RUN_ID,
  'original_execution_harness_unchanged':True,'original_files_sha256':saved,
  'original_auditor_sha256':request['harness_inputs']['collapse_node_acceptance.py'],
  'independent_verifier_sha256':{p.name:sha(p) for p in Path(__file__).parent.glob('*.py')},
  'projection_delta':['Remove only schema.header_tid from expected internal projection','Remove sample.display_text only when equal to that same cell value','Compare projected values with JSON type-sensitive equality'],
  'explicit_case_binding':{'reconfigured':{'original':RUN_ID+':reconfigured','final':RUN_ID+':reconfigured-final','requires':'original no-effect + identical cached replay + refused resume + same source execution + identical final target/parameters + saved checkpoint'}},
  'original_audit_preserved':True,'result':result}

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--independent',type=Path);args=p.parse_args()
 result=report(args.run,json.loads(args.independent.read_text()) if args.independent else None)
 args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'version':VERSION,'full_goal_passed':result['result']['passed'],'checks':result['result']['checks']},ensure_ascii=False))
