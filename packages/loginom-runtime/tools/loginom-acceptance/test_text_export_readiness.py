import tempfile,unittest,json,copy
from pathlib import Path
from unittest.mock import patch
from text_export_acceptance import audit_directory
from text_export_readiness import REJECT_BASELINE_BLOCKER,require_reject_baseline_reader,MANIFEST

class RejectBaselineReadinessTests(unittest.TestCase):
    def test_missing_manifest_fails_before_any_launch(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,REJECT_BASELINE_BLOCKER):require_reject_baseline_reader(manifest=Path(d)/'missing.json')
    def test_auditor_still_refuses_missing_full_goal_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertFalse(audit_directory(Path(d),Path(d))['passed'])
    def test_pins_cannot_be_replaced_by_boolean_admission(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'manifest.json';p.write_text(json.dumps({'ready':True,'native_smoke_admitted':True}))
            with self.assertRaisesRegex(ValueError,REJECT_BASELINE_BLOCKER):require_reject_baseline_reader(manifest=p)
    def test_real_candidate_manifest_rejects_target_runtime_harness_and_goal_mutations(self):
        if not MANIFEST.exists():self.skipTest('Freeze manifest not written yet')
        original=json.loads(MANIFEST.read_text())
        mutations=[lambda m:m.update(runtime='0'*64),lambda m:m.update(runtime_changes_since_diagnostic=[]),lambda m:m['runtime_inputs'].update({'client/lib/text-export-node.mjs':'0'*64}),lambda m:m.update(profile='diagnostic'),lambda m:m.update(account='test-1'),lambda m:m['runtime_inputs'].update({'client/lib/bridge.mjs':'0'*64}),lambda m:m['harness_inputs'].pop('text-export-observer-client.mjs'),lambda m:m.update(goal_sha256='0'*64),lambda m:m['diagnostic'].update(sha256='0'*64),lambda m:m.update(changed_since_diagnostic=[])]
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'manifest.json'
            for change in mutations:
                m=copy.deepcopy(original);change(m);p.write_text(json.dumps(m))
                with self.assertRaisesRegex(ValueError,REJECT_BASELINE_BLOCKER):require_reject_baseline_reader('user-v1-component',p)
if __name__=='__main__':unittest.main()
