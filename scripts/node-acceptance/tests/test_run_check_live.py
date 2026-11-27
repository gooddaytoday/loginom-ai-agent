import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

from run_check_live import attachment_matches, read_turn, transcript, write_events


class SessionV2TranscriptTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.profile = Path(directory.name)
        (self.profile / 'data').mkdir()
        database = sqlite3.connect(self.profile / 'data/loginom-ai-agent.db')
        self.addCleanup(database.close)
        database.executescript("""
            CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT,
                time_busy INTEGER, time_idle INTEGER, idle_outcome TEXT);
            CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
                seq INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
            CREATE TABLE session_part (message_id TEXT NOT NULL, session_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
                type TEXT NOT NULL, call_id TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
                data TEXT NOT NULL, PRIMARY KEY(message_id, ordinal));
            INSERT INTO session_v2 VALUES ('chat', NULL, 5, 9, 'succeeded');
            INSERT INTO session_v2 VALUES ('child', 'chat', 6, 7, 'succeeded');
        """)
        self.db = database

    def message(self, id, kind, seq, *, session='chat', **data):
        self.db.execute('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (id, session, kind, seq, 1, 1, json.dumps(data)))

    def part(self, message, ordinal, kind, *, session='chat', **data):
        self.db.execute('INSERT INTO session_part VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        (message, session, ordinal, kind, data.get('id'), 1, 7, json.dumps(dict(type=kind, **data))))

    def test_projects_only_current_turn_even_when_message_timestamps_tie(self):
        self.message('first', 'user', 1, text='First prompt', time={'created': 1})
        self.message('previous', 'assistant', 2, time={'created': 2, 'completed': 3},
                     content=[dict(type='tool', name='invalid', id='old-call',
                                   state={'status': 'error', 'error': {'type': 'tool.error', 'message': 'old failure'}})])
        self.db.commit()
        previous, _, _ = transcript(self.profile)
        self.message('synthetic', 'synthetic', 3, text='Browser recovery')
        self.message('second', 'user', 4, text='Second prompt', time={'created': 5})
        self.message('child-user', 'user', 1, session='child', text='Subagent prompt')
        self.message('child-assistant', 'assistant', 2, session='child')
        self.message('current', 'assistant', 5, time={'created': 6, 'completed': 8}, finish='stop',
                     model={'providerID': 'test', 'id': 'acceptance', 'variant': 'medium'}, content=[
                         dict(type='tool', name='loginom_dock_node_read', id='read-call',
                              state={'status': 'completed', 'content': [{'type': 'text', 'text': '{"status":"SUCCEEDED"}'}]},
                              time={'created': 6, 'completed': 7}),
                         dict(type='text', text='Finished'),
                     ])
        self.part('child-assistant', 0, 'text', session='child', text='Subagent output')
        self.db.commit()

        messages, parts, activity = transcript(self.profile)
        user, assistants = read_turn(messages, previous[:1], 'chat')
        self.assertEqual((user['text'], assistants[0]['model']['variant']), ('Second prompt', 'medium'))
        self.assertEqual(activity, {'chat': (5, 9, 'succeeded')})
        self.assertIsNone(write_events(self.profile, assistants, parts, finished_session='chat'))
        events = [json.loads(line) for line in (self.profile / 'model.stdout').read_text().splitlines()]
        self.assertEqual([event['type'] for event in events], ['step_start', 'tool_use', 'text', 'step_finish'])
        self.assertEqual(events[1]['part']['state']['output'], '{"status":"SUCCEEDED"}')
        self.assertEqual(events[2]['part']['text'], 'Finished')

    def test_running_question_is_read_from_streaming_parts(self):
        self.message('prompt', 'user', 1, text='Ask me')
        self.message('answer', 'assistant', 2, time={'created': 6}, content=[])
        self.part('answer', 1, 'tool', name='question', id='call', state={'status': 'running'})
        self.part('answer', 0, 'text', text='Before asking')
        self.db.commit()
        messages, parts, _ = transcript(self.profile)
        _, assistants = read_turn(messages, [], None)
        write_events(self.profile, assistants, parts)
        events = [json.loads(line) for line in (self.profile / 'model.stdout').read_text().splitlines()]
        self.assertEqual([event['type'] for event in events], ['step_start', 'text', 'interaction_required'])
        self.assertEqual(events[-1]['part']['tool'], 'question')

    def test_rejects_two_new_user_prompts(self):
        self.message('one', 'user', 1)
        self.message('two', 'user', 2)
        self.db.commit()
        messages, _, _ = transcript(self.profile)
        with self.assertRaisesRegex(AssertionError, 'LIVE_CHAIN_UNEXPECTED_PROMPT'):
            read_turn(messages, [], None)

    def test_checks_attachment_bytes_for_inline_data_and_blob_references(self):
        file = self.profile / 'orders.csv'
        file.write_bytes(b'abc')
        sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        self.assertTrue(attachment_matches(dict(name=file.name, data='YWJj'), file))
        self.assertTrue(attachment_matches(dict(name=file.name, uri='media:' + sha), file))
        self.assertFalse(attachment_matches(dict(name=file.name, data='ZGVm'), file))
        self.assertFalse(attachment_matches(dict(name='customers.csv', data='YWJj'), file))
