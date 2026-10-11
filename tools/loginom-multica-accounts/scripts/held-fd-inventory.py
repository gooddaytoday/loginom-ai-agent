#!/usr/bin/env python3
"""Read-only privileged complete census for bounded bootstrap/migration guards."""
import hashlib,importlib.util,json,os
from pathlib import Path
import sys
def collect(request):
    if os.getuid()!=0 or os.geteuid()!=0: raise RuntimeError('CARD_PRIVILEGED_CENSUS_REQUIRED')
    path=Path(__file__).with_name('own-fd-inventory.py')
    spec=importlib.util.spec_from_file_location('card_full_inventory',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    namespaces={kind+'_namespace':os.readlink('/proc/self/ns/'+kind) for kind in ['pid','user']}
    if namespaces!=request['census_namespace'] or any(namespaces[kind+'_namespace']!=os.readlink(f'/proc/{request["guardian"]["pid"]}/ns/{kind}') for kind in ['pid','user']):
        raise RuntimeError('CARD_CENSUS_NAMESPACE_UNKNOWN')
    proof=module.collect(request)
    proof['privileged_census']={'wrapper_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'uid':0,'euid':0,**namespaces}
    return proof
if __name__=='__main__':
    try: print(json.dumps(collect(json.loads(Path(sys.argv[1]).read_bytes())),ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'status':'UNKNOWN','code':str(error) if isinstance(error,RuntimeError) else type(error).__name__}),file=sys.stderr);raise SystemExit(1)
