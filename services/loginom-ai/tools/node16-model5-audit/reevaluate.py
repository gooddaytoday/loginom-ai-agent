"""Versioned transport recovery of run5; original execution/export stay immutable."""
import copy,hashlib,importlib.util,json,re,sys
from pathlib import Path
ROOT=Path.cwd();WORK=ROOT/'tools/loginom-acceptance';sys.path.insert(0,str(WORK))
RUN_ID='20260914-004604-475bb0c8';VERSION='node16-model5-transport-v1'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def build(run):
 run=Path(run).resolve();req=json.loads((run/'request.json').read_text())
 if req['run_id']!=RUN_ID:raise ValueError('Exact run required')
 for name,digest in json.loads((run/'original-export-hashes.json').read_text()).items():
  if sha(run/name)!=digest:raise ValueError('Original export changed: '+name)
 for name,digest in req['harness_inputs'].items():
  if sha(WORK/name)!=digest:raise ValueError('Frozen harness changed: '+name)
 spec=importlib.util.spec_from_file_location('original_model5_auditor',WORK/'collapse_node_acceptance.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
 original_pairs=v.pairs;recoveries=[]
 def pairs(e):
  ps=original_pairs(e);out=[]
  for c,r in ps:
   value=r['result']
   if isinstance(value,dict):out.append((c,r));continue
   v.need(isinstance(value,str),'Unknown result transport')
   if value.startswith('[hermes note: this result is byte-identical'):
    match=re.match(r'\[hermes note: this result is byte-identical to the (\S+) result earlier this turn \(tool_call_id ([\w-]+)\)\. Refer to that result; it has not changed\. Args: (\{[^\n]+\})\]',value)
    v.need(match is not None,'Malformed duplicate reference')
    tool,provider,args=match.groups();v.need(tool==c['tool'] and json.loads(args)==c['arguments'],'Duplicate args/tool differ')
    oc,orr=v.one([(a,b) for a,b in out if a.get('provider_tool_call_id')==provider and a['session_id']==c['session_id'] and b['row']<c['row']],'Unique earlier duplicate result required')
    v.need(oc['tool']==c['tool'] and oc['arguments']==c['arguments'] and isinstance(orr['result'],dict),'Duplicate identity differs')
    value=copy.deepcopy(orr['result']);proof={'kind':'duplicate','tool_call_id':c['tool_call_id'],'original_tool_call_id':oc['tool_call_id']}
   elif value.startswith('<persisted-output>'):
    match=re.search(r'Full output saved to: ([^\n]+)',value);v.need(match is not None,'Spill path absent')
    p=Path(match.group(1));expected=run/'private/hermes-home/cache/spillover'/(c['provider_tool_call_id']+'.txt')
    v.need(p==expected and not p.is_symlink() and p.resolve().parent==expected.parent.resolve(),'Foreign spill path')
    raw=p.read_text();count=re.search(r'\(([\d,]+) characters,',value);v.need(count is not None and len(raw)==int(count.group(1).replace(',','')),'Spill length differs')
    preview=value.split('Preview (first 1500 chars):\n',1);v.need(len(preview)==2 and preview[1]==raw[:1500]+'\n...\n</persisted-output>','Spill preview differs')
    value=v.unwrap(raw);v.need(isinstance(value,dict) and value.get('operation_id')==c['arguments']['operation_id'],'Spill operation differs')
    proof={'kind':'spill','tool_call_id':c['tool_call_id'],'path':str(p),'sha256':sha(p),'characters':len(raw)}
   else:raise ValueError('Unrecognized non-object tool response')
   recoveries.append(proof);out.append((c,{**r,'result':value,'transport_recovered':proof}))
  return out
 # Raw resume refusal is authoritative; the operator wire reports absent outcome.
 loss_path=WORK/'collapse/native-gates/verify_loss.py'
 sys.path.insert(0,str(loss_path.parent))
 loss_spec=importlib.util.spec_from_file_location('verify_loss',loss_path)
 loss=importlib.util.module_from_spec(loss_spec)
 text=loss_path.read_text();old="'unresolved phase' not in replay['resumed']['error']"
 if text.count(old)!=1:raise ValueError('Unexpected original loss verifier')
 text=text.replace(old,"replay['resumed']!={'error':'Public node outcome absent'}")
 exec(compile(text,str(loss_path),'exec'),loss.__dict__)
 sys.modules['verify_loss']=loss
 v.pairs=pairs;v.transport_recoveries=recoveries
 return v

def report(run,independent=None):
 run=Path(run);v=build(run);req=json.loads((run/'request.json').read_text());e=json.loads((run/'evidence.json').read_text())
 result=v.audit(req,e,(run/'scenario.txt').read_text(),independent)
 unique={json.dumps(x,sort_keys=True):x for x in v.transport_recoveries}
 return dict(verifier_version=VERSION,verifier_sha256=sha(__file__),original_export_preserved=True,original_harness_unchanged=True,run_id=RUN_ID,loss_verifier_delta='Operator helper absent-outcome text checked exactly; original native NODE_WORKER_REJECTED/unresolved-phase proof and all no-work checks retained',recovered_transports=list(unique.values()),result=result)
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--independent',type=Path);a=p.parse_args()
 r=report(a.run,json.loads(a.independent.read_text()) if a.independent else None);a.output.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False))
