#!/usr/bin/env python3
"""Private privileged census wrapper; unchanged strict collector, no mutations."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

def collect(request):
    if os.getuid() != 0 or os.geteuid() != 0: raise RuntimeError('RETIRED_PRIVILEGED_CENSUS_REQUIRED')
    path = Path(__file__).with_name('own-fd-inventory.py')
    spec = importlib.util.spec_from_file_location('retired_full_inventory', path)
    inventory = importlib.util.module_from_spec(spec); spec.loader.exec_module(inventory)
    provenance = {'wrapper_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'uid': os.getuid(), 'euid': os.geteuid(),
        'pid_namespace': os.readlink('/proc/self/ns/pid'), 'user_namespace': os.readlink('/proc/self/ns/user')}
    for kind in ['pid','user']:
        if provenance[kind+'_namespace'] != os.readlink(f'/proc/{request["guardian"]["pid"]}/ns/{kind}'):
            raise RuntimeError('RETIRED_CENSUS_NAMESPACE_UNKNOWN')
    result = inventory.collect(request)
    result['privileged_census'] = provenance
    return result

if __name__ == '__main__':
    try: print(json.dumps(collect(json.loads(Path(sys.argv[1]).read_text())), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'status':'UNKNOWN','code':str(error) if isinstance(error,RuntimeError) else type(error).__name__}),file=sys.stderr)
        raise SystemExit(1)
