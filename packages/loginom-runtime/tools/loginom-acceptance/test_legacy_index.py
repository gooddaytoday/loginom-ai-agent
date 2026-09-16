"""Historical evidence availability, not a replay or model test."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("legacy_index", Path(__file__).with_name("index-legacy-evidence.py"))
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)


class LegacyIndexTest(unittest.TestCase):
    def test_hash_mismatch_missing_and_unlisted_private_sources_are_not_promoted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            run = root / "historical-run"
            run.mkdir()
            (run / "request.json").write_text('{"secret":"DO_NOT_COPY","fault_injection":false}')
            (run / "result.json").write_text('{"returncode":0,"reasoning":"DO_NOT_COPY"}')
            report = {"kind": "old_audit", "all_assertions_passed": True, "assertions": [{"passed": True}],
                      "inputs": {"result.json": legacy.sha(run / "result.json")}}
            path = run / "independent-audit.json"
            path.write_text(json.dumps(report))
            before = legacy.inventory(root)
            self.assertEqual(before["audits_with_verified_recorded_inputs"], 1)
            self.assertNotIn("DO_NOT_COPY", json.dumps(before))
            self.assertFalse(before["runs"][0]["audits"][0]["revalidated_with_current_auditor"])
            (run / "result.json").write_text('{"returncode":1}')
            self.assertEqual(legacy.inventory(root)["audits_with_verified_recorded_inputs"], 0)
            (run / "result.json").unlink()
            self.assertEqual(legacy.inventory(root)["audits_with_verified_recorded_inputs"], 0)
            (root / "missing-request").mkdir()
            self.assertEqual(legacy.inventory(root)["run_directories"], 2)

    def test_escaping_audit_path_is_not_read(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "request.json").write_text('{}')
            path = root / "independent-audit.json"
            path.write_text(json.dumps({"inputs": {"../outside": "a" * 64}}))
            entry = legacy.audit_entry(path, root)
            self.assertEqual(entry["recorded_input_integrity"], "unverified")
            self.assertFalse(entry["recorded_inputs"][0]["available"])


if __name__ == "__main__":
    unittest.main()
