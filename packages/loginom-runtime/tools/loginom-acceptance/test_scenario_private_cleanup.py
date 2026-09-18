import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from scenario_private_cleanup import cleanup_completed_run


class PrivateCleanupTests(unittest.TestCase):
    def test_finished_archive_drops_reasoning_preserving_public_and_tool_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)/'run'; home = run/'private/hermes-home'; home.mkdir(parents=True)
            request = dict(run_id='run', provider='xiaomi', model='mimo-v2.5')
            evidence = dict(run_id='run', export_complete=True, process=dict(returncode=0))
            (run/'request.json').write_text(json.dumps(request)); (run/'evidence.json').write_text(json.dumps(evidence))
            db = home/'state.db'
            with sqlite3.connect(db) as connection:
                connection.execute('CREATE TABLE messages(content TEXT, tool_calls TEXT, reasoning TEXT, reasoning_content TEXT, api_content TEXT)')
                connection.execute('INSERT INTO messages VALUES(?,?,?,?,?)', ('visible result', '{"tool":"apply"}', 'synthetic private test value', 'synthetic private test value', None))
            result = cleanup_completed_run(run)
            self.assertEqual(result['status'], 'PASS'); self.assertFalse(result['reasoning_read'])
            with sqlite3.connect(db) as connection:
                self.assertEqual(connection.execute('SELECT * FROM messages').fetchone(), ('visible result', '{"tool":"apply"}', None, None, None))
            self.assertEqual(cleanup_completed_run(run)['cleared_nonnull_rows']['reasoning'], 0)
            evidence['process']['returncode'] = None
            (run/'evidence.json').write_text(json.dumps(evidence))
            with self.assertRaisesRegex(ValueError, 'Completed process'): cleanup_completed_run(run)


if __name__ == '__main__':
    unittest.main()
