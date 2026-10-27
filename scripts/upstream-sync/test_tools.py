#!/usr/bin/env python3
"""Behavior tests for apply-identity.py, merge_oracle.py and the gate verify-accepted.py on private Git fixtures (no network, no bun).

Every test builds a base commit, a fork commit and an upstream commit, then a "resolution" the way a person would leave it,
and asserts what the tool reports. Run: python3 -I scripts/upstream-sync/test_tools.py
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
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

    def resolve(self, edits=None, deletes=(), decisions=None, hook=None):
        """Merge upstream into the fork, apply `edits` {path: text} and `deletes`, write the decision file from `decisions`
        {path: (rule, reason)}, run `hook`, commit as the result; `self.result` is that merge commit."""
        self.begin_merge()
        for path, text in (edits or {}).items():
            self.write(path, text)
        for path in deletes:
            (self.dir / path).unlink()
        if decisions:
            self.write("docs/upstream-sync/merge-decisions.json", json.dumps(
                {"format": 1, "decisions": [{"path": p, "rule": r, "reason": t} for p, (r, t) in decisions.items()]}))
        if hook:
            hook()
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "result")
        self.result = self.git("rev-parse", "HEAD")

    def accepted(self, *extra, merge=None):
        cmd = [sys.executable, "-I", str(HERE / "verify-accepted.py"), "--repo", str(self.dir), "--fork", self.fork,
               "--upstream", self.upstream, "--merge", merge or self.result, *extra]
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


class GateCase(FixtureCase):
    """Tests of the acceptance gate: each builds a real Git merge, leaves a result the way a person would, and asserts the verdict."""

    def assertRejected(self, fx, category, path, *extra):
        code, out = fx.accepted(*extra)
        self.assertEqual(code, 1, out)
        self.assertIn(f"FAIL {category}: {path}", out)
        self.assertIn("RESULT: REJECTED", out)
        return out

    def assertAccepted(self, fx, *extra):
        code, out = fx.accepted(*extra)
        self.assertEqual(code, 0, out)
        self.assertIn("RESULT: ACCEPTED", out)
        return out


class GateNewFiles(GateCase):
    NEW = "export const a = 1\nexport const flag = process.env.OPENCODE_NEW_FLAG\nexport const b = 2\n"
    PATH = "packages/core/src/new.ts"

    def seed(self):
        return self.fx.start(lambda: self.fx.write("keep.txt", "keep\n"), lambda: self.fx.write("fork.txt", "fork\n"),
                             lambda: self.fx.write(self.PATH, self.NEW))

    def test_accepts_the_file_with_the_fork_names(self):
        fx = self.seed(); fx.resolve({self.PATH: self.NEW.replace("OPENCODE_", "LOGINOM_AI_AGENT_")})
        self.assertAccepted(fx)

    def test_rejects_the_file_with_upstream_names_where_the_oracle_maps_them(self):
        fx = self.seed(); fx.resolve()
        self.assertRejected(fx, "deviation", self.PATH)

    def test_rejects_an_empty_file_in_place_of_the_added_one(self):
        fx = self.seed(); fx.resolve({self.PATH: ""})
        self.assertRejected(fx, "deviation", self.PATH)

    def test_rejects_a_truncated_added_file(self):
        fx = self.seed(); fx.resolve({self.PATH: "export const a = 1\n"})
        self.assertRejected(fx, "deviation", self.PATH)

    def test_rejects_a_missing_added_file(self):
        fx = self.seed(); fx.resolve(deletes=[self.PATH])
        self.assertRejected(fx, "deviation", self.PATH)

    def test_accepts_a_truncated_file_with_a_decision_and_warns(self):
        fx = self.seed(); fx.resolve({self.PATH: "export const a = 1\n"}, decisions={self.PATH: ("STANDING-7", "product ships its own version")})
        out = self.assertAccepted(fx)
        self.assertIn(f"- {self.PATH}: upstream-added lines missing", out)


class GateBothSidesChanged(GateCase):
    def seed(self):
        return self.fx.start(lambda: self.fx.write("src/a.ts", BODY),
                             lambda: self.fx.write("src/a.ts", lines_with(1, "fork 1")),
                             lambda: self.fx.write("src/a.ts", lines_with(10, "upstream 10") + "extra upstream\n"))

    def test_accepts_the_mechanical_merge(self):
        fx = self.seed(); fx.resolve()
        out = self.assertAccepted(fx)
        self.assertIn("| conflict | 0 | 0 |", out)

    def test_rejects_deleting_a_file_both_sides_changed(self):
        fx = self.seed(); fx.resolve(deletes=["src/a.ts"])
        self.assertRejected(fx, "deviation", "src/a.ts")

    def test_accepts_the_deletion_with_a_decision(self):
        fx = self.seed(); fx.resolve(deletes=["src/a.ts"], decisions={"src/a.ts": ("ADR-1", "the product dropped this module")})
        self.assertAccepted(fx)

    def test_a_decision_for_another_path_does_not_cover_it(self):
        fx = self.seed(); fx.resolve(deletes=["src/a.ts"], decisions={"src/other.ts": ("ADR-1", "a decision")})
        out = self.assertRejected(fx, "deviation", "src/a.ts")
        self.assertIn("FAIL stale-record: src/other.ts", out)

    def test_rejects_an_emptied_merge_result(self):
        fx = self.seed(); fx.resolve({"src/a.ts": ""})
        self.assertRejected(fx, "deviation", "src/a.ts")

    def test_rejects_a_partly_missing_upstream_line(self):
        fx = self.seed(); fx.resolve({"src/a.ts": lines_with(1, "fork 1").replace("line 10\n", "upstream 10\n")})
        self.assertRejected(fx, "deviation", "src/a.ts")


class GateAddAdd(GateCase):
    def seed(self):
        return self.fx.start(lambda: self.fx.write("keep.txt", "keep\n"),
                             lambda: self.fx.write("src/x.ts", "export const fork = 1\n"),
                             lambda: self.fx.write("src/x.ts", "export const upstream = 1\n"))

    def test_every_conflicted_path_needs_a_decision_even_when_it_combines_both(self):
        fx = self.seed(); fx.resolve({"src/x.ts": "export const fork = 1\nexport const upstream = 1\n"})
        self.assertRejected(fx, "conflict", "src/x.ts")

    def test_accepts_a_combination_of_both_with_a_decision(self):
        fx = self.seed(); fx.resolve({"src/x.ts": "export const fork = 1\nexport const upstream = 1\n"},
                                     decisions={"src/x.ts": ("PROCEDURE-2", "both declarations kept")})
        out = self.assertAccepted(fx)
        self.assertNotIn("warnings", out)

    def test_the_fork_file_alone_passes_with_a_decision_and_a_warning(self):
        fx = self.seed(); fx.resolve({"src/x.ts": "export const fork = 1\n"}, decisions={"src/x.ts": ("PROCEDURE-2", "fork file kept")})
        self.assertIn("upstream-added lines missing", self.assertAccepted(fx))

    def test_rejects_an_empty_result_without_a_decision(self):
        fx = self.seed(); fx.resolve({"src/x.ts": ""})
        self.assertRejected(fx, "conflict", "src/x.ts")


class GateModesAndRenames(GateCase):
    def test_rejects_a_lost_executable_bit(self):
        fx = self.fx.start(lambda: self.fx.write("run.sh", "echo hi\n", 0o644), lambda: self.fx.write("fork.txt", "f\n"),
                           lambda: self.fx.write("run.sh", "echo hi\n", 0o755))
        fx.resolve()
        self.assertAccepted(fx)
        fx.resolve(hook=lambda: (fx.dir / "run.sh").chmod(0o644))
        self.assertRejected(fx, "deviation", "run.sh")

    def test_rejects_a_regular_file_where_upstream_made_a_symlink(self):
        def upstream():
            (self.fx.dir / "link").unlink()
            os.symlink("target.txt", self.fx.dir / "link")
        fx = self.fx.start(lambda: (self.fx.write("link", "target.txt"), self.fx.write("target.txt", "t\n")),
                           lambda: self.fx.write("fork.txt", "f\n"), upstream)
        fx.resolve()
        self.assertAccepted(fx)
        fx.resolve(hook=lambda: ((fx.dir / "link").unlink(), fx.write("link", "target.txt")))
        self.assertRejected(fx, "deviation", "link")

    def seed_rename(self, fork_edit):
        def upstream():
            self.fx.git("mv", "src/old.ts", "src/new.ts")
            self.fx.write("src/new.ts", lines_with(10, "upstream 10"))
        return self.fx.start(lambda: self.fx.write("src/old.ts", BODY), fork_edit, upstream)

    def test_accepts_a_rename_the_merge_carried_out(self):
        fx = self.seed_rename(lambda: self.fx.write("fork.txt", "f\n")); fx.resolve()
        self.assertAccepted(fx)

    def test_rejects_an_empty_file_in_place_of_the_renamed_one(self):
        fx = self.seed_rename(lambda: self.fx.write("fork.txt", "f\n")); fx.resolve({"src/new.ts": ""})
        self.assertRejected(fx, "deviation", "src/new.ts")

    def test_rejects_a_rename_whose_content_was_replaced(self):
        fx = self.seed_rename(lambda: self.fx.write("fork.txt", "f\n")); fx.resolve({"src/new.ts": BODY})
        self.assertRejected(fx, "deviation", "src/new.ts")

    def test_accepts_a_rename_merged_with_a_fork_edit(self):
        fx = self.seed_rename(lambda: self.fx.write("src/old.ts", lines_with(1, "fork 1"))); fx.resolve()
        self.assertAccepted(fx)

    def test_rejects_a_renamed_and_edited_file_resolved_empty(self):
        fx = self.seed_rename(lambda: self.fx.write("src/old.ts", lines_with(1, "fork 1"))); fx.resolve({"src/new.ts": ""})
        self.assertRejected(fx, "deviation", "src/new.ts")


class GateLab302Findings(GateCase):
    """F1-F3 of the verification of LAB-302: each was ACCEPTED by the line-level gate, with no record and under strict lines."""
    SERVICE = ('product = "upstream"\nversion = 1\ncalls = []\ndef authorize(): calls.append("authorize")\n'
               'def publish(): calls.append("publish")\npublish()\nauthorize()\nprint(calls)\n')

    def test_f1_upstream_reorders_calls_and_the_result_keeps_the_old_order(self):
        up = self.SERVICE.replace("version = 1", "version = 2").replace("publish()\nauthorize()", "authorize()\npublish()")
        fork = self.SERVICE.replace('"upstream"', '"fork"')
        fx = self.fx.start(lambda: self.fx.write("service.py", self.SERVICE), lambda: self.fx.write("service.py", fork),
                           lambda: self.fx.write("service.py", up))
        fx.resolve({"service.py": fork.replace("version = 1", "version = 2")})
        self.assertRejected(fx, "conflict", "service.py")

    def test_f1_the_same_file_with_the_fix_reordered_is_not_a_clean_merge_either(self):
        up = self.SERVICE.replace("publish()\nauthorize()", "authorize()\npublish()")
        fork = self.SERVICE.replace('"upstream"', '"fork"').replace("version = 1\ncalls", "version = 1\n\ncalls")
        fx = self.fx.start(lambda: self.fx.write("service.py", self.SERVICE), lambda: self.fx.write("service.py", fork),
                           lambda: self.fx.write("service.py", up))
        fx.resolve({"service.py": fork})
        self.assertRejected(fx, "deviation", "service.py")

    def test_f2_upstream_copies_a_command_and_the_result_drops_the_copy(self):
        launcher = "#!/bin/sh\necho helper\n"
        fx = self.fx.start(lambda: self.fx.write("bin/old-command", launcher, 0o755), lambda: self.fx.write("fork.txt", "fork\n"),
                           lambda: self.fx.write("bin/new-command", launcher, 0o755))
        self.assertIn("C100", fx.git("diff", "-M", "-C", "--find-copies-harder", "--name-status", fx.base, fx.upstream))
        fx.resolve(deletes=["bin/new-command"])
        self.assertRejected(fx, "deviation", "bin/new-command")

    def test_f3_upstream_renames_and_edits_and_the_result_keeps_the_old_path(self):
        def rename():
            self.fx.git("mv", "src/old.ts", "src/new.ts"); self.fx.write("src/new.ts", lines_with(10, "upstream 10"))
        fx = self.fx.start(lambda: self.fx.write("src/old.ts", BODY), lambda: self.fx.write("src/old.ts", lines_with(1, "fork 1")), rename)
        fx.resolve({"src/new.ts": lines_with(1, "fork 1").replace("line 10\n", "upstream 10\n"), "src/old.ts": lines_with(1, "fork 1")})
        self.assertRejected(fx, "deviation", "src/old.ts")


class GateInput(GateCase):
    def seed(self):
        return self.fx.start(lambda: self.fx.write("keep.txt", "keep\n"), lambda: self.fx.write("fork.txt", "fork\n"),
                             lambda: self.fx.write("up.txt", "up\n"))

    def test_judges_only_the_merge_commit_and_lists_the_commits_after_it(self):
        fx = self.seed(); fx.resolve()
        fx.write("later.txt", "a build fix\n"); fx.commit("build fix after the merge")
        out = self.assertAccepted(fx)
        self.assertIn("commits after the merge, not judged (1)", out)
        self.assertIn("build fix after the merge", out)

    def test_refuses_a_commit_that_is_not_a_merge_of_the_two(self):
        fx = self.seed(); fx.resolve()
        code, out = fx.accepted(merge=fx.upstream)
        self.assertEqual(code, 2, out)

    def test_a_decision_for_a_path_that_matches_the_oracle_is_stale(self):
        fx = self.seed(); fx.resolve(decisions={"up.txt": ("ADR-1", "no need")})
        self.assertRejected(fx, "stale-record", "up.txt")

    def test_a_rule_must_name_a_known_source(self):
        fx = self.seed(); fx.resolve({"up.txt": ""}, decisions={"up.txt": ("because", "reason")})
        out = self.assertRejected(fx, "bad-record", "up.txt")
        self.assertIn("FAIL deviation: up.txt", out)

    def test_a_catalog_rule_must_exist_in_the_catalog_of_the_commit(self):
        fx = self.seed()
        fx.resolve({"up.txt": "", "docs/upstream-sync/catalog.json": json.dumps({"against": fx.upstream, "entries": [{"id": "CAT-01", "paths": []}]})},
                   decisions={"up.txt": ("CAT-09", "reason"), "docs/upstream-sync/catalog.json": ("CAT-01", "against moved")})
        out = self.assertRejected(fx, "bad-record", "up.txt")
        self.assertNotIn("bad-record: docs/upstream-sync/catalog.json", out)

    def test_a_decision_needs_a_reason(self):
        fx = self.seed(); fx.resolve({"up.txt": ""}, decisions={"up.txt": ("ADR-1", "  ")})
        self.assertRejected(fx, "bad-record", "up.txt")


class OracleIsMechanical(FixtureCase):
    def test_two_fresh_clones_under_hostile_configuration_give_one_tree(self):
        fx = self.fx.start(lambda: self.fx.write("packages/core/src/a.ts", BODY), lambda: self.fx.write("fork.txt", "f\n"),
                           lambda: self.fx.write("packages/core/src/a.ts", lines_with(3, "x = process.env.OPENCODE_FLAG")))
        trees, scratch = [], Path(tempfile.mkdtemp(prefix="oracle-clones."))
        self.addCleanup(shutil.rmtree, scratch, True)
        for i in range(2):
            home = scratch / f"home{i}"
            home.mkdir()
            (home / ".gitconfig").write_text("[merge]\n\trenames = false\n\tconflictStyle = diff3\n[rerere]\n\tenabled = true\n[core]\n\tautocrlf = true\n")
            clone = scratch / f"clone{i}"
            subprocess.run(["git", "clone", "-q", str(fx.dir), str(clone)], check=True, capture_output=True, env=ENV)
            env = dict(os.environ, HOME=str(home), TZ=["Asia/Tokyo", "America/Lima"][i])
            out = subprocess.run([sys.executable, "-I", str(HERE / "merge_oracle.py"), "--repo", str(clone), "--fork", fx.fork,
                                  "--upstream", fx.upstream, "--print-tree"], capture_output=True, text=True, env=env, check=True).stdout.strip()
            trees.append(out)
        self.assertEqual(trees[0], trees[1])
        shown = subprocess.run(["git", "-C", str(clone), "show", f"{trees[0]}:packages/core/src/a.ts"], capture_output=True, text=True, env=ENV).stdout
        self.assertEqual(shown.count("LOGINOM_AI_AGENT_FLAG"), 1)

    def test_applying_the_identity_to_the_oracle_again_changes_nothing(self):
        fx = self.fx.start(lambda: self.fx.write("packages/core/src/a.ts", BODY), lambda: self.fx.write("fork.txt", "f\n"),
                           lambda: self.fx.write("packages/core/src/a.ts", lines_with(3, "x = process.env.OPENCODE_FLAG")))
        spec = importlib.util.spec_from_file_location("merge_oracle", HERE / "merge_oracle.py")
        mo = importlib.util.module_from_spec(spec); spec.loader.exec_module(mo)
        o = mo.oracle(str(fx.dir), fx.fork, fx.upstream)
        again = mo.apply_identity(str(fx.dir), o.entries, mo.tree_entries(str(fx.dir), fx.fork))
        self.assertEqual(mo.write_tree(str(fx.dir), again), o.tree)

    def test_a_file_the_merge_did_not_change_keeps_its_upstream_spelling(self):
        fx = self.fx.start(lambda: self.fx.write("packages/core/src/a.ts", "x = process.env.OPENCODE_OLD\n"), lambda: self.fx.write("fork.txt", "f\n"),
                           lambda: self.fx.write("up.txt", "u\n"))
        spec = importlib.util.spec_from_file_location("merge_oracle", HERE / "merge_oracle.py")
        mo = importlib.util.module_from_spec(spec); spec.loader.exec_module(mo)
        o = mo.oracle(str(fx.dir), fx.fork, fx.upstream)
        self.assertEqual(o.entries["packages/core/src/a.ts"], mo.tree_entries(str(fx.dir), fx.fork)["packages/core/src/a.ts"])


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


class CheckCompatAllow(FixtureCase):
    """F7 of LAB-303: `check` must hand --allow prefixes to the compat comparison, so expected differences (versions,
    branches) are reported as ALLOWED instead of failing the step."""

    FAKE_BUN = """#!/usr/bin/env bash
case "$*" in
  *compat-snapshot.ts*) while [ $# -gt 0 ]; do [ "$1" = --out ] && echo '{}' >"$2"; shift; done ;;
  *compat-compare.ts*) printf '%s\\n' "$*" >>"$(dirname "$0")/compare-args.log" ;;
esac
"""
    SKIP = "install,typecheck,tests,check,httpapi,catalog,guards,build"

    def prepared(self):
        fx = self.fx
        fx.write("a.txt", BODY)
        upstream = fx.commit("upstream")
        out = fx.dir / "out"
        rehearsal = out / "rehearsal"
        subprocess.run(["git", "clone", "-q", str(fx.dir), str(rehearsal)], check=True, env=ENV)
        (out / "before").mkdir()
        (out / "pins.env").write_text(f"FORK_SHA={'0' * 40}\nUPSTREAM_SHA={upstream}\n")
        bun = out / "bun"
        bun.write_text(self.FAKE_BUN)
        bun.chmod(0o755)
        return out, bun

    def check(self, *extra):
        out, bun = self.prepared()
        p = subprocess.run(["bash", str(HERE / "sync-upstream.sh"), "check", "--out", str(out), "--skip", self.SKIP,
                            "--bun", str(bun), *extra], capture_output=True, text=True, env=ENV)
        log = out / "compare-args.log"
        return p, log.read_text() if log.exists() else ""

    def test_passes_the_allowed_prefixes_to_the_comparison(self):
        p, compared = self.check("--allow", "workspaces.packages", "--allow", "workflows")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn("--allow workspaces.packages --allow workflows", compared)

    def test_compares_without_allowances_by_default(self):
        p, compared = self.check()
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertNotIn("--allow", compared)
        self.assertIn("compat-compare.ts", compared)


class RepositoryHygiene(unittest.TestCase):
    """F10 of LAB-303: packages/opencode/config.json is written by `bun test` and must never reach `git add -A`."""

    def test_the_test_run_config_file_is_ignored(self):
        root = HERE.parents[1]
        p = subprocess.run(["git", "-C", str(root), "check-ignore", "-q", "packages/opencode/config.json"], env=ENV)
        self.assertEqual(p.returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
