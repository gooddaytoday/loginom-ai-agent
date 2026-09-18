import json
from pathlib import Path
import tempfile
import unittest
from analytic_corpus import package_cleanup_evidence


class CorpusTeardownTests(unittest.TestCase):
    def test_model_exit_cannot_replace_owned_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            dock=Path(directory);session=dock/'sessions'/'owned';session.mkdir(parents=True)
            metadata=dict(sessionId='owned',profile=str(session/'browser-profile'),workspacePreparation=dict(attempted=True))
            (session/'session.json').write_text(json.dumps(metadata))
            self.assertEqual(package_cleanup_evidence(dock)['status'],'UNCONFIRMED')
            receipt=dict(status='SUCCEEDED',session_id='owned',package_closed=True,logged_out=True,unsaved_changes_discarded=False)
            def check(data):
                (session/'package-cleanup.json').write_text(json.dumps(data));return package_cleanup_evidence(dock)['status']
            self.assertEqual(check(receipt),'PASS')
            for patch in [dict(status='BLOCKED',reason='UNSAVED_CHANGES'),dict(session_id='foreign'),dict(logged_out=False),dict(unsaved_changes_discarded=True)]:
                self.assertEqual(check({**receipt,**patch}),'UNCONFIRMED')
            (session/'package-cleanup.json').write_text(json.dumps(receipt))
            metadata['profile']='/foreign/browser-profile';(session/'session.json').write_text(json.dumps(metadata))
            self.assertEqual(package_cleanup_evidence(dock)['status'],'UNCONFIRMED')

    def test_unprepared_tool_discovery_is_not_a_completed_run(self):
        with tempfile.TemporaryDirectory() as directory:
            dock=Path(directory);session=dock/'sessions'/'discovery';session.mkdir(parents=True)
            (session/'session.json').write_text(json.dumps(dict(sessionId='discovery')))
            self.assertEqual(package_cleanup_evidence(dock),dict(status='UNCONFIRMED',sessions=[]))


if __name__=='__main__':unittest.main()
