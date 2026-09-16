#!/usr/bin/env python3
"""Audit the real user-v1 stdio preflight without promoting it to full-goal PASS."""
import json,hashlib,importlib.util,sys,copy
from pathlib import Path
from text_export_user_v1_evidence import verify_component_wire,wire_evidence
from user_result_evidence import normalize_user_evidence
from text_export_readiness import ROOT,WORK

def audit(r):
    projection=verify_component_wire(r)
    from text_export_account_evidence import verify_account
    account=verify_account(r);assert account['passed']
    spec=importlib.util.spec_from_file_location('native',WORK/'audit-native-text-export-observer.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    native=module.native_audit(r,projection['replace_request']);assert native['passed']
    raw=wire_evidence(r);negatives=[]
    for kind in ['wrong_public_hash','wrong_public_error','wrong_public_workflow','wrong_public_profile','missing_response']:
        e=copy.deepcopy(raw)
        target=next(t for t in e['tools'] if t['tool'].endswith('dock_node_wait') and t['result'].get('operation_id')=='smoke-original' and t['result'].get('state')=='settled')
        if kind=='wrong_public_hash':target['result']['output']['file_artifacts'][0]['sha256']='0'*64
        elif kind=='wrong_public_error':next(t for t in e['tools'] if t['result'].get('operation_id')=='smoke-reject' and t['result'].get('state')=='settled')['result']['error']['message']='forged'
        elif kind=='wrong_public_workflow':next(c for c in e['calls'] if c['tool'].endswith('dock_node_apply'))['arguments']['workflow_ref']['workflow_id']='foreign'
        elif kind=='wrong_public_profile':target['result']['result_version']='foreign'
        elif kind=='missing_response':e['tools'].remove(target)
        assert not normalize_user_evidence(e)[1]['passed'],kind;negatives.append(kind)
    paths=['request.json','one-smoke-marker.json','preparation.json','entry-launch.json','geometry.json','account-probe.json','account-probe-prepared.json','smoke-source.json','smoke-original.json','smoke-reject.json','smoke-replace.json','replace-body.json','public-wire.jsonl','observer/observer.jsonl','observer/observer-actions.jsonl','observer/actual-dispatch.jsonl','session-close.json','process-close-check.json']
    sessions=list((r/'private/dock-state/sessions').iterdir());assert len(sessions)==1;s=sessions[0]
    paths += [str((s/n).relative_to(r)) for n in ['session.json','execution-events.jsonl','playwright.json']]
    paths += [str(p.relative_to(r)) for p in (r/'observer/reject-baseline').rglob('*') if p.is_file()]
    close=json.loads((r/'session-close.json').read_text());assert close['global_config_unchanged'] is True
    assert json.loads((r/'process-close-check.json').read_text())['closed'] is True
    return dict(passed=True,result_profile='user-v1',scope='real_stdio_user_v1_component_only',account=account,projection=projection,native=native,public_projection_negatives=negatives,full_goal_accepted=False,hermes_started=False,evidence_sha256={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths})
if __name__=='__main__':
    r=Path(sys.argv[1]).resolve()
    try:result=audit(r)
    except Exception as e:result=dict(passed=False,reason=type(e).__name__+': '+str(e))
    with (r/'user-v1-audit.json').open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
    print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if result['passed'] else 1)
