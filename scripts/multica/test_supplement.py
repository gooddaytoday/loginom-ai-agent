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

SCRIPT = Path(__file__).with_name('supplement.py')
ISSUE = '11111111-1111-4111-8111-111111111111'
TASK = '22222222-2222-4222-8222-222222222222'


class DeliveryTest(unittest.TestCase):
    script = SCRIPT
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / 'message').write_text('Continue the existing work')
        self.comments = []
        self.requests = {}
        self.calls = 0
        self.closed = False
        self.sender = ''
        self.last_parent = None
        self.drop = False
        self.wrong_target = False
        case = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, status, value):
                self.send_response(status)
                self.end_headers()
                self.wfile.write(json.dumps(value).encode())

            def do_GET(self):
                if self.path == f'/api/issues/{ISSUE}/task-runs':
                    return self.reply(200, [{'id': TASK, 'status': 'completed' if case.closed else 'running', 'trigger_comment_id': ISSUE}])
                if self.path != f'/api/issues/{ISSUE}/comments':
                    return self.reply(404, {})
                self.reply(200, case.comments)

            def do_POST(self):
                if self.path == f'/api/issues/{ISSUE}/comments/trigger-preview':
                    return self.reply(200, {'agents': []})
                if self.path == f'/api/issues/{ISSUE}/comments':
                    case.calls += 1
                    payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    case.last_parent = payload.get('parent_id')
                    if case.sender == TASK and case.last_parent != ISSUE:
                        return self.reply(409, {})
                    if not payload['content'].startswith('[@all](mention://all/all'):
                        return self.reply(400, {})
                    result = {'id': 'comment-1', 'content': payload['content']}
                    case.comments.append(result)
                    if case.drop:
                        case.drop = False
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                    return self.reply(200, result)
                if self.path != f'/api/issues/{ISSUE}/tasks/{TASK}/supplements':
                    return self.reply(404, {})
                case.calls += 1
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                key = payload['client_request_id']
                if key in case.requests:
                    return self.reply(200, case.requests[key])
                if case.closed:
                    return self.reply(409, {})
                result = {'id': 'comment-1', 'content': payload['content'], 'supplement_task_id': ISSUE if case.wrong_target else TASK, 'supplement_status': 'pending'}
                case.requests[key] = result
                case.comments.append(result)
                if case.drop:
                    case.drop = False
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                self.reply(200, result)

        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def run_client(self):
        return subprocess.run([sys.executable, str(self.script), '--issue', ISSUE, '--task', TASK,
            '--message', str(self.root / 'message'), '--receipt', str(self.root / 'receipt')],
            env=dict(os.environ, MULTICA_SERVER_URL=f'http://127.0.0.1:{self.server.server_port}', MULTICA_TOKEN='test-only', MULTICA_TASK_ID=self.sender), capture_output=True, text=True)

    def test_verified_retry_does_not_post(self):
        self.assertEqual(self.run_client().returncode, 0)
        self.assertEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 1)
        self.assertEqual((self.root / 'receipt').stat().st_mode & 0o777, 0o600)

    def test_lost_response_reuses_key_after_run_closed(self):
        self.drop = True
        self.assertNotEqual(self.run_client().returncode, 0)
        self.closed = True
        self.assertEqual(self.run_client().returncode, 0)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(len(self.comments), 1)

    def test_changed_text_rejected_before_post(self):
        self.assertEqual(self.run_client().returncode, 0)
        (self.root / 'message').write_text('Different instruction')
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 1)

    def test_finished_run_does_not_fallback(self):
        self.closed = True
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 1)
        self.assertEqual(self.comments, [])

    def test_wrong_target_is_not_accepted(self):
        self.wrong_target = True
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(json.loads((self.root / 'receipt').read_text())['state'], 'prepared')

    def test_readback_mismatch_is_not_success(self):
        self.assertEqual(self.run_client().returncode, 0)
        self.comments[0]['content'] = 'Changed'
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 1)


class AgentUpdateTest(unittest.TestCase):
    script = SCRIPT.with_name('update.py')
    setUp = DeliveryTest.setUp
    tearDown = DeliveryTest.tearDown
    run_client = DeliveryTest.run_client

    def test_lost_response_reconciles_without_repost(self):
        self.drop = True
        self.assertNotEqual(self.run_client().returncode, 0)
        self.closed = True
        self.assertEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 1)
        self.assertEqual(json.loads((self.root / 'receipt').read_text())['delivery'], 'pull_at_safe_boundary')

    def test_mentions_refused(self):
        (self.root / 'message').write_text('mention://agent/' + TASK)
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 0)

    def test_terminal_target_refused(self):
        self.closed = True
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 0)

    def test_same_issue_uses_sender_trigger_parent(self):
        self.sender = TASK
        self.assertEqual(self.run_client().returncode, 0)
        self.assertEqual(self.last_parent, ISSUE)

    def test_other_issue_does_not_borrow_recipient_parent(self):
        self.sender = ISSUE
        self.assertEqual(self.run_client().returncode, 0)
        self.assertIsNone(self.last_parent)

    def test_unknown_delivery_is_not_reposted(self):
        self.drop = True
        self.assertNotEqual(self.run_client().returncode, 0)
        self.comments.clear()
        self.assertNotEqual(self.run_client().returncode, 0)
        self.assertEqual(self.calls, 1)


if __name__ == '__main__':
    unittest.main()
