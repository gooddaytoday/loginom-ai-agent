import json
from pathlib import Path
import tempfile
import unittest

from inventory import git, require_snapshot, snapshot


def repository(root):
    root.mkdir()
    git(root, "init", "--initial-branch=main")
    git(root, "config", "user.name", "Migration fixture")
    git(root, "config", "user.email", "fixture@example.invalid")
    (root / "tracked.txt").write_text("baseline\n")
    (root / ".gitignore").write_text("private/\n")
    git(root, "add", ".")
    git(root, "commit", "-m", "fixture")
    return root


class InventoryTest(unittest.TestCase):
    def test_captures_detached_stash_untracked_without_secret_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = repository(Path(tmp) / "source")
            for index in range(2):
                (source / "tracked.txt").write_text(f"stash {index}\n")
                (source / f"stash-{index}.txt").write_text("unsaved input\n")
                git(source, "stash", "push", "--include-untracked", "-m", f"stash {index}")
            detached = Path(tmp) / "detached"
            git(source, "worktree", "add", "--detach", str(detached))
            (detached / "unfinished.txt").write_text("work in progress\n")
            (source / "private").mkdir()
            (source / "private/key").write_text("TEST_ONLY_SECRET_NEVER_OUTPUT")
            state = snapshot(source)
            self.assertEqual(len(state["stash"]), 2)
            self.assertEqual(len(state["worktrees"]), 2)
            self.assertIsNone(state["worktrees"][1]["branch"])
            self.assertEqual(state["worktrees"][1]["untracked"], ["unfinished.txt"])
            self.assertIn("private/", state["worktrees"][0]["ignored"])
            self.assertNotIn("TEST_ONLY_SECRET_NEVER_OUTPUT", json.dumps(state))
            require_snapshot(state)
            (detached / "unfinished.txt").write_text("new work\n")
            with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
                require_snapshot(state)

    def test_detects_ref_changes_and_tampering(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = repository(Path(tmp) / "source")
            state = snapshot(source)
            git(source, "branch", "new-branch")
            with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
                require_snapshot(state)
            state["sha256"] = "invalid"
            with self.assertRaisesRegex(RuntimeError, "SNAPSHOT_HASH_MISMATCH"):
                require_snapshot(state)


if __name__ == "__main__":
    unittest.main()
