import json
import os
from pathlib import Path
import tempfile
import unittest

from archive import create_archive
from inventory import git, snapshot
from restore_check import restore_archive, verify_archive
from test_inventory import repository


class ArchiveTest(unittest.TestCase):
    def fixture(self, root):
        source = repository(root / "source")
        for index in range(2):
            (source / "tracked.txt").write_text(f"stash {index}\n")
            (source / "extra.txt").write_text("stashed untracked\n")
            git(source, "stash", "push", "-u")
        git(source, "checkout", "--detach")
        (source / "lost.txt").write_text("reflog-only commit\n")
        git(source, "add", ".")
        git(source, "commit", "-m", "detached")
        lost = git(source, "rev-parse", "HEAD").decode().strip()
        git(source, "checkout", "main")
        (source / "tracked.txt").write_text("staged\n")
        git(source, "add", "tracked.txt")
        (source / "tracked.txt").write_text("unstaged\n")
        (source / "link").symlink_to("tracked.txt")
        (source / "private").mkdir()
        (source / "private/key").write_text("SECRET_FIXTURE")
        state = snapshot(source)
        public = {"files": [{"worktree": str(source), "path": "link"}]}
        private = {"files": [{"worktree": str(source), "path": "private/"}]}
        return source, state, public, private, lost

    def test_restore_staged_unstaged_stashes_reflog_symlink_and_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, state, public, private, lost = self.fixture(root)
            create_archive(state, root / "archive", public, private)
            # Source removed from its original location: restore cannot silently rely on it.
            source.rename(root / "unavailable-source")
            result = restore_archive(root / "archive", root / "restored")
            self.assertEqual(result["status"], "PASS")
            recovered = root / "restored/worktrees/0"
            self.assertEqual((recovered / "tracked.txt").read_text(), "unstaged\n")
            self.assertEqual(git(recovered, "show", ":tracked.txt"), b"staged\n")
            self.assertEqual(os.readlink(recovered / "link"), "tracked.txt")
            self.assertEqual((recovered / "private/key").read_text(), "SECRET_FIXTURE")
            self.assertEqual(git(recovered, "show", f"{lost}:lost.txt"), b"reflog-only commit\n")
            for oid in state["stash"]:
                self.assertEqual(git(recovered, "show", f"{oid}^3:extra.txt"), b"stashed untracked\n")
            self.assertEqual((root / "archive").stat().st_mode & 0o777, 0o700)
            self.assertNotIn("SECRET_FIXTURE", json.dumps(result))
            with self.assertRaises(FileExistsError):
                restore_archive(root / "archive", root / "restored")

    def test_rejects_unclassified_and_modified_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _, state, public, private, _ = self.fixture(root)
            with self.assertRaisesRegex(ValueError, "UNCLASSIFIED_FILES"):
                create_archive(state, root / "rejected", {}, {})
            self.assertFalse((root / "rejected").exists())
            create_archive(state, root / "archive", public, private)
            (root / "archive/worktrees/0/private/private/key").write_text("corrupted")
            with self.assertRaisesRegex(ValueError, "FILE_HASH_MISMATCH"):
                verify_archive(root / "archive")


if __name__ == "__main__":
    unittest.main()
