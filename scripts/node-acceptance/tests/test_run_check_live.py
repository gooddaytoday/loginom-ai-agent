import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_check_live import LiveChain, write_events


class LiveChainTest(unittest.TestCase):
    def test_owner_guard_rejects_changed_browser_and_nonce(self):
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            chain = LiveChain(profile, profile, profile, 'test-user', '/test-user/sample.lgp', 'p/m', '', lambda: -1)
            chain.owner_file.parent.mkdir()
            chain.owner_file.write_bytes(b'expected nonce')
            chain.owner = b'expected nonce'
            chain.child = Mock(pid=42)
            chain.child.poll.return_value = None
            chain.browser = (11, '1000', profile / 'attempt')
            with patch('run_check_live.browser_owner', return_value=chain.browser) as browser:
                chain.verify_owner()
                browser.return_value = (11, '1001', profile / 'attempt')
                with self.assertRaisesRegex(AssertionError, 'LIVE_CHAIN_BROWSER_OWNER_CHANGED'):
                    chain.verify_owner()
                chain.owner_file.write_bytes(b'new nonce')
                with self.assertRaisesRegex(AssertionError, 'LIVE_CHAIN_PROFILE_OWNER_CHANGED'):
                    chain.verify_owner()

    def test_turn_events_exclude_previous_turn_and_pending_tool(self):
        def part(kind, message, **fields):
            return dict(type=kind, sessionID='chat', messageID=message, **fields)

        with TemporaryDirectory() as directory:
            folder = Path(directory)
            write_events(folder, [dict(id='current')], [
                (2, 4, part('tool', 'previous', state=dict(status='completed', time=dict(end=4)))),
                (5, 5, part('step-start', 'current')),
                (7, 9, part('tool', 'current', state=dict(status='running'))),
                (6, 11, part('tool', 'current', state=dict(status='completed', time=dict(end=10)))),
                (12, 12, part('step-finish', 'current')),
            ])
            events = [json.loads(line) for line in (folder / 'model.stdout').read_text().splitlines()]
            self.assertEqual([(event['type'], event['timestamp']) for event in events],
                             [('step_start', 5), ('tool_use', 10), ('step_finish', 12)])
