import copy
from pathlib import Path
import tempfile
import unittest

from inventory import git
from sources import build_map, import_map, verify_map
from test_inventory import repository


class SourcesTest(unittest.TestCase):
    def test_import_is_independent_and_detects_changed_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = repository(root / "source")
            (source / "client").mkdir()
            (source / "client/tool.mjs").write_text('export const value = 42\n')
            (source / "AGENTS.md").write_text('Historical instructions, never activate\n')
            git(source, "add", ".")
            git(source, "commit", "-m", "runtime fixture")
            value = build_map(source, "refs/heads/main")
            output = root / "output"
            output.mkdir()
            count = import_map(source, value, output, dry_run=True)
            self.assertEqual(list(output.iterdir()), [])
            self.assertEqual(import_map(source, value, output), count)
            source.rename(root / "unavailable-source")
            self.assertEqual(verify_map(value, output), count)
            self.assertFalse((output / "services/loginom-ai/AGENTS.md").exists())
            (output / "packages/loginom-runtime/client/tool.mjs").write_text("changed\n")
            with self.assertRaisesRegex(ValueError, "IMPORTED_HASH_MISMATCH"):
                verify_map(value, output)

    def test_rejects_overwrite_traversal_and_symlink_parent_before_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = repository(root / "source")
            value = build_map(source, "main")
            output = root / "output"
            output.mkdir()
            bad = copy.deepcopy(value)
            bad["files"][0]["destination"] = "../escape"
            with self.assertRaisesRegex(ValueError, "UNSAFE_PATH"):
                import_map(source, bad, output)
            (output / "services").symlink_to(root)
            with self.assertRaisesRegex(ValueError, "DESTINATION_PATH_ESCAPE"):
                import_map(source, value, output)
            (output / "services").unlink()
            import_map(source, value, output)
            with self.assertRaisesRegex(ValueError, "DESTINATION_EXISTS"):
                import_map(source, value, output)


if __name__ == "__main__":
    unittest.main()
