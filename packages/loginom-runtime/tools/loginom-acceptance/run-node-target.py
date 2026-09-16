"""One operator-authorized, goal-only Hermes run for the private 02 graph phase."""
import argparse,json,os,signal,subprocess,time,uuid
from pathlib import Path
from run import connection,environment,write
from preflight import runtime_pin
from evidence import export_history
from node_target_audit import audit
WORK=Path(__file__).resolve().parent
REPO=WORK.parents[1]
HOME=Path.home()
def main():
 p=argparse.ArgumentParser();p.add_argument('--loginom-url',required=True);p.add_argument('--loginom-user',required=True);p.add_argument('--run',action='store_true');a=p.parse_args()
 os.umask(0o077)
 node=HOME/'.loginom-dock/current/runtime/node';py=HOME/'.hermes/hermes-agent/venv/bin/python';source=HOME/'.hermes/hermes-agent'
 frozen=runtime_pin(REPO);auth=connection(HOME/'.hermes')
 root=REPO/'.dock/add-nodes-v2';run=root/('hermes-'+time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]);home=run/'private/hermes';home.mkdir(parents=True)
 def mcp(directory):return {'command':str(node),'args':[str(WORK/'node-target-server.mjs')],'env':{'DOCK_NODE_ACCEPTANCE_DIR':str(directory),'DOCK_NODE_ACCEPTANCE_URL':a.loginom_url,'DOCK_NODE_ACCEPTANCE_USER':a.loginom_user,'DOCK_NODE_ACCEPTANCE_SHA':frozen['client_revision']}}
 config={'fallback_providers':[],'mcp_servers':{'loginom-dock':{**mcp(run/'model-browser'),'enabled':True,'connect_timeout':180,'timeout':120}},'agent':{'max_turns':45,'reasoning_effort':'low'},'tools':{'tool_search':{'enabled':'off'}},'memory':{'provider':'none'},'plugins':{'enabled':[]},'checkpoints':{'enabled':False}}
 prompt=(WORK/'goals/node-target.txt').read_text()
 import hashlib
 pins={str(path.relative_to(WORK)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [WORK/'node-target-server.mjs',WORK/'node_target_audit.py',WORK/'goals/node-target.txt',WORK/'node-target-precheck.mjs',WORK/'hermes_auth_guard.py',Path(__file__)]}
 request={'scope':'internal_graph_phase_source_runtime','runtime':frozen,'harness':pins,'provider':'openai-codex','model':'gpt-5.6-sol','reasoning':'low','goal_only':True,'fallback':False}
 write(run/'request.json',request);write(run/'scenario.txt',prompt);write(home/'config.yaml',config)
 check=subprocess.run([str(node),str(WORK/'node-target-precheck.mjs'),json.dumps(mcp(run/'precheck-browser'))],capture_output=True,text=True,timeout=120,cwd=REPO)
 write(run/'tool-precheck.json',{'returncode':check.returncode,'stdout':check.stdout,'stderr':check.stderr[-1000:]});print(json.dumps({'run':str(run),'precheck':check.returncode}),flush=True)
 if check.returncode:raise RuntimeError('Typed tool precheck failed')
 if not a.run:return
 write(home/'auth.json',auth)
 env=environment({},home,run)
 argv=[str(py),str(WORK/'hermes_auth_guard.py'),str(source),str(run/'auth-guard.json'),'--provider','openai-codex','--model','gpt-5.6-sol','--reasoning','low','--toolsets','loginom-dock','--usage-file',str(run/'usage.json'),'-z',prompt]
 started=time.time();child=subprocess.Popen(argv,cwd=run,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True);print(json.dumps({'stage':'model_started','run':str(run)}),flush=True)
 timed_out=False
 try:child.wait(timeout=600)
 except subprocess.TimeoutExpired:
  timed_out=True;os.killpg(child.pid,signal.SIGTERM)
  try:child.wait(timeout=15)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
 calls,events=export_history(home,list(auth['providers']['openai-codex']['tokens'].values()));write(run/'history-calls.json',calls);write(run/'history-events.json',events)
 snapshots=sorted((run/'model-browser').glob('graph-*.json'),key=lambda p:int(p.stem.split('-')[1]));result=audit(json.loads(snapshots[-1].read_text())) if snapshots else {'passed':False,'checks':{'graph_snapshot':False}}
 usage=json.loads((run/'usage.json').read_text()) if (run/'usage.json').exists() else {}
 result.update(returncode=child.returncode,timed_out=timed_out,elapsed=time.time()-started)
 result['checks']['unchanged_runtime']=runtime_pin(REPO)==frozen
 result['checks']['unchanged_harness']=all(hashlib.sha256((WORK/name).read_bytes()).hexdigest()==h for name,h in pins.items())
 result['checks']['model_completed']=child.returncode==0 and not timed_out
 # Exact effective model identity is checked from the usage receipt, not intent.
 result['checks']['effective_subscription_model']=usage.get('provider')=='openai-codex' and usage.get('model')=='gpt-5.6-sol' and usage.get('completed') is True and usage.get('failed') is False and usage.get('api_calls',0)>0
 guard=json.loads((run/'auth-guard.json').read_text());result['checks']['auth_guard']=guard.get('installed') is True and guard.get('blocked_attempts')==0
 tool_calls=[json.loads(p.read_text()) for p in sorted((run/'model-browser').glob('call-*.json'),key=lambda p:int(p.stem.split('-')[1]))]
 operations={}
 for item in tool_calls:
  if item['name']=='node_target':operations[item['arguments']['operation_id']]=item['result']
 result['checks']['all_node_operations_resolved']=bool(operations) and all(r.get('status')=='SUCCEEDED' or r.get('effect_possible') is False for r in operations.values())
 result['checks']['system_identity_preserved']=bool(snapshots) and json.loads(snapshots[0].read_text()).get('system_nodes')==json.loads(snapshots[-1].read_text()).get('system_nodes')
 result['usage']=usage
 result['passed']=all(result['checks'].values());write(run/'audit.json',result);print(json.dumps({'run':str(run),'graph_audit':result['passed'],'returncode':child.returncode}),flush=True)
 # Auth stays private during the run and is removed afterwards.
 (home/'auth.json').unlink(missing_ok=True)
if __name__=='__main__':main()
