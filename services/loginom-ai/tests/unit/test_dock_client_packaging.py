"""Source-only packaging checks; production release builds remain on the VPS.

Run with Python directly to avoid loading the unrelated OpenViking test services:
    python3 tests/unit/test_dock_client_packaging.py
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_script(path):
    spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ClientPackagingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.packager_path = ROOT / "deploy/loginom-dock/package-client-source.py"
        cls.packager = load_script(cls.packager_path)
        cls.preflight = load_script(ROOT / "tools/loginom-acceptance/preflight.py")
        cls.provenance = load_script(ROOT / "deploy/loginom-dock/client-source-inventory.py")

    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="dock-client-source-check-")
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.source = self.directory / "source"
        self.source.mkdir()
        for name in self.packager.client_source_files(ROOT):
            destination = self.source / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, destination, follow_symlinks=False)
        subprocess.run(["git", "init", "--quiet", str(self.source)], check=True, capture_output=True)
        script = self.source / "deploy/loginom-dock/package-client-source.py"
        shutil.copy2(self.packager_path, script)

    def commit_sources(self):
        subprocess.run(["git", "add", "."], cwd=self.source, check=True, capture_output=True)
        subprocess.run(
            ["git", "-c", "user.name=Source check", "-c", "user.email=source@example.invalid",
             "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Fixture"],
            cwd=self.source, check=True, capture_output=True,
        )

    def test_preflight_compares_bytes_modes_and_file_set_to_commit(self):
        self.commit_sources()
        clean = self.preflight.preflight(self.source)
        self.assertTrue(clean["source"]["build_inputs_match_commit"])
        self.assertFalse(clean["model_started"])
        self.assertEqual(len(clean["runtime"]["inputs"]), 49)
        self.assertIn("client/lib/node-procedure.mjs", clean["runtime"]["inputs"])
        self.assertIn("client/lib/text-import-procedure.mjs", clean["runtime"]["inputs"])
        self.assertIn("client/lib/managed-shutdown.mjs", clean["runtime"]["inputs"])
        self.assertIn("client/lib/artifacts.mjs", clean["runtime"]["inputs"])
        self.assertIn("client/lib/recovery-context.mjs", clean["runtime"]["inputs"])
        (self.source / "client/lib/config.mjs").write_text("// changed\n")
        (self.source / "client/lib/new.mjs").write_text("// new\n")
        (self.source / "client/README.md").unlink()
        path = self.source / "client/lib/catalog.mjs"
        path.chmod(path.stat().st_mode ^ 0o111)
        # Required missing files fail closed before a misleading inventory.
        with self.assertRaisesRegex(SystemExit, "Required client build inputs"):
            self.preflight.preflight(self.source)
        shutil.copy2(ROOT / "client/README.md", self.source / "client/README.md")
        removed = self.source / "client/test/config.test.mjs"
        removed.unlink()
        dirty = self.preflight.preflight(self.source)
        changes = {item["path"]: item["reason"] for item in dirty["source"]["differences"]}
        self.assertEqual(changes["client/lib/config.mjs"], "content")
        self.assertEqual(changes["client/lib/new.mjs"], "untracked_at_commit")
        self.assertEqual(changes["client/lib/catalog.mjs"], "type_or_mode")
        self.assertEqual(changes["client/test/config.test.mjs"], "missing")
        self.assertFalse(dirty["source"]["build_inputs_match_commit"])
        self.assertNotEqual(clean["source"]["inventory_sha256"], dirty["source"]["inventory_sha256"])

    def test_preflight_excludes_private_files_and_rejects_symlinks(self):
        self.commit_sources()
        before = self.preflight.preflight(self.source)
        private = self.source / ".dock/state.json"
        private.parent.mkdir()
        private.write_text("private sentinel")
        (self.source / "client/lib/.env").write_text("private sentinel")
        self.assertEqual(before, self.preflight.preflight(self.source))
        link = self.source / "client/lib/escape.mjs"
        link.symlink_to(private)
        with self.assertRaisesRegex(ValueError, "Symlink source input"):
            self.preflight.preflight(self.source)

    def test_preflight_cli_dirty_gate_writes_inventory_but_does_not_overwrite(self):
        self.commit_sources()
        (self.source / "client/lib/extra.mjs").write_text("// uncommitted\n")
        output = self.directory / "preflight.json"
        command = [sys.executable, str(ROOT / "tools/loginom-acceptance/preflight.py"),
                   "--root", str(self.source), "--require-clean", "--output", str(output)]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        original = output.read_bytes()
        subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(output.read_bytes(), original)

    def test_runtime_inventory_rejects_dynamic_duplicate_and_unpacked_inputs(self):
        self.commit_sources()
        session = self.source / "client/lib/session.mjs"
        original = session.read_text()
        marker = "for (const file of ['../.node-version'"
        for replacement in ("process.env.INPUT", "'../.node-version', '../.node-version'"):
            session.write_text(original.replace(marker, "for (const file of [" + replacement, 1))
            with self.assertRaisesRegex(ValueError, "unique literal list"):
                self.preflight.preflight(self.source)
        (self.source / "operator.txt").write_text("not a build input")
        session.write_text(original.replace(marker, "for (const file of ['../../operator.txt'", 1))
        with self.assertRaisesRegex(ValueError, "missing from client source packaging"):
            self.preflight.preflight(self.source)

    def test_snapshot_excludes_operator_files_and_requires_executor_inputs(self):
        self.commit_sources()
        excluded = [
            "executor/catalog/operator-private.json",
            "executor/catalog/.env",
            "executor/replay/private.log",
            "client/lib/.env.local",
        ]
        for name in excluded:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("packaging-exclusion-sentinel\n")
        archive = self.directory / "sources.tar.gz"
        subprocess.run(
            [sys.executable, str(self.packager_path), "--root", str(self.source), "--output", str(archive)],
            check=True, capture_output=True, text=True,
        )
        with tarfile.open(archive, "r:gz") as snapshot:
            names = set(snapshot.getnames())
            self.assertFalse(names.intersection(excluded))
            self.assertIn("executor/catalog/compatibility.json", names)
            self.assertIn("executor/schemas/replay-acceptance.schema.json", names)
            self.assertIn("deploy/loginom-dock/build-action-catalog.mjs", names)
            self.assertIn("deploy/loginom-dock/publish-action-catalog.py", names)
        manifest = json.loads(Path(str(archive) + ".manifest.json").read_text())
        self.provenance.verify_archive(archive, manifest["source"]["files"])
        self.assertTrue(manifest["source"]["build_inputs_match_commit"])

        missing = self.source / "executor/catalog/compatibility.json"
        missing.unlink()
        with self.assertRaisesRegex(SystemExit, "Required client build inputs.*compatibility.json"):
            self.packager.client_source_files(self.source)

    def test_clean_gate_checks_git_objects_and_actual_extracted_and_staged_inputs(self):
        self.commit_sources()
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.source, text=True).strip()
        proof = self.provenance.verify_clean_source(self.source, self.source, commit)
        builder = load_script(self.source / "deploy/loginom-dock/build-client-bundle.py")
        target = self.directory / "staged"
        builder.copy_client_sources(self.source, target)
        self.provenance.verify_staged_source(target, proof)
        (target / "client/lib/extra.mjs").write_text("// unexpected input\n")
        with self.assertRaisesRegex(ValueError, "Staged build inputs changed"):
            self.provenance.verify_staged_source(target, proof)
        (self.source / "client/lib/config.mjs").write_text("// changed after commit\n")
        with self.assertRaisesRegex(ValueError, "do not match"):
            self.provenance.verify_clean_source(self.source, self.source, commit)
        with self.assertRaisesRegex(ValueError, "full exact commit"):
            self.provenance.verify_clean_source(self.source, self.source, "HEAD")

    def test_builder_clean_flag_cannot_bypass_missing_provenance(self):
        output = self.directory / "must-not-be-created"
        result = subprocess.run([sys.executable, str(ROOT / "deploy/loginom-dock/build-client-bundle.py"),
            "--source", str(self.source), "--node", "/absent/node", "--node-license", "/absent/license",
            "--dependencies", "/absent/dependencies", "--platform", "linux-x64", "--output", str(output),
            "--source-commit", "a" * 40, "--source-clean"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())

    def test_archive_provenance_is_deterministic_and_rejects_dirty_tampered_or_duplicate_files(self):
        import io
        import json
        self.commit_sources()
        archives = [self.directory / "one.tar.gz", self.directory / "two.tar.gz"]
        for archive in archives:
            subprocess.run([sys.executable, str(self.packager_path), "--root", str(self.source),
                "--output", str(archive), "--require-clean"], check=True, capture_output=True)
        self.assertEqual(archives[0].read_bytes(), archives[1].read_bytes())
        manifest = json.loads(Path(str(archives[0]) + ".manifest.json").read_text())
        expected = manifest["source"]["files"]
        with tarfile.open(archives[0]) as original:
            contents = [(item, original.extractfile(item).read()) for item in original]
        corrupt = self.directory / "corrupt.tar.gz"
        with tarfile.open(corrupt, "w:gz") as output:
            for item, data in contents + contents[:1]:
                output.addfile(item, io.BytesIO(data))
        with self.assertRaisesRegex(ValueError, "differs from recorded"):
            self.provenance.verify_archive(corrupt, expected)
        (self.source / "client/lib/config.mjs").write_text("// dirty\n")
        rejected = self.directory / "dirty.tar.gz"
        result = subprocess.run([sys.executable, str(self.packager_path), "--root", str(self.source),
            "--output", str(rejected), "--require-clean"], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(rejected.exists())
        self.assertFalse(Path(str(rejected) + ".manifest.json").exists())

    def test_bundle_source_staging_excludes_credentials_on_each_platform(self):
        (self.source / "client/lib/.env.local").write_text("packaging-exclusion-sentinel\n")
        (self.source / "executor/catalog/operator-private.json").write_text("packaging-exclusion-sentinel\n")
        builder = load_script(self.source / "deploy/loginom-dock/build-client-bundle.py")
        for windows in (False, True):
            with self.subTest(windows=windows):
                target = self.directory / f"staged-{windows}"
                builder.copy_client_sources(self.source, target, windows=windows)
                self.assertFalse((target / "client/lib/.env.local").exists())
                self.assertFalse((target / "executor/catalog/operator-private.json").exists())
                self.assertTrue((target / "executor/catalog/actions.json").is_file())
                self.assertTrue((target / "executor/schemas/replay-acceptance.schema.json").is_file())
                for fixture in (
                    "tools/loginom-acceptance/collapse/review-fix/loaded-runtime-sources.json",
                    "tools/loginom-acceptance/collapse/variant-contract/observed.json",
                ):
                    self.assertEqual((target / fixture).read_bytes(), (self.source / fixture).read_bytes())
                self.assertFalse((target / "runtime").exists())
                self.assertFalse((target / "release.json").exists())

    def test_landing_suites_resolve_in_snapshot_and_both_bundle_layouts(self):
        # These dependency-free suites must remain runnable even on a source
        # checker without the pinned client runtime or npm dependencies.
        node = os.environ.get("DOCK_TEST_NODE") or shutil.which("node")
        if not node:
            self.skipTest("Node is required to check isolated landing imports")
        builder = load_script(self.source / "deploy/loginom-dock/build-client-bundle.py")
        layouts = [self.source]
        for windows in (False, True):
            staged = self.directory / f"landing-staged-{windows}"
            builder.copy_client_sources(self.source, staged, windows=windows)
            layouts.append(staged)
        for layout in layouts:
            with self.subTest(layout=layout.name):
                tests = sorted((layout / "client/test").glob("landing*.test.mjs"))
                self.assertTrue(tests)
                result = subprocess.run(
                    [node, "--test", *map(str, tests)], cwd=layout / "client",
                    capture_output=True, text=True, timeout=120,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_isolated_staged_sources_run_the_complete_client_suite(self):
        pinned = Path.home() / ".loginom-dock/current/runtime/node"
        node = os.environ.get("DOCK_TEST_NODE") or (str(pinned) if pinned.is_file() else shutil.which("node"))
        if not node:
            self.skipTest("A pinned Node runtime is required for the isolated client suite")
        expected = (ROOT / "client/.node-version").read_text().strip()
        version = subprocess.check_output([node, "--version"], text=True).strip().removeprefix("v")
        if version != expected:
            self.skipTest(f"The isolated client suite requires Node {expected}; found {version}")
        dependencies = ROOT / "client/node_modules"
        if not dependencies.is_dir():
            self.skipTest("Pinned client dependencies must be installed before this source check")
        self.commit_sources()
        checkout = self.directory / "clean-checkout"
        subprocess.run(["git", "clone", "--quiet", "--no-local", str(self.source), str(checkout)],
                       check=True, capture_output=True)
        self.assertEqual(subprocess.check_output(["git", "status", "--porcelain"], cwd=checkout), b"")
        self.assertTrue(self.preflight.preflight(checkout)["source"]["build_inputs_match_commit"])
        staged = self.directory / "staged"
        builder = load_script(checkout / "deploy/loginom-dock/build-client-bundle.py")
        builder.copy_client_sources(checkout, staged)
        # Only package dependencies are shared; every tested source and resource
        # must resolve inside the isolated staging directory.
        (staged / "client/node_modules").symlink_to(dependencies, target_is_directory=True)
        tests = sorted((staged / "client/test").glob("*.test.mjs"))
        self.assertTrue(tests)
        result = subprocess.run(
            [node, "--test", "--test-concurrency=1", *map(str, tests)], cwd=staged / "client",
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((staged / "release.json").exists())
        self.assertFalse(list((staged / "tools").rglob("*.pyc")))


if __name__ == "__main__":
    unittest.main()
