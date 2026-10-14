"""Replay captured comment/run metadata through loopback HTTP only."""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading


def replay(helper, fixture, output, wrong=False):
    posts = []
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            value = fixture['runs'] if self.path.endswith('/task-runs') else fixture['comments']
            self.send_response(200); self.end_headers()
            self.wfile.write(json.dumps(value).encode())
        def do_POST(self):
            posts.append(self.path); self.send_response(409); self.end_headers()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever); thread.start()
    try:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            body = fixture['comments'][0]['content']
            (root / 'message').write_text(body)
            receipt = fixture['wrong_receipt'] if wrong else fixture['receipt']
            before = json.dumps(receipt)
            (root / 'receipt').write_text(before)
            # Preserve the original identity URL for its hash; redirect every
            # production request to the closed fixture. Never use live tokens.
            wrapper = root / 'wrapper.py'
            wrapper.write_text('import sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(sys.argv[1]).parent))\nimport handoff\noriginal=handoff.request\nfixture=sys.argv[2]\nhandoff.request=lambda base,headers,path,*args,**kwargs: original(fixture,headers,path,*args,**kwargs)\nsys.argv=[sys.argv[1]]+sys.argv[3:]\nraise SystemExit(handoff.main())\n')
            identity = fixture['identity']
            result = subprocess.run([sys.executable, str(wrapper), str(helper),
                f'http://127.0.0.1:{server.server_port}', '--issue', identity['issue'],
                '--agent', identity['agent'], '--sha', identity['sha'], '--scope', identity['scope'],
                '--message', str(root / 'message'), '--receipt', str(root / 'receipt'),
                '--existing-comment', fixture['comments'][0]['id']], capture_output=True, text=True,
                env={**os.environ, 'MULTICA_SERVER_URL': fixture['base'], 'MULTICA_TOKEN': 'offline-only',
                    'MULTICA_WORKSPACE_ID': identity['issue']})
            record = json.loads((root / 'receipt').read_text())
            row = {'returncode': result.returncode, 'stderr': result.stderr, 'posts': posts,
                'before': receipt, 'after': record, 'receipt_bytes_unchanged': (root / 'receipt').read_text() == before,
                'original_body_sha256': hashlib.sha256(body.encode()).hexdigest(),
                'helper_sha256': hashlib.sha256(helper.read_bytes()).hexdigest(), 'platformMutation': False}
            output.write_text(json.dumps(row, indent=2)); return row
    finally:
        server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--helper', required=True); p.add_argument('--fixture', required=True)
    p.add_argument('--output', required=True); p.add_argument('--wrong-receipt', action='store_true')
    a = p.parse_args(); replay(Path(a.helper).resolve(), json.loads(Path(a.fixture).read_text()),
        Path(a.output), a.wrong_receipt)
