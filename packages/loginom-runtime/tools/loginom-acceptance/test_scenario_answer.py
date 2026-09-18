import sqlite3
import tempfile
import unittest
from pathlib import Path

from scenario_answer import export_final_answer


class FinalAnswerTests(unittest.TestCase):
    def check_export(self, final):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            with sqlite3.connect(home/'state.db') as db:
                db.executescript('CREATE TABLE sessions (id TEXT, model TEXT); CREATE TABLE messages (id INTEGER, session_id TEXT, role TEXT, content TEXT, finish_reason TEXT, tool_calls TEXT, reasoning TEXT);')
                db.execute('INSERT INTO sessions VALUES (?,?)', ('session', 'mimo-v2.5'))
                db.execute('INSERT INTO messages VALUES (1,?,?,?,?,?,?)', ('session', 'system', 'PRIVATE_SYSTEM', 'stop', None, 'PRIVATE_REASONING'))
                db.execute('INSERT INTO messages VALUES (2,?,?,?,?,?,?)', ('session', 'assistant', 'INTERMEDIATE', 'tool_calls', '[{}]', 'PRIVATE_REASONING'))
                db.execute('INSERT INTO messages VALUES (3,?,?,?,?,?,?)', ('session', 'assistant', final, 'stop', None, 'PRIVATE_REASONING'))
            return export_final_answer(home, ['fake-secret'])

    def test_only_final_visible_content_is_exported_and_redacted(self):
        result = self.check_export('Done fake-secret')
        self.assertEqual(result['text'], 'Done [redacted]')
        self.assertNotIn('PRIVATE', str(result))
        self.assertNotIn('INTERMEDIATE', str(result))

    def test_mixed_private_block_is_not_exported(self):
        result = self.check_export('<think>private</think>Done')
        self.assertEqual(result['status'], 'unavailable')
        self.assertNotIn('text', result)


if __name__ == '__main__':
    unittest.main()
