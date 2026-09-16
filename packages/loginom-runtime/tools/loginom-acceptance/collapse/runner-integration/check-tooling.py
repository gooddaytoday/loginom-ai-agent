import json,sys,hashlib
from pathlib import Path
P=Path(__file__).resolve().parent;W=P.parents[1];sys.path.insert(0,str(W))
import collapse_acceptance as a
from preflight import runtime_pin
m=json.loads((P/'harness-pins.json').read_text())
for p,h in m['inputs'].items():assert a.sha(W/p)==h,p
a.frozen();assert runtime_pin(a.ROOT)['client_revision']==a.RUNTIME
assert a.READONLY_PRODUCER == 'collapse_native_sessions_v1'
print(json.dumps(dict(status='TOOLING_PASS',runtime=a.RUNTIME,ready=a.admission(None)['ready'],model_started=False)))
