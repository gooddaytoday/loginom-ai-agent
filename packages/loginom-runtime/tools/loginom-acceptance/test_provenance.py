"""Source/index/preflight tests with temporary synthetic evidence only."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import audit
import run
from test_acceptance import fixture


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), Path(__file__).parent / (name + ".py"))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


source = module("verify-sources")
indexer = module("index-evidence")


class ProvenanceTest(unittest.TestCase):
    def test_source_probe_rejects_wrong_hash_or_locator(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "source.js").write_text("symbol one\nsymbol two\n")
            manifest = {"profile": "synthetic", "files": [{"path": "source.js", "sha256": source.sha((root / "source.js").read_bytes()),
                        "assertions": [{"line": 2, "symbol": "two"}]}]}
            self.assertTrue(source.verify_ui(root, manifest)["passed"])
            wrong = copy.deepcopy(manifest)
            wrong["files"][0]["assertions"][0]["line"] = 1
            self.assertFalse(source.verify_ui(root, wrong)["passed"])
            (root / "source.js").write_text("symbol one\nsymbol two altered\n")
            self.assertFalse(source.verify_ui(root, manifest)["passed"])

    def test_index_rechecks_input_hashes_and_preserves_failed_attempts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            request, evidence, prompt = fixture()
            request["harness_inputs"] = {name: audit.sha(Path(audit.__file__).with_name(name).read_bytes()) for name in ("audit.py", "evidence.py")}
            request["goal_id"] = "basic-graph"
            directory = root / request["run_id"]
            directory.mkdir()
            run.write(directory / "request.json", request)
            run.write(directory / "evidence.json", evidence)
            run.write(directory / "scenario.txt", prompt)
            run.write(directory / "attempt.json", {"run_id": request["run_id"], "status": "EXPORTED_PENDING_AUDIT", "model_started": True})
            report = audit.audit_directory(directory)
            self.assertTrue(report["all_assertions_passed"])
            run.write(directory / "audit.json", report)
            self.assertEqual(indexer.index(root)["passed"], 1)
            with (directory / "evidence.json").open("a") as output:
                output.write(" ")
            self.assertEqual(indexer.entry(directory)["outcome"], "invalid_evidence")
            failed = root / "failed-attempt"
            failed.mkdir()
            run.write(failed / "request.json", {"run_id": failed.name})
            run.write(failed / "attempt.json", {"run_id": failed.name, "status": "FAILED_BEFORE_MODEL", "model_started": False})
            entries = indexer.index(root)
            self.assertEqual(entries["attempts"], 2)
            self.assertEqual(entries["passed"], 0)
            self.assertEqual(indexer.entry(failed)["outcome"], "failed_attempt")

    def test_live_preflight_never_starts_mcp_browser_or_model(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / "dock.json"
            config.write_text('{"api_key":"synthetic-not-real"}')
            args = SimpleNamespace(run=False, timeout=1200, max_turns=60, manifest_uri=None, manifest_sha256=None,
                                   loginom_user=None,
                                   hermes_home=root, dock_config=config, node=root / "node", browsers=root / "browsers",
                                   hermes=root / "hermes", hermes_python=root / 'python', hermes_source=root / 'source',
                                   output=root / "preflight.json")
            prior_umask = os.umask(0o077)
            try:
                with patch.object(run.sys, "platform", "darwin"), patch.object(run, "connection", return_value={"providers":{"openai-codex":{"tokens":{"access_token":"synthetic"}}}}), \
                     patch.object(run, "preflight", return_value={"source": {}, "runtime": {"client_revision": "a" * 64}}), \
                     patch.object(run.subprocess, "run", side_effect=[SimpleNamespace(stdout='{"node":"24.19.0"}'),
                        SimpleNamespace(stdout="Hermes Agent v0.21.0 (fixture)"),
                        SimpleNamespace(stdout="Hermes Agent v0.21.0 (fixture)",returncode=0)]) as process, \
                     patch.object(run.subprocess, "Popen") as model:
                    self.assertEqual(run.execute(args), 0)
                    model.assert_not_called()
                    self.assertEqual(process.call_count, 3)
                    self.assertIn("runtime-check.mjs", process.call_args_list[0].args[0][1])
                    self.assertEqual(process.call_args_list[1].args[0][-1], "--version")
                report = json.loads(args.output.read_text())
                self.assertFalse(report["model_started"])
                self.assertNotIn("synthetic-not-real", args.output.read_text())
            finally:
                os.umask(prior_umask)


if __name__ == "__main__":
    unittest.main()
