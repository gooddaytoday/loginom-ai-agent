"""Hash JSON with ECMAScript numeric spelling, independently of client code.

One local worker amortizes process startup across a whole evidence audit. It
loads only standard Node modules; input is the already-redacted local journal.
"""
import atexit
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading

_worker=None
_lock=threading.Lock()


def close_worker():
    global _worker
    if _worker is not None:
        worker,_worker=_worker,None
        try:
            worker.stdin.close();worker.wait(timeout=2)
        except (OSError,subprocess.TimeoutExpired):
            worker.terminate();worker.wait(timeout=2)


atexit.register(close_worker)


def javascript_digest(value):
    global _worker
    text=json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    with _lock:
        if _worker is None:
            bundled=Path.home()/'.loginom-dock/current/runtime/node'
            node=str(bundled) if bundled.is_file() else shutil.which('node')
            if not node:raise ValueError('ecmascript_json_runtime_missing')
            _worker=subprocess.Popen([node,str(Path(__file__).with_suffix('.mjs'))],stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',bufsize=1,
                env={'PATH':os.defpath})
        try:
            _worker.stdin.write(text+'\n');_worker.stdin.flush();digest=_worker.stdout.readline().strip()
        except (OSError,UnicodeError) as error:
            raise ValueError('ecmascript_json_digest_failed') from error
        if not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('ecmascript_json_digest_failed')
        return digest
