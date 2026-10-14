"""Offline HTTP/process reconciliation controls; no platform/model calls."""
import hashlib
import json
import unittest
import test_handoff
from test_handoff import ISSUE, AGENT, SENDER, TASK, COMMENT

RELEASE = '77777777-7777-4777-8777-777777777777'

class AdoptionIdentityTest(unittest.TestCase):
    setUp = test_handoff.HandoffTest.setUp
    tearDown = test_handoff.HandoffTest.tearDown
    client = test_handoff.HandoffTest.client
    def original(self, legacy=False):
        key = hashlib.sha256(json.dumps([f'http://127.0.0.1:{self.server.server_port}', ISSUE,
            AGENT, 'a' * 40, 'capture-receiving']).encode()).hexdigest()
        text = (f'[@Receiver](mention://agent/{AGENT})\nHandoff-ID: {key}\n'
            f'Source-SHA: {"a" * 40}\nAction: capture-receiving\n\nExact original instruction.')
        if legacy:
            text = f'[@Receiver](mention://agent/{AGENT}) Original {"a" * 40}\nArtifact-handoff: ' + json.dumps([{'handoff': key, 'sha': 'a' * 40}])
        (self.root / 'message').write_text(text)
        self.comments = [{'id': COMMENT, 'content': text, 'issue_id': ISSUE, 'author_type': 'agent',
            'author_id': SENDER, 'source_task_id': SENDER}]
        self.runs = [{'id': SENDER, 'agent_id': SENDER, 'issue_id': ISSUE, 'status': 'completed'},
            {'id': TASK, 'agent_id': AGENT, 'issue_id': ISSUE, 'status': 'completed', 'trigger_comment_id': COMMENT}]
        return key, text

    def release(self, key):
        self.comments.append({'id': RELEASE, 'content': f'Bounded result.\n\nArtifact-release: {"b" * 64}\nHandoff-ID: {key}',
            'issue_id': ISSUE, 'author_type': 'agent', 'author_id': AGENT, 'source_task_id': TASK})

    def test_release_marker_does_not_replace_canonical_assignment(self):
        key, text = self.original(); self.release(key)
        result = self.client(existing=COMMENT); self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads((self.root / 'receipt').read_text())
        self.assertEqual(receipt['comment'], COMMENT)
        self.assertEqual(receipt['comment_fingerprint'], hashlib.sha256(text.encode()).hexdigest())
        self.assertEqual(receipt['sender_task'], SENDER); self.assertEqual(self.posts, 0)

    def test_legacy_exact_body_and_prepared_fingerprint_reconcile_without_edit(self):
        key, text = self.original(legacy=True); self.release(key)
        wrapped = f'[@Исполнитель](mention://agent/{AGENT})\nHandoff-ID: {key}\nSource-SHA: {"a" * 40}\nAction: capture-receiving\n\n{text}'
        fingerprint = hashlib.sha256(wrapped.encode()).hexdigest()
        (self.root / 'receipt').write_text(json.dumps({'key': key, 'fingerprint': fingerprint,
            'issue': ISSUE, 'agent': AGENT, 'state': 'prepared'}))
        result = self.client(existing=COMMENT); self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.root / 'receipt').read_text())['fingerprint'], fingerprint)
        self.assertEqual(self.posts, 0)

    def test_duplicate_original_body_is_ambiguous(self):
        self.original(); self.comments.append({**self.comments[0], 'id': RELEASE})
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_release_author_mismatch_refuses(self):
        key, _ = self.original(); self.release(key); self.comments[-1]['author_id'] = SENDER
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_release_wrong_run_issue_refuses(self):
        key, _ = self.original(); self.release(key); self.runs[-1]['issue_id'] = AGENT
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_original_sender_mismatch_refuses(self):
        self.original(); self.runs[0]['agent_id'] = AGENT
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_body_mismatch_cannot_relabel(self):
        self.original(); self.comments[0]['content'] += '\nchanged'
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_unlinked_marker_cannot_be_skipped(self):
        key, _ = self.original(); self.comments.append({'id': RELEASE, 'content': f'Handoff-ID: {key}'})
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_wrong_prepared_fingerprint_is_preserved(self):
        key, _ = self.original()
        prior = json.dumps({'key': key, 'fingerprint': '0' * 64, 'issue': ISSUE, 'agent': AGENT, 'state': 'prepared'})
        (self.root / 'receipt').write_text(prior)
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0)
        self.assertEqual((self.root / 'receipt').read_text(), prior); self.assertEqual(self.posts, 0)

    def test_header_scope_mismatch_refuses(self):
        self.original()
        text = self.comments[0]['content'].replace('Action: capture-receiving', 'Action: different-scope')
        self.comments[0]['content'] = text
        (self.root / 'message').write_text(text)
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_release_only_first_block_is_not_assignment(self):
        key, _ = self.original(); self.release(key)
        self.comments[-1]['content'] = f'Artifact-release: {"b" * 64}\nHandoff-ID: {key}'
        result = self.client(existing=COMMENT); self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.posts, 0)

    def test_conflicting_headers_cannot_hide_as_release(self):
        key, _ = self.original(); self.release(key)
        self.comments[-1]['content'] = (f'[@Receiver](mention://agent/{AGENT})\nHandoff-ID: {key}\n'
            f'Source-SHA: {"a" * 40}\nAction: different-scope\n\nArtifact-release: {"b" * 64}')
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_duplicate_descriptor_bound_legacy_original_refuses(self):
        self.original(legacy=True)
        self.comments.append({**self.comments[0], 'id': RELEASE})
        result = self.client(existing=COMMENT)
        self.assertNotEqual(result.returncode, 0); self.assertEqual(self.posts, 0)
        self.assertEqual(json.loads((self.root / 'receipt').read_text())['state'], 'prepared')

    def test_foreign_header_cannot_hide_behind_legacy_descriptors(self):
        self.original(legacy=True)
        text = 'Handoff-ID: ' + '0' * 64 + '\nSource-SHA: ' + 'c' * 40 + '\nAction: foreign-action\n\n' + self.comments[0]['content']
        self.comments[0]['content'] = text; (self.root / 'message').write_text(text)
        result = self.client(existing=COMMENT)
        self.assertNotEqual(result.returncode, 0); self.assertEqual(self.posts, 0)
        self.assertEqual(json.loads((self.root / 'receipt').read_text())['state'], 'prepared')

    def test_duplicate_legacy_header_fields_refuse(self):
        key, text = self.original(legacy=True)
        text = f'Source-SHA: {"a" * 40}\nSource-SHA: {"a" * 40}\n\n' + text
        self.comments[0]['content'] = text; (self.root / 'message').write_text(text)
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_descriptor_bound_receiver_release_requires_run_linkage(self):
        key, _ = self.original(legacy=True); self.release(key)
        self.comments[-1]['content'] += '\nArtifact-handoff: ' + json.dumps([{'handoff': key, 'sha': 'a' * 40}])
        result = self.client(existing=COMMENT); self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.posts, 0)

    def test_descriptor_bound_unlinked_release_refuses(self):
        key, _ = self.original(legacy=True); self.release(key)
        self.comments[-1]['content'] += '\nArtifact-handoff: ' + json.dumps([{'handoff': key, 'sha': 'a' * 40}])
        self.runs[-1]['trigger_comment_id'] = RELEASE
        self.assertNotEqual(self.client(existing=COMMENT).returncode, 0); self.assertEqual(self.posts, 0)

    def test_canonical_malformed_duplicate_fields_refuse_before_selection(self):
        for field, value in [('Source-SHA', 'c' * 39), ('Handoff-ID', 'D' * 64),
                             ('Action', ''), ('Source-SHA', 'a' * 40)]:
            with self.subTest(field=field, value=value):
                self.original()
                body = self.comments[0]['content'].replace('\n\n', f'\n{field}: {value}\n\n', 1)
                self.comments[0]['content'] = body
                (self.root / 'message').write_text(body)
                # Each control owns its synthetic prepared receipt; preserve it.
                (self.root / 'receipt').unlink(missing_ok=True)
                result = self.client(existing=COMMENT)
                self.assertNotEqual(result.returncode, 0)
                receipt = json.loads((self.root / 'receipt').read_text())
                self.assertEqual(receipt['state'], 'prepared')
                self.assertNotIn('comment', receipt)
                self.assertNotIn('source_sha', receipt)
                self.assertEqual(self.posts, 0)
