"""Knowledge provenance fixtures are synthetic, never live acceptance evidence."""
import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import audit
import evidence
from test_lost_receipt import lost_fixture


def fixture():
    request, data, prompt = lost_fixture()
    request['require_knowledge_recovery'] = True
    for item in data['calls'] + data['tools']:
        if item['row'] > 4:
            item['row'] += 20
    for n, root in enumerate(audit.SOURCE_ROOTS):
        uri = root + '/workflow/ports.md'
        for offset, tool, args, result in [
            (0, 'find', {'query': 'ports recovery', 'target_uri': root, 'read_content': False}, {'resources': [{'uri': uri}]}),
            (2, 'read', {'uris': uri}, 'Source fixture: existing input ports must be inspected before linking. ' * 3)]:
            row = 5 + n * 4 + offset
            common = {'session_id': 'hermes-fixture', 'tool_call_id': f'knowledge-{row}', 'tool': audit.PREFIX + tool}
            data['calls'].append({**common, 'row': row, 'arguments': args})
            data['tools'].append({**common, 'row': row + 1, 'result': result})
    return request, data, prompt


class KnowledgeTest(unittest.TestCase):
    def test_scoped_search_read_then_continuation_passes(self):
        report = audit.audit(*fixture())
        self.assertTrue(report['all_assertions_passed'], report)

    def test_missing_wrong_scope_error_and_late_reads_fail(self):
        mutations = [
            lambda d: d['tools'].pop(),
            lambda d: d['calls'][-1]['arguments'].update(uris='viking://user/private/file.md'),
            lambda d: d['calls'][-2]['arguments'].update(target_uri=''),
            lambda d: d['calls'][-2].update(tool=audit.PREFIX + 'write'),
            lambda d: d['tools'][-1].update(result={'isError': True, 'content': ['denied']}),
            lambda d: d['tools'][-1].update(result=''),
            lambda d: d['tools'][-1].update(result='NOT_FOUND: ' + 'missing ' * 20),
            lambda d: d['tools'][-1].update(row=999),
            lambda d: d['tools'][-2].update(result={'resources': [{'uri': audit.SOURCE_ROOTS[1] + '/different.md'}]}),
            lambda d: d['calls'][-1].update(row=3),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                request, data, prompt = fixture()
                mutate(data)
                self.assertFalse(audit.audit(request, data, prompt)['all_assertions_passed'])

    def test_recovery_advice_does_not_change_receipt_or_knowledge_body(self):
        outcome = {'status': 'AMBIGUOUS', 'action_key': 'node.add', 'operation_id': 'original'}
        wrapped = {'content': [{'type': 'text', 'text': json.dumps(outcome)},
                               {'type': 'text', 'text': 'Recovery guidance, not an outcome.'}]}
        self.assertEqual(evidence.unwrap(wrapped), outcome)
        wrapped['content'][0]['text'] = 'Actual source text'
        self.assertEqual(evidence.unwrap(wrapped), ['Actual source text', 'Recovery guidance, not an outcome.'])

    def test_native_skill_must_match_pinned_runtime_and_isolated_copy(self):
        request, data, prompt = fixture()
        source = 'plugins/loginom-dock-hermes/skills/loginom/SKILL.md'
        request['native_skill'] = {'source': source, 'sha256': 'f' * 64}
        request['runtime_source_pin']['inputs'][source] = 'f' * 64
        data['native_skill_unchanged'] = True
        self.assertTrue(audit.audit(request, data, prompt)['all_assertions_passed'])
        data['native_skill_unchanged'] = False
        self.assertFalse(audit.audit(request, data, prompt)['all_assertions_passed'])

    def test_scope_is_segment_based(self):
        root = audit.SOURCE_ROOTS[0]
        for uri in [root + '-private/x', root + '/../x', root + '/%2e%2e/x', root + '/x?token=hidden']:
            self.assertFalse(audit.scoped_uri(uri, root))

    def test_multi_read_does_not_credit_error_for_second_source(self):
        a, b = (r + '/file.md' for r in audit.SOURCE_ROOTS)
        result = f'=== {a} ===\n' + 'Source text. ' * 20 + f'\n\n=== {b} ===\nNOT_FOUND'
        self.assertTrue(audit.readable_source(audit.source_body(result, [a, b], a)))
        self.assertFalse(audit.readable_source(audit.source_body(result, [a, b], b)))

    def test_export_includes_redacted_knowledge_reply_but_no_foreign_tool(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            db = sqlite3.connect(home / 'state.db')
            db.execute('CREATE TABLE messages (id INTEGER, session_id TEXT, role TEXT, tool_call_id TEXT, tool_name TEXT, content TEXT, tool_calls TEXT)')
            for i, name in enumerate([audit.PREFIX + 'read', 'foreign_read']):
                db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?)', (i + 1, 's', 'tool', str(i), name,
                    json.dumps({'content': [{'type': 'text', 'text': 'Source has secret-fixture'}]}), None))
            db.commit(); db.close()
            results = evidence.tool_evidence(home, ['secret-fixture'])
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]['result'], 'Source has [redacted]')


if __name__ == '__main__':
    unittest.main()
