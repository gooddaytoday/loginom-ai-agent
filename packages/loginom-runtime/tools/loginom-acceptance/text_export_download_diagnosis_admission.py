"""Explicit diagnostic admission; ordinary acceptance gates remain untouched."""
import json,sys
from text_export_readiness import ROOT,WORK,MANIFEST,pinned,digest
ASSIGNMENT='node17:download-diagnosis:1:43a7d37f'
def admit(assignment):
    assert assignment==ASSIGNMENT
    m=json.loads(MANIFEST.read_text());d=json.loads(pinned(ROOT,m['diagnostic']['path'],m['diagnostic']['sha256']).read_text())
    assert m['runtime']==d['runtime'] and m['runtime_inputs']==d['runtime_inputs']
    assert m['handler_source']==d['handler_source']
    for n,h in m['runtime_inputs'].items():pinned(ROOT,n,h)
    required=set(d['harness_inputs'])|{p.name for p in WORK.iterdir() if p.suffix in ('.mjs','.py')}
    assert set(m['harness_inputs'])==required
    for n,h in m['harness_inputs'].items():pinned(WORK,n,h)
    pinned(WORK,'goals/text-export-node-complete.txt',m['goal_sha256'])
    assert m['full_goal']==dict(nodeops=22,deliveries=3,all_save_reopen_required=True)
    assert m['profile']=='user-v1' and m['account']=='test-2' and m['storage_directory']=='/test-2' and m['user_v1'] is None
    assert m['catalog']==dict(uri='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json',sha256='bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a')
    return dict(ready=True,purpose='download-diagnosis',assignment=assignment,manifest_sha256=digest(MANIFEST),product_replace_forbidden=True,full_goal_accepted=False)
if __name__=='__main__':print(json.dumps(admit(sys.argv[1])))
