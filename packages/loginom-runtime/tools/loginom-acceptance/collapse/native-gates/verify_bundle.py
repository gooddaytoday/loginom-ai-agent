"""Recompute ten independent native sessions and loss from original evidence."""
import json
from pathlib import Path
from verify_reopened import check as fresh_check
from verify_loss import check as loss_check
from export_live import export
from collapse_node_acceptance import EXPECTED

KIND='collapse_native_sessions_v1'
def check(bundle, *, expected_runtime=None):
 if bundle.get('kind')!=KIND or bundle.get('origin')!='independent_codex_session' or set(bundle.get('sessions',{}))!=set(EXPECTED):raise ValueError('all ten native sessions required')
 results={};documents=set();sessions=set()
 for key,directory in bundle['sessions'].items():
  spec=json.loads((Path(directory)/'readonly-specification.json').read_text())
  if spec['case']!=key or spec['run_id']!=bundle['run_id']:raise ValueError('fresh case/run differs')
  result=fresh_check(directory,expected_runtime=expected_runtime)
  if result['document_id'] in documents or result['session_id'] in sessions:raise ValueError('fresh session reused across cases')
  documents.add(result['document_id']);sessions.add(result['session_id']);results[key]=result
 loss=loss_check(bundle['loss_session'],expected_runtime=expected_runtime)
 return dict(scope='Codex native diagnostics only',kind=KIND,cases=results,cells=sum(r['cells'] for r in results.values()),
             readonly_bytes_settings_topology=True,loss=loss,model_run=False,hermes_acceptance=False,subplan_complete=False)

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('bundle');p.add_argument('--output',required=True);a=p.parse_args()
 result=check(json.loads(Path(a.bundle).read_text()));Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'cases':len(result['cases']),'cells':result['cells'],'loss':result['loss']['status'],'hermes_acceptance':False}))
