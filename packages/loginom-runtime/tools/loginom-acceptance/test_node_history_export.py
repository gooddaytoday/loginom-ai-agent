"""Full-node replies must survive the real SQLite history export path."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from evidence import export_history, NODE_TOOLS, LOCAL_TOOLS


class NodeHistoryExportTests(unittest.TestCase):
    def test_direct_and_routed_running_settled_and_error_replies_are_retained(self):
        snapshots = [dict(operation_id='node', state='running', attempt=1, outcome=None),
                     dict(operation_id='node', state='settled', attempt=1,
                          outcome=dict(status='FAILED', cleanup_complete=False)),
                     dict(isError=True, content=[dict(type='text', text='request rejected')])]
        for tool in sorted(NODE_TOOLS):
            for routed in (False, True):
                with self.subTest(tool=tool, routed=routed), tempfile.TemporaryDirectory() as temp:
                    home = Path(temp)
                    db = sqlite3.connect(home/'state.db')
                    db.execute('CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT,tool_calls TEXT)')
                    for index, snapshot in enumerate(snapshots):
                        key = 'call'+str(index)
                        name = 'tool_call' if routed else tool
                        args = dict(operation_id='node')
                        if routed:
                            args = dict(name=tool, arguments=args)
                        call = json.dumps([dict(id=key, function=dict(name=name, arguments=json.dumps(args)))])
                        envelope = snapshot if snapshot.get('isError') else dict(content=[dict(type='text', text=json.dumps(snapshot))], structuredContent=snapshot)
                        db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?)',
                                   (index*2+1, 'caller', 'assistant', None, None, 'PRIVATE_PROSE', call))
                        db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?,?)',
                                   (index*2+2, 'caller', 'tool', key, name, json.dumps(envelope), None))
                    db.commit(); db.close()
                    calls, replies = export_history(home, [])
                    self.assertEqual((len(calls), len(replies)), (3, 3))
                    self.assertEqual([r['tool'] for r in replies], [tool]*3)
                    self.assertEqual([r['tool_call_id'] for r in replies], [c['tool_call_id'] for c in calls])
                    self.assertEqual(replies[0]['result'], snapshots[0])
                    self.assertEqual(replies[1]['result'], snapshots[1])
                    self.assertTrue(replies[2]['result']['isError'])
                    self.assertNotIn('PRIVATE_PROSE', json.dumps([calls, replies]))

    def test_legacy_audits_do_not_implicitly_admit_new_effect_tools(self):
        self.assertFalse(NODE_TOOLS & LOCAL_TOOLS)


if __name__ == '__main__':
    unittest.main()
