"""Immutable Code06 native regression; never upgrades its failed original trial."""
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from javascript_node_acceptance import cold_audit_expectations,native_writer_baseline
from javascript_cold_evidence import verify_javascript_cold


PINS={
    'writer-audit.json':'ca3c9cd357d86959f990234a3df768006c2e048d8ee25c1c15411c518340cefa',
    'collection.json':'90879488c73380f03a40364fa8731f10e4345de0aa9700ab42822af2837be4e7',
    'authored-source.js':'570d990aac95e65571bed6238225b039af92b058e117614fc776388b9c9c7460',
    'cold-evidence/report.json':'37ce0f84a9a3ea583095183cc9b546059278a2e638f7a6612399b70f1d69f62d',
    'cold-evidence/execution-events.jsonl':'fe9d5617bc5f118a4d2ba3349cdddaf65ad68c08cce02473ad6b1440fa789b73',
    'profile/loginom/runtime/generations/2/chats/fbab8f299249b519e602d88a08313fbe538f62a4b6cb9eef5d06cf69e85cf35f/attempts/d38c4ef1-3802-48c9-ae7c-2968189b62ee/execution-events.jsonl':'978fb397270b0b465709b106ccf7ba963b90ce93ae032f3c8d3115f74b5ae2ad',
}


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_AUTONOMOUS_COLD_ROOT'),'private Code06 capture not supplied')
class JavascriptAutonomousColdTests(unittest.TestCase):
    def setUp(self):
        root=Path(os.environ['LOGINOM_JAVASCRIPT_AUTONOMOUS_COLD_ROOT'])
        files={name:(root/name).read_bytes() for name in PINS}
        for name,digest in PINS.items():self.assertEqual(hashlib.sha256(files[name]).hexdigest(),digest,name)
        audit=json.loads(files['writer-audit.json'])
        native=[json.loads(line) for line in files[next(name for name in PINS if name.startswith('profile/'))].splitlines()]
        request=next(row['request'] for row in native if row.get('phase')=='node_apply_prepared'
            and row.get('operation_id')==audit['source_operation_id'])
        self.writer=native_writer_baseline(native,request,files['authored-source.js'],audit['execution_ids'],
            audit['package_path'],json.loads(files['collection.json'])['process']['finished_at'],
            expected_target=dict(profile_id='loginom-7.4.2-linux-chromium-ru',loginom_build='7.4.2',platform='linux',browser='chromium'),
            expected_origin='http://logi-test-plan.bg.local')
        self.report=json.loads(files['cold-evidence/report.json'])
        self.events=[json.loads(line) for line in files['cold-evidence/execution-events.jsonl'].splitlines()]
        self.expected=cold_audit_expectations('jsteach',audit['package_path'])
        self.oracle=json.loads((Path(__file__).resolve().parents[4]/'docs/node-development/nodes/programming-javascript/fixtures/operator-only/expected.json').read_text())

    def audit(self,events=None):
        return verify_javascript_cold(self.report,self.events if events is None else events,self.writer,
            self.expected,self.oracle['schema'],self.oracle['ordered_rows'])

    def test_whole_cold_semantics_with_the_same_expectations_as_original_trial(self):
        result=self.audit()
        self.assertTrue(result['passed'],result)
        self.assertTrue(result['cold_full_business_table_evidence_verified'])
        self.assertFalse(result['cli_acceptance_verified'])

    def test_url_fix_does_not_accept_foreign_or_noncanonical_metadata(self):
        for origin in ('http://logi-test-plan.bg.local','http://foreign/','http://logi-test-plan.bg.local/app/',
                'https://logi-test-plan.bg.local/','http://logi-test-plan.bg.local/?x=1'):
            events=copy.deepcopy(self.events)
            events[0]['target']['origin']=origin
            result=self.audit(events)
            self.assertIn('cold_journal_owner_pin',result['failures'],origin)

    def test_session_runtime_and_build_pins_remain_exact(self):
        for key in ('session_id','runtime_revision','target'):
            events=copy.deepcopy(self.events)
            events[-1][key]='foreign'
            self.assertIn('cold_journal_owner_pin',self.audit(events)['failures'])


if __name__=='__main__':unittest.main()
