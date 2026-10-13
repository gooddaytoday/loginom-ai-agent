import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest

ISSUE = '11111111-1111-4111-8111-111111111111'


class CheckpointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.card = dict(id=ISSUE, revision=7, description='old', status='in_progress', assignee_id=ISSUE)
        self.puts = 0
        self.drop = self.conflict = self.denied = self.superseded = False
        self.unexpected = []
        case = self
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def reply(self, code, data):
                self.send_response(code); self.end_headers(); self.wfile.write(json.dumps(data).encode())
            def do_GET(self):
                if self.path != '/api/issues/' + ISSUE:
                    case.unexpected.append(self.path)
                    return self.reply(404, {})
                self.reply(200, case.card)
            def do_PUT(self):
                case.puts += 1
                data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                case.assertEqual(set(data), {'description', 'expected_revision'})
                if case.denied: return self.reply(403, {})
                if case.conflict: case.card.update(revision=8, description='other writer')
                if data['expected_revision'] != case.card['revision']: return self.reply(409, {})
                case.card.update(description=data['description'], revision=8)
                if case.superseded: case.card.update(description='newer writer', revision=9)
                if case.drop:
                    self.connection.shutdown(socket.SHUT_RDWR); self.connection.close(); return
                self.reply(200, case.card)
            def do_POST(self):
                case.unexpected.append(self.path); self.reply(500, {})
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever); self.thread.start()
        self.env = dict(os.environ, MULTICA_SERVER_URL=f'http://127.0.0.1:{self.server.server_port}', MULTICA_TOKEN='mat_fixture')
        (self.root / 'draft').write_text('current checkpoint\n')
    def tearDown(self):
        self.server.shutdown(); self.thread.join(); self.server.server_close(); self.tmp.cleanup()
    def run_cli(self):
        return subprocess.run([sys.executable, str(Path(__file__).with_name('checkpoint.py')), '--issue', ISSUE, '--revision', '7', '--checkpoint', str(self.root/'draft'), '--receipt', str(self.root/'receipt')], env=self.env, text=True, capture_output=True)
    def test_success_exact_readback_no_dispatch(self):
        self.assertEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.card['description'], 'current checkpoint\n')
        self.assertEqual(self.card['status'], 'in_progress'); self.assertEqual(self.card['assignee_id'], ISSUE)
        self.assertEqual(self.run_cli().returncode, 0); self.assertEqual(self.puts, 1); self.assertEqual(self.unexpected, [])
    def test_racing_revision_preserves_other_writer(self):
        self.conflict = True
        self.assertNotEqual(self.run_cli().returncode, 0); self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.puts, 1); self.assertEqual(self.card['description'], 'other writer')
    def test_stale_revision_never_writes(self):
        self.card['revision'] = 8
        self.assertNotEqual(self.run_cli().returncode, 0); self.assertEqual(self.puts, 0)
    def test_lost_response_reconciles_without_retry(self):
        self.drop = True
        self.assertEqual(self.run_cli().returncode, 0); self.assertEqual(self.run_cli().returncode, 0); self.assertEqual(self.puts, 1)
    def test_superseded_unknown_never_overwrites(self):
        self.drop = self.superseded = True
        self.assertNotEqual(self.run_cli().returncode, 0); self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.puts, 1); self.assertEqual(self.card['description'], 'newer writer')
    def test_denied_keeps_draft_no_owner_fallback(self):
        self.denied = True
        self.assertNotEqual(self.run_cli().returncode, 0); self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.puts, 1); self.assertEqual(self.card['description'], 'old'); self.assertTrue((self.root/'draft').exists())
    def test_long_checkpoint_rejected(self):
        (self.root/'draft').write_text('line\n'*21)
        self.assertNotEqual(self.run_cli().returncode, 0); self.assertEqual(self.puts, 0)

if __name__ == '__main__': unittest.main()
