"""Versioned reassessment of unchanged evidence; never replaces the frozen run audit."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from duplicates_node_acceptance import audit, WORK, ROOT
from preflight import runtime_pin

CHANGED_VERIFIERS={'duplicates_node_acceptance.py','persisted_import_evidence.py'}
ADDED_VERIFIERS={'identity_import_evidence.py','test_identity_import_evidence.py','reassess_duplicates_identity.py'}

def digest(data):return hashlib.sha256(data).hexdigest()
def git_bytes(revision,path):
    return subprocess.check_output(['git','show',revision+':'+path],cwd=ROOT,stderr=subprocess.DEVNULL)

def reassess(directory,baseline_revision,baseline_path):
    # A committed baseline, not editable run metadata, anchors the old receipts.
    baseline=json.loads(git_bytes(baseline_revision,baseline_path))
    if baseline['run_id']!=directory.name:raise ValueError('baseline_run_identity')
    for name in ('request.json','scenario.txt','evidence.json','duplicates-node-audit.json','attempt.json'):
        if digest((directory/name).read_bytes())!=baseline['receipts'][str(directory/name)]:raise ValueError('immutable_receipt:'+name)
    request=json.loads((directory/'request.json').read_text()); evidence=json.loads((directory/'evidence.json').read_text())
    source_revision=baseline['source_commit']; old=request['harness_inputs']
    for name,sha in old.items():
        if not (WORK/name).resolve().is_relative_to(WORK):raise ValueError('execution_path')
        if digest(git_bytes(source_revision,'tools/loginom-acceptance/'+name))!=sha:raise ValueError('execution_harness_git:'+name)
        if name not in CHANGED_VERIFIERS and digest((WORK/name).read_bytes())!=sha:raise ValueError('unapproved_execution_change:'+name)
    for name,sha in request['runtime_source_pin']['inputs'].items():
        if digest(git_bytes(source_revision,name))!=sha:raise ValueError('execution_runtime_git:'+name)
    if runtime_pin(ROOT)!=request['runtime_source_pin']:raise ValueError('current_runtime_changed')
    if baseline['runtime']!=request['runtime_source_pin']['client_revision'] or baseline['goal']!=request['goal_sha256']:raise ValueError('baseline_pins')
    current={p.name for pattern in ('*.py','*.mjs') for p in WORK.glob(pattern)}
    old_modules={name for name in old if '/' not in name}
    if current-old_modules!=ADDED_VERIFIERS or old_modules-current:raise ValueError('verifier_inventory_boundary')
    inputs={name:digest((WORK/name).read_bytes()) for name in sorted(set(old)|ADDED_VERIFIERS)}
    result=audit(request,evidence,(directory/'scenario.txt').read_text())
    result['checks']['archived_execution_inputs']=dict(passed=True,source_commit=source_revision,harness_inputs=len(old),runtime_inputs=len(request['runtime_source_pin']['inputs']))
    result['checks']['current_runtime_pin']=dict(passed=True)
    result['checks']['verifier_change_boundary']=dict(passed=True,changed=sorted(CHANGED_VERIFIERS),added=sorted(ADDED_VERIFIERS))
    result['passed']=all(v['passed'] for v in result['checks'].values())
    result.update(scope='post_run_identity_import_verifier_reassessment',original_frozen_result='FAIL112/118',original_frozen_pass=False,execution_provenance=baseline,verifier=dict(version='identity-import-v1',inputs=inputs,sha256=digest(json.dumps(inputs,sort_keys=True,separators=(',',':')).encode())),baseline_receipt_commit=baseline_revision)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--baseline-commit',required=True);p.add_argument('--baseline-report',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    result=reassess(a.run_dir.resolve(),a.baseline_commit,a.baseline_report)
    with a.output.open('x') as f:f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(passed=result['passed'],checks=len(result['checks']),failures=[k for k,v in result['checks'].items() if not v['passed']],verifier_sha256=result['verifier']['sha256'])))
    raise SystemExit(0 if result['passed'] else 1)
