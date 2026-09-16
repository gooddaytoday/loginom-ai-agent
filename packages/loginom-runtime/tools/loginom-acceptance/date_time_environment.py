"""Local model-free environment identity used immediately before Hermes."""
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path
from preflight import runtime_pin

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(__file__).resolve().parent


def snapshot(args):
    from run import environment, connection
    connection(args.hermes_home)  # Existing subscription only; never persist tokens.
    dependencies = json.loads(subprocess.check_output([str(args.node), str(WORK/'runtime-check.mjs'), str(ROOT), str(args.browsers)], text=True, timeout=30))
    with tempfile.TemporaryDirectory(prefix='node13-version-') as tmp:
        p = Path(tmp)
        r = subprocess.run([str(args.hermes_python),str(WORK/'hermes_auth_guard.py'),str(args.hermes_source),str(p/'receipt.json'),'--version'],
            capture_output=True,text=True,timeout=30,env=environment({},p,p),check=True)
        if not re.search(r'(?<![0-9.])v?0\.21\.0(?![0-9.])',r.stdout):
            raise ValueError('Hermes version mismatch')
    files = {}
    for key in ('node','hermes_python','hermes'):
        path = getattr(args,key).resolve()
        files[key] = dict(path=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    return dict(dependencies=dependencies,executables=files,hermes_version='0.21.0',
        hermes_source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=args.hermes_source,text=True).strip(),
        model=dict(provider='openai-codex',model='gpt-5.6-sol',reasoning='low',fallback=False),
        runtime_source_pin=runtime_pin(ROOT),model_started=False)
