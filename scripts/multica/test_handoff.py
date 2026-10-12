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
AGENT = '22222222-2222-4222-8222-222222222222'
TASK = '33333333-3333-4333-8333-333333333333'
SENDER = '44444444-4444-4444-8444-444444444444'
PARENT = '55555555-5555-4555-8555-555555555555'
COMMENT = '66666666-6666-4666-8666-666666666666'


class HandoffTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        (self.root / 'message').write_text('Integrate the accepted source patch; preserve runtime guards.')
        self.comments = []
        self.runs = []
        self.posts = 0
        self.outcome = 'queued'
        self.drop = False
        self.store_drop = True
        self.finish_on_preview = False
        self.no_projection = False
        self.block_preview = False
        self.truncated = False
        self.sender = ''
        self.parent = None
        self.artifact = None
        case = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, value):
                self.send_response(200)
                if case.truncated:
                    self.send_header('X-Comments-Truncated', 'true')
                self.end_headers()
                self.wfile.write(json.dumps(value).encode())

            def do_GET(self):
                if self.path == '/api/issues':
                    return self.reply([{'id': ISSUE, 'status': 'in_progress', 'description': ''}])
                if self.path.endswith('/task-runs'):
                    sender = [{'id': SENDER, 'status': 'running', 'trigger_comment_id': PARENT}] if case.sender == SENDER else []
                    return self.reply(case.runs + sender)
                self.reply(case.comments)

            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if self.path.endswith('/trigger-preview'):
                    if case.finish_on_preview:
                        for r in case.runs:
                            r['status'] = 'completed'
                    return self.reply({'agents': [] if case.block_preview else [{'id': AGENT}],
                                       'blocked': [{'target_id': AGENT}] if case.block_preview else []})
                case.posts += 1
                case.parent = payload.get('parent_id')
                result = {'id': COMMENT, 'content': payload['content'], 'trigger_outcomes': [
                    {'target_type': 'agent', 'target_id': AGENT, 'status': case.outcome}]}
                if not case.drop or case.store_drop:
                    case.comments.append(result)
                    if case.outcome != 'blocked' and not case.no_projection:
                        if case.outcome in ('coalesced', 'deferred') and case.runs:
                            case.runs[-1]['delivered_comment_ids'].append(result['id'])
                        else:
                            case.runs.append({'id': TASK, 'agent_id': AGENT, 'status': 'queued',
                                              'trigger_comment_id': result['id'], 'delivered_comment_ids': [result['id']]})
                if case.drop:
                    case.drop = False
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                self.reply(result)

        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def client(self, receipt='receipt', sha='a' * 40, existing=None, product=None):
        return subprocess.run([sys.executable, str(Path(__file__).with_name('handoff.py')),
            '--issue', ISSUE, '--agent', AGENT, '--sha', sha, '--scope', 'capture-receiving',
            '--message', str(self.root / 'message'), '--receipt', str(self.root / receipt)] +
            (['--existing-comment', existing] if existing else []) +
            (['--artifact', self.artifact, '--artifact-owner', SENDER, '--artifact-state-root', str(self.root / 'state')] if self.artifact else []) +
            (['--product-sha', product] if product else []),
            env=dict(os.environ, MULTICA_SERVER_URL=f'http://127.0.0.1:{self.server.server_port}',
                     MULTICA_TOKEN='test-only', MULTICA_TASK_ID=self.sender, MULTICA_WORKSPACE_ID=ISSUE), capture_output=True, text=True)

    def attach_artifact(self):
        from test_artifacts import ArtifactsTest
        fixture = ArtifactsTest('test_complete_payload_is_registered_and_identity_is_stable')
        fixture.setUp()
        self.addCleanup(fixture.tearDown)
        # Use real CLI allocation/registration, with the same server identity
        # as the HTTP fixture rather than mocking the artifact implementation.
        fixture.state = self.root / 'state'
        fixture.environment['MULTICA_SERVER_URL'] = f'http://127.0.0.1:{self.server.server_port}'
        fixture.owner = SENDER
        fixture.workspace = ISSUE
        path = fixture.build()
        self.artifact = fixture.register(path)['id']
        return fixture, path

    def test_artifact_pin_survives_lost_dispatch_response(self):
        fixture, path = self.attach_artifact()
        self.drop = True
        self.assertNotEqual(self.client().returncode, 0)
        catalog = json.loads((fixture.state / ISSUE / SENDER / 'catalog.json').read_text())
        pin = next(iter(catalog['records'][self.artifact]['pins']))
        self.assertIn('Artifact-handoff:', self.comments[0]['content'])
        self.assertTrue(path.exists())
        self.assertEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 1)
        self.assertIn(pin, json.loads((fixture.state / ISSUE / SENDER / 'catalog.json').read_text())['records'][self.artifact]['pins'])

    def test_release_needs_completed_receiver_and_its_explicit_result(self):
        fixture, path = self.attach_artifact()
        self.assertEqual(self.client().returncode, 0)
        receipt = json.loads((self.root / 'receipt').read_text())
        result_id = '77777777-7777-4777-8777-777777777777'
        self.comments.append({'id': result_id, 'author_type': 'agent', 'author_id': AGENT,
            'source_task_id': TASK, 'content': f'Artifact-release: {self.artifact}\nHandoff-ID: {receipt["key"]}'})
        args = ('release', '--id', self.artifact, '--handoff', receipt['key'], '--result-comment', result_id)
        self.assertNotEqual(fixture.cli(*args).returncode, 0)
        self.runs[0]['status'] = 'completed'
        self.comments[-1]['author_id'] = SENDER
        self.assertNotEqual(fixture.cli(*args).returncode, 0)
        self.comments[-1]['author_id'] = AGENT
        self.assertEqual(fixture.cli(*args).returncode, 0)
        self.assertEqual(fixture.cli(*args).returncode, 0)
        self.assertTrue(path.exists())

    def test_checker_sha_requires_explicit_unchanged_product_identity(self):
        fixture, path = self.attach_artifact()
        self.assertNotEqual(self.client(sha='c' * 40).returncode, 0)
        self.assertEqual(self.posts, 0)
        self.assertEqual(self.client(sha='c' * 40, product='a' * 40).returncode, 0)
        self.assertIn('Product-SHA: ' + 'a' * 40, self.comments[0]['content'])
        self.assertIn('Source-SHA: ' + 'c' * 40, self.comments[0]['content'])
        self.assertTrue(path.exists())

    def test_historical_build_requires_exact_manifest_and_completed_positive_verdict(self):
        fixture, path = self.attach_artifact()
        record = json.loads((fixture.state / ISSUE / SENDER / 'catalog.json').read_text())['records'][self.artifact]
        result_id = '77777777-7777-4777-8777-777777777777'
        import datetime
        old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)).isoformat()
        self.runs = [{'id': TASK, 'status': 'completed', 'agent_id': AGENT}]
        self.comments = [{'id': result_id, 'author_type': 'agent', 'author_id': AGENT,
            'source_task_id': TASK, 'content': 'SOURCE/INSTALLED OFFLINE PASS ' + 'a' * 40,
            'created_at': old}]
        fixture.successful('protect', '--id', self.artifact, '--add', 'legacy-unreconciled')
        proof = {k: record[k] for k in ('owner', 'workspace', 'issue', 'path')}
        proof.update(all_consumers_released=True, unresolved=False, evidence=['completed exact review'],
            manifest_sha256='f' * 64, historical_release={'issue': ISSUE, 'comment': result_id,
                'task': TASK, 'reviewed_no_consumers': True})
        file = self.root / 'legacy-proof.json'
        file.write_text(json.dumps(proof))
        args = ('protect', '--id', self.artifact, '--remove', 'legacy-unreconciled', '--confirmation', str(file))
        self.assertNotEqual(fixture.cli(*args).returncode, 0)
        proof['manifest_sha256'] = record['build']['manifest_sha256']
        file.write_text(json.dumps(proof))
        self.successful_artifact = fixture.successful(*args)
        fixture.successful('retire', '--id', self.artifact, '--reason', 'superseded completed stage')
        updated = json.loads((fixture.state / ISSUE / SENDER / 'catalog.json').read_text())['records'][self.artifact]
        self.assertEqual(updated['retired_at'], datetime.datetime.fromisoformat(old).timestamp())
        self.assertTrue(path.exists())

    def test_finished_receiver_still_creates_durable_new_work(self):
        self.runs = [{'id': SENDER, 'agent_id': AGENT, 'status': 'running', 'trigger_comment_id': 'old', 'delivered_comment_ids': []}]
        self.finish_on_preview = True
        self.assertEqual(self.client().returncode, 0)
        self.assertEqual(self.runs[0]['status'], 'completed')
        self.assertEqual(self.runs[1]['status'], 'queued')
        self.assertEqual(json.loads((self.root / 'receipt').read_text())['delivery'], 'durable_assignment')

    def test_retry_with_new_receipt_and_sender_does_not_duplicate(self):
        self.assertEqual(self.client().returncode, 0)
        self.sender = SENDER
        self.assertEqual(self.client('other-receipt').returncode, 0)
        self.assertEqual(self.posts, 1)
        self.assertEqual((self.root / 'receipt').stat().st_mode & 0o777, 0o600)

    def test_lost_response_after_dispatch_and_completion_reconciles(self):
        self.drop = True
        self.assertNotEqual(self.client().returncode, 0)
        self.runs[0]['status'] = 'completed'
        self.assertEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 1)

    def test_unknown_response_without_comment_never_reposts(self):
        self.drop, self.store_drop = True, False
        self.assertNotEqual(self.client().returncode, 0)
        retry = self.client()
        self.assertNotEqual(retry.returncode, 0)
        self.assertIn('Unknown POST outcome', retry.stderr)
        self.assertNotIn('test-only', retry.stderr)
        self.assertEqual(self.posts, 1)

    def test_blocked_post_is_not_assignment(self):
        self.outcome = 'blocked'
        self.assertNotEqual(self.client().returncode, 0)
        self.assertNotEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 1)

    def test_blocked_preview_sends_nothing(self):
        self.block_preview = True
        self.assertNotEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 0)

    def test_projection_required_and_exact_retry_only_reads(self):
        self.no_projection = True
        self.assertNotEqual(self.client().returncode, 0)
        self.runs = [{'id': TASK, 'agent_id': AGENT, 'status': 'queued', 'trigger_comment_id': COMMENT}]
        self.assertEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 1)

    def test_coalesced_and_deferred_confirm_real_link(self):
        self.outcome = 'deferred'
        self.runs = [{'id': TASK, 'agent_id': AGENT, 'status': 'running', 'trigger_comment_id': 'old', 'delivered_comment_ids': []}]
        self.assertEqual(self.client().returncode, 0)
        self.assertIn(COMMENT, self.runs[0]['delivered_comment_ids'])

    def test_cancelled_assignment_is_not_automatically_replaced(self):
        self.assertEqual(self.client().returncode, 0)
        self.runs[0]['status'] = 'cancelled'
        self.assertNotEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 1)

    def test_same_key_conflicting_text_is_refused(self):
        self.assertEqual(self.client().returncode, 0)
        (self.root / 'message').write_text('Different work with the same identity')
        self.assertNotEqual(self.client('other-receipt').returncode, 0)
        self.assertEqual(self.posts, 1)

    def test_new_sha_is_new_action(self):
        self.assertEqual(self.client().returncode, 0)
        self.assertEqual(self.client('new-receipt', sha='b' * 40).returncode, 0)
        self.assertEqual(self.posts, 2)

    def test_sender_reply_parent_only(self):
        self.sender = SENDER
        self.assertEqual(self.client().returncode, 0)
        self.assertEqual(self.parent, PARENT)

    def test_mentions_cannot_add_another_recipient(self):
        (self.root / 'message').write_text('mention://all/all')
        self.assertNotEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 0)

    def test_adopt_existing_assignment_without_post(self):
        text = '[@Receiver](mention://agent/' + AGENT + ') Source ' + 'a' * 40
        (self.root / 'message').write_text(text)
        self.comments = [{'id': COMMENT, 'content': text}]
        self.runs = [{'id': TASK, 'agent_id': AGENT, 'status': 'running', 'trigger_comment_id': COMMENT}]
        self.assertEqual(self.client(existing=COMMENT).returncode, 0)
        self.assertEqual(self.posts, 0)

    def test_adoption_cannot_relabel_wrong_source(self):
        text = '[@Receiver](mention://agent/' + AGENT + ') Source ' + 'b' * 40
        (self.root / 'message').write_text(text)
        self.comments = [{'id': COMMENT, 'content': text}]
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0)
        self.assertEqual(self.posts, 0)

    def test_truncated_history_cannot_hide_a_duplicate(self):
        self.truncated = True
        self.assertNotEqual(self.client().returncode, 0)
        self.assertEqual(self.posts, 0)
