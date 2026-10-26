#!/usr/bin/env python3
"""Behavior tests for apply-identity.py and verify-accepted.py on private Git fixtures (no network, no bun).

Every test builds a base commit, a fork commit and an upstream commit, then a "resolution" the way a person would leave it,
and asserts what the tool reports. Run: python3 -I scripts/upstream-sync/test_tools.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C",
           GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@example.invalid",
           GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@example.invalid")
BODY = "".join(f"line {i}\n" for i in range(1, 13))


def lines_with(n, text):
    return BODY.replace(f"line {n}\n", text + "\n")


class Fixture:
    """base -> fork (branch `fork`) and base -> upstream (branch `upstream`); `resolve` leaves the result as HEAD."""

    def __init__(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="upstream-sync-test.")
        self.dir = Path(self._tmp.name)
        self.git("init", "-q", "-b", "base")

    def close(self):
        self._tmp.cleanup()

    def git(self, *args, check=True):
        p = subprocess.run(["git", "-C", str(self.dir), *args], capture_output=True, text=True, env=ENV)
        if check and p.returncode:
            raise AssertionError(f"git {args}: {p.stderr}")
        return p.stdout.strip()

    def write(self, path, text, mode=None):
        full = self.dir / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(text)
        if mode:
            full.chmod(mode)

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD")

    def start(self, base, fork, upstream):
        """base/fork/upstream: callables that edit the working tree for each commit."""
        base()
        self.base = self.commit("base")
        self.git("checkout", "-q", "-b", "fork")
        fork()
        self.fork = self.commit("fork")
        self.git("checkout", "-q", "-b", "upstream", self.base)
        upstream()
        self.upstream = self.commit("upstream")
        return self

    def begin_merge(self):
        self.git("checkout", "-q", "--detach", self.fork)
        self.git("-c", "rerere.enabled=false", "merge", "--no-commit", "--no-ff", self.upstream, check=False)

    def resolve(self, edits=None, deletes=()):
        """Merge upstream into the fork, apply `edits` {path: text} and `deletes`, commit as the result."""
        self.begin_merge()
        for path, text in (edits or {}).items():
            self.write(path, text)
        for path in deletes:
            (self.dir / path).unlink()
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "result")

    def accepted(self, *extra, strict=False):
        cmd = [sys.executable, "-I", str(HERE / "verify-accepted.py"), "--repo", str(self.dir), "--base", self.base,
               "--fork", self.fork, "--upstream", self.upstream, *extra]
        if strict:
            cmd.append("--strict-lines")
        p = subprocess.run(cmd, capture_output=True, text=True, env=ENV)
        return p.returncode, p.stdout + p.stderr

    def identity(self, *args):
        p = subprocess.run([sys.executable, "-I", str(HERE / "apply-identity.py"), "--repo", str(self.dir), *args],
                           capture_output=True, text=True, env=ENV)
        return p.returncode, p.stdout, p.stderr


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()
        self.addCleanup(self.fx.close)


class ApplyIdentitySince(FixtureCase):
    def seed(self, upstream):
        return self.fx.start(lambda: self.fx.write("packages/core/src/old.ts", BODY + "// fork\n"),
                             lambda: self.fx.write("fork.txt", "fork\n"), upstream)

    def test_sees_files_of_an_uncommitted_merge(self):
        fx = self.seed(lambda: self.fx.write("packages/core/src/new.ts", "export const f = process.env.OPENCODE_NEW_FLAG\n"))
        fx.begin_merge()
        code, out, _ = fx.identity("--since", fx.fork, "--check")
        self.assertEqual((code, out.split()), (1, ["packages/core/src/new.ts"]))
        fx.identity("--since", fx.fork)
        self.assertIn("LOGINOM_AI_AGENT_NEW_FLAG", (fx.dir / "packages/core/src/new.ts").read_text())

    def test_sees_the_same_files_after_the_merge_commit(self):
        fx = self.seed(lambda: self.fx.write("packages/core/src/new.ts", "export const f = process.env.OPENCODE_NEW_FLAG\n"))
        fx.resolve()
        code, out, _ = fx.identity("--since", fx.fork, "--check")
        self.assertEqual((code, out.split()), (1, ["packages/core/src/new.ts"]))

    def test_sees_a_file_upstream_moved_and_edited(self):
        def upstream():
            self.fx.git("mv", "packages/core/src/old.ts", "packages/core/src/moved.ts")
            self.fx.write("packages/core/src/moved.ts", BODY + "const d = '.opencode/agent'\n")
        fx = self.seed(upstream)
        fx.begin_merge()
        code, out, _ = fx.identity("--since", fx.fork, "--check")
        self.assertEqual((code, out.split()), (1, ["packages/core/src/moved.ts"]))

    def test_sees_a_resolution_file_that_is_not_staged_yet(self):
        fx = self.seed(lambda: self.fx.write("packages/core/src/new.ts", "export const ok = 1\n"))
        fx.begin_merge()
        fx.write("packages/core/src/by-hand.ts", "export const f = process.env.OPENCODE_BY_HAND\n")
        code, out, _ = fx.identity("--since", fx.fork, "--check")
        self.assertEqual((code, out.split()), (1, ["packages/core/src/by-hand.ts"]))

    def test_leaves_a_clean_merge_alone(self):
        fx = self.seed(lambda: self.fx.write("packages/core/src/new.ts", "export const ok = 1\n"))
        fx.begin_merge()
        self.assertEqual(fx.identity("--since", fx.fork, "--check")[0], 0)


class AcceptedNewFiles(FixtureCase):
    NEW = "export const a = 1\nexport const flag = process.env.OPENCODE_NEW_FLAG\nexport const b = 2\n"

    def seed(self):
        return self.fx.start(lambda: self.fx.write("keep.txt", "keep\n"), lambda: self.fx.write("fork.txt", "fork\n"),
                             lambda: self.fx.write("src/new.ts", self.NEW))

    def test_accepts_the_file_as_it_came(self):
        fx = self.seed(); fx.resolve()
        self.assertEqual(fx.accepted(strict=True)[0], 0)

    def test_accepts_the_file_with_the_fork_names(self):
        fx = self.seed(); fx.resolve({"src/new.ts": self.NEW.replace("OPENCODE_", "LOGINOM_AI_AGENT_")})
        self.assertEqual(fx.accepted(strict=True)[0], 0)

    def test_rejects_an_empty_file_in_place_of_the_added_one(self):
        fx = self.seed(); fx.resolve({"src/new.ts": ""})
        for strict in (False, True):
            code, out = fx.accepted(strict=strict)
            self.assertEqual(code, 1, out)
            self.assertIn("src/new.ts", out)

    def test_rejects_a_truncated_added_file(self):
        fx = self.seed(); fx.resolve({"src/new.ts": "export const a = 1\n"})
        for strict in (False, True):
            code, out = fx.accepted(strict=strict)
            self.assertEqual(code, 1, out)
            self.assertIn("added-truncated: src/new.ts", out)

    def test_rejects_a_missing_added_file(self):
        fx = self.seed(); fx.resolve(deletes=["src/new.ts"])
        self.assertEqual(fx.accepted()[0], 1)

    def test_accepts_a_truncated_file_with_a_recorded_decision(self):
        fx = self.seed(); fx.resolve({"src/new.ts": "export const a = 1\n"})
        allow = fx.dir.parent / "allow-theirs.txt"
        allow.write_text("src/new.ts  # owner: product ships its own version\n")
        self.assertEqual(fx.accepted("--allow-theirs", str(allow), strict=True)[0], 0)


class AcceptedBothSidesChanged(FixtureCase):
    def seed(self):
        return self.fx.start(lambda: self.fx.write("src/a.ts", BODY),
                             lambda: self.fx.write("src/a.ts", lines_with(1, "fork 1")),
                             lambda: self.fx.write("src/a.ts", lines_with(10, "upstream 10") + "extra upstream\n"))

    def test_accepts_a_real_merge(self):
        fx = self.seed(); fx.resolve()
        self.assertEqual(fx.accepted(strict=True)[0], 0)

    def test_rejects_deleting_a_file_both_sides_changed(self):
        fx = self.seed(); fx.resolve(deletes=["src/a.ts"])
        for strict in (False, True):
            code, out = fx.accepted(strict=strict)
            self.assertEqual(code, 1, out)
            self.assertIn("merged-deleted: src/a.ts", out)

    def test_accepts_the_deletion_as_a_recorded_decision(self):
        fx = self.seed(); fx.resolve(deletes=["src/a.ts"])
        allow = fx.dir.parent / "allow-theirs.txt"
        allow.write_text("src/a.ts  # owner: the product dropped this module\n")
        code, out = fx.accepted("--allow-theirs", str(allow), strict=True)
        self.assertEqual(code, 0, out)
        self.assertIn("merged-deleted (allowed)", out)

    def test_an_allowance_for_another_path_does_not_cover_it(self):
        fx = self.seed(); fx.resolve(deletes=["src/a.ts"])
        allow = fx.dir.parent / "allow-theirs.txt"
        allow.write_text("src/other.ts  # owner decision\n")
        self.assertEqual(fx.accepted("--allow-theirs", str(allow))[0], 1)

    def test_rejects_an_emptied_merge_result(self):
        fx = self.seed(); fx.resolve({"src/a.ts": ""})
        for strict in (False, True):
            code, out = fx.accepted(strict=strict)
            self.assertEqual(code, 1, out)
            self.assertIn("merged-emptied: src/a.ts", out)

    def test_a_partly_missing_upstream_line_is_a_warning_unless_strict(self):
        fx = self.seed(); fx.resolve({"src/a.ts": lines_with(1, "fork 1").replace("line 10\n", "upstream 10\n")})
        code, out = fx.accepted()
        self.assertEqual(code, 0, out)
        self.assertIn("upstream-added lines missing", out)
        self.assertEqual(fx.accepted(strict=True)[0], 1)


class AcceptedAddAdd(FixtureCase):
    def seed(self):
        return self.fx.start(lambda: self.fx.write("keep.txt", "keep\n"),
                             lambda: self.fx.write("src/x.ts", "export const fork = 1\n"),
                             lambda: self.fx.write("src/x.ts", "export const upstream = 1\n"))

    def test_rejects_the_fork_file_when_both_sides_added_the_path(self):
        fx = self.seed(); fx.resolve({"src/x.ts": "export const fork = 1\n"})
        code, out = fx.accepted()
        self.assertEqual(code, 1, out)
        self.assertIn("kept-fork: src/x.ts", out)

    def test_accepts_a_combination_of_both(self):
        fx = self.seed(); fx.resolve({"src/x.ts": "export const fork = 1\nexport const upstream = 1\n"})
        self.assertEqual(fx.accepted(strict=True)[0], 0)

    def test_rejects_an_empty_result(self):
        fx = self.seed(); fx.resolve({"src/x.ts": ""})
        self.assertEqual(fx.accepted()[0], 1)


class AcceptedModesAndRenames(FixtureCase):
    def test_rejects_a_lost_executable_bit(self):
        fx = self.fx.start(lambda: self.fx.write("run.sh", "echo hi\n", 0o644), lambda: self.fx.write("fork.txt", "f\n"),
                           lambda: self.fx.write("run.sh", "echo hi\n", 0o755))
        fx.resolve()
        self.assertEqual(fx.accepted()[0], 0)
        fx.git("update-index", "--chmod=-x", "run.sh"); fx.git("commit", "-q", "-m", "lost mode")
        code, out = fx.accepted()
        self.assertEqual(code, 1, out)
        self.assertIn("run.sh", out)

    def test_rejects_a_regular_file_where_upstream_made_a_symlink(self):
        def upstream():
            (self.fx.dir / "link").unlink()
            os.symlink("target.txt", self.fx.dir / "link")
        fx = self.fx.start(lambda: (self.fx.write("link", "target.txt"), self.fx.write("target.txt", "t\n")),
                           lambda: self.fx.write("fork.txt", "f\n"), upstream)
        fx.resolve()
        self.assertEqual(fx.accepted()[0], 0)
        fx.git("rm", "-q", "--cached", "link"); (fx.dir / "link").unlink(); fx.write("link", "target.txt")
        fx.git("add", "-A"); fx.git("commit", "-q", "-m", "regular instead of symlink")
        self.assertEqual(fx.accepted()[0], 1)

    def seed_rename(self, fork_edit):
        def upstream():
            self.fx.git("mv", "src/old.ts", "src/new.ts")
            self.fx.write("src/new.ts", lines_with(10, "upstream 10"))
        return self.fx.start(lambda: self.fx.write("src/old.ts", BODY), fork_edit, upstream)

    def test_accepts_a_rename_the_merge_carried_out(self):
        fx = self.seed_rename(lambda: self.fx.write("fork.txt", "f\n")); fx.resolve()
        self.assertEqual(fx.accepted(strict=True)[0], 0)

    def test_rejects_an_empty_file_in_place_of_the_renamed_one(self):
        fx = self.seed_rename(lambda: self.fx.write("fork.txt", "f\n")); fx.resolve({"src/new.ts": ""})
        code, out = fx.accepted()
        self.assertEqual(code, 1, out)
        self.assertIn("src/new.ts", out)

    def test_rejects_a_rename_whose_content_was_replaced(self):
        fx = self.seed_rename(lambda: self.fx.write("fork.txt", "f\n")); fx.resolve({"src/new.ts": BODY})
        self.assertEqual(fx.accepted()[0], 1)

    def test_accepts_a_rename_merged_with_a_fork_edit(self):
        fx = self.seed_rename(lambda: self.fx.write("src/old.ts", lines_with(1, "fork 1"))); fx.resolve()
        self.assertEqual(fx.accepted(strict=True)[0], 0)

    def test_rejects_a_renamed_and_edited_file_resolved_empty(self):
        fx = self.seed_rename(lambda: self.fx.write("src/old.ts", lines_with(1, "fork 1"))); fx.resolve({"src/new.ts": ""})
        self.assertEqual(fx.accepted()[0], 1)



class CatalogCheckUncommittedMerge(FixtureCase):
    def seed(self):
        """Upstream has a.txt, b.txt, x.txt; the fork committed a change to a.txt and describes only that in the catalog."""
        fx = self.fx
        fx.write("a.txt", BODY); fx.write("b.txt", BODY); fx.write("x.txt", BODY)
        fx.git("add", "-A"); fx.git("commit", "-q", "-m", "upstream")
        self.upstream = fx.git("rev-parse", "HEAD")
        fx.write("a.txt", lines_with(1, "fork 1"))
        fx.write("docs/upstream-sync/catalog.md", "## CAT-01 a\n")
        self.entry(["a.txt"])
        fx.git("add", "-A"); fx.git("commit", "-q", "-m", "fork")
        return fx

    def entry(self, paths):
        self.fx.write("docs/upstream-sync/catalog.json", json.dumps({"against": self.upstream, "entries": [{"id": "CAT-01", "paths": paths}]}))

    def check(self):
        p = subprocess.run([sys.executable, "-I", str(HERE / "catalog-check.py"), "--repo", str(self.fx.dir), "--against", self.upstream],
                           capture_output=True, text=True, env=ENV)
        return p.returncode, p.stdout + p.stderr

    def test_passes_when_every_divergence_is_described(self):
        self.seed()
        self.assertEqual(self.check()[0], 0)

    def test_sees_a_staged_change_before_the_merge_commit(self):
        fx = self.seed()
        fx.write("b.txt", lines_with(2, "resolution 2")); fx.git("add", "b.txt")
        code, out = self.check()
        self.assertEqual(code, 1, out)
        self.assertIn("b.txt", out)

    def test_sees_an_unstaged_change_before_the_merge_commit(self):
        fx = self.seed()
        fx.write("b.txt", lines_with(2, "resolution 2"))
        code, out = self.check()
        self.assertEqual(code, 1, out)
        self.assertIn("b.txt", out)

    def test_sees_a_file_deleted_by_the_resolution(self):
        fx = self.seed()
        (fx.dir / "b.txt").unlink()
        code, out = self.check()
        self.assertEqual(code, 1, out)
        self.assertIn("b.txt", out)

    def test_follows_a_rename_that_ends_in_an_untracked_file(self):
        fx = self.seed()
        self.entry(["a.txt", "y.txt"])
        fx.git("add", "-A"); fx.git("commit", "-q", "-m", "catalog")
        fx.git("rm", "-q", "x.txt"); fx.write("y.txt", lines_with(1, "moved 1"))
        code, out = self.check()
        self.assertEqual(code, 0, out)
        self.assertIn("2 divergent upstream files", out)
        self.assertEqual(fx.git("diff", "--cached", "--name-only"), "x.txt")
        self.assertEqual(fx.git("ls-files", "--others", "--exclude-standard"), "y.txt")

    def test_leaves_the_index_alone(self):
        fx = self.seed()
        fx.write("untracked.txt", "new\n")
        self.check()
        self.assertEqual(fx.git("diff", "--cached", "--name-only"), "")

if __name__ == "__main__":
    unittest.main(verbosity=2)
