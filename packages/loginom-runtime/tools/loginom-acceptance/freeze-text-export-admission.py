#!/usr/bin/env python3
"""Freeze current candidate harness against the explicitly accepted diagnostic report.
No browser or Hermes is launched. Adding real user-v1 evidence is a separate step.
"""
import json,hashlib
from pathlib import Path
from text_export_readiness import ROOT,WORK,MANIFEST
from preflight import runtime_pin

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if __name__=='__main__':
    report=ROOT/'docs/plans/loginom-dock/17-text-export-navigation-origin-fix.json';d=json.loads(report.read_text())
    candidate=runtime_pin(ROOT)
    previous=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    names=set(d['harness_inputs'])|{p.name for p in WORK.iterdir() if p.suffix in ('.py','.mjs')}
    harness={n:sha(WORK/n) for n in sorted(names)}
    value=dict(schema_version=1,goal_id='text-export-node-complete',profile='user-v1',account='test-2',storage_directory='/test-2',handler_source=d['handler_source'],runtime=candidate['client_revision'],runtime_inputs=candidate['inputs'],runtime_changes_since_diagnostic=sorted(n for n in set(candidate['inputs'])|set(d['runtime_inputs']) if candidate['inputs'].get(n)!=d['runtime_inputs'].get(n)),harness_inputs=harness,changed_since_diagnostic=sorted(n for n in d['harness_inputs'] if d['harness_inputs'][n]!=harness[n]),goal_sha256=sha(WORK/'goals/text-export-node-complete.txt'),full_goal=dict(nodeops=22,deliveries=3,all_save_reopen_required=True),catalog=dict(uri='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json',sha256='bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a'),diagnostic=dict(path=report.relative_to(ROOT).as_posix(),sha256=sha(report),run_directory='.dock/node17/native-observer-smoke/'+d['run_id']),user_v1=previous.get('user_v1'))
    latest=ROOT/'docs/plans/loginom-dock/17-text-export-download-diagnosis.json'
    value['observer_diagnostic']={'path':latest.relative_to(ROOT).as_posix(),'sha256':sha(latest)}
    MANIFEST.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(MANIFEST),'harness_inputs':len(harness),'changed_since_diagnostic':value['changed_since_diagnostic']}))
