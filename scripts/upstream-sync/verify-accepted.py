#!/usr/bin/env python3
"""Checks that a merge of an upstream tag took upstream's changes instead of discarding them.

A conflict can be "resolved" by choosing the fork's whole file; the metric then looks perfect and the update is lost.
For every file upstream changed since the merge base this compares four versions: base, fork (pre-merge), upstream and
the committed merge result, and reports:

  took-upstream     fork never touched the file, result equals upstream                    (expected)
  merged            both sides changed the file, result differs from both                  (expected)
  upstream-lines    for merged files: lines upstream added that are missing in the result  (warning, see --strict-lines)
  kept-fork         both changed it, result equals the fork's file: upstream's change was dropped        FAIL
  took-theirs       both changed it, result equals upstream's file: the fork's change was dropped        FAIL
  merged-deleted    both changed it, the result deletes it                                               FAIL
  merged-emptied    both changed it, the result is an empty file                                         FAIL
  not-upstream      fork never touched it, result differs from upstream (content, mode or file type)     FAIL
  added-missing     upstream added a file and nothing equal to it exists in the result                  FAIL
  added-truncated   upstream added a file; the result has the path but lacks lines of it (or its mode)   FAIL
  renamed-truncated upstream renamed a file the fork did not touch; the result lacks lines of it         FAIL
  deleted-kept      upstream deleted a file the fork changed and the result keeps it                    DECISION
  deleted-dropped   upstream deleted a file the fork changed and the result deletes it                  DECISION

FAIL and DECISION entries are accepted only through --allow-ours / --allow-theirs files whose lines are
`path  # reason`: the reason is the recorded owner decision (see docs/upstream-sync/catalog.md for ownership policies).
--allow-ours covers kept-fork, deleted-kept; --allow-theirs covers took-theirs, deleted-dropped, merged-deleted,
merged-emptied; either file covers added-missing, added-truncated, renamed-truncated.
Files are compared by mode and content: a lost executable bit or a file turned into a symlink is a difference.

Usage: verify-accepted.py --repo DIR --base SHA --fork SHA --upstream SHA [--allow-ours F] [--allow-theirs F] [--strict-lines]
Exit code 0: every upstream change is accounted for; 1: unexplained entries.
"""
import argparse
import collections
import importlib.util
import os
import subprocess
import sys

# The fork spells some external identifiers differently; upstream lines are compared after the mapping apply-identity.py applies.
sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("apply_identity", os.path.join(os.path.dirname(os.path.abspath(__file__)), "apply-identity.py"))
_apply_identity = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_apply_identity)
identity = _apply_identity.transform


def main():
    ap = argparse.ArgumentParser()
    for key in ("repo", "base", "fork", "upstream"):
        ap.add_argument("--" + key, required=True)
    ap.add_argument("--allow-ours")
    ap.add_argument("--allow-theirs")
    ap.add_argument("--strict-lines", action="store_true")
    a = ap.parse_args()
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C")

    def git(*args, check=True):
        return subprocess.run(["git", "-C", a.repo, *args], capture_output=True, check=check, env=env).stdout

    def tree(rev):
        out = {}
        for rec in git("ls-tree", "-r", "-z", rev).split(b"\0"):
            if rec:
                meta, path = rec.split(b"\t", 1)
                mode, _, sha = meta.decode().split()
                out[path.decode()] = (mode, sha)
        return out

    def changes(x, y):
        raw = git("diff", "-l30000", "-M", "--name-status", "-z", x, y).split(b"\0")
        res, i = [], 0
        while i < len(raw) - 1:
            st = raw[i].decode(); i += 1
            if st[0] == "R":
                res.append(("R", raw[i].decode(), raw[i + 1].decode())); i += 2
            else:
                res.append((st[0], raw[i].decode(), raw[i].decode())); i += 1
        return res

    def allow(path):
        entries = {}
        if path:
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#"):
                    name, _, reason = line.partition("#")
                    entries[name.strip()] = reason.strip()
        return entries

    ours, theirs = allow(a.allow_ours), allow(a.allow_theirs)
    base, fork, up, res = tree(a.base), tree(a.fork), tree(a.upstream), tree("HEAD")
    result_blobs = set(res.values())
    moved = {old: new for st, old, new in changes(a.base, a.fork) if st == "R"}   # fork-side renames

    def content(entry):
        return blob_lines(a, env, entry[1])

    def missing_from(entry, wanted):
        present = collections.Counter(content(entry))
        return [l for l in wanted if l.strip() and not (present[l] > 0 or present[identity(l)] > 0)]

    def blank(entry):
        return not any(l.strip() for l in content(entry))

    counts = collections.Counter()
    problems = []      # (category, path, detail)
    warnings = []

    def fail_unless(category, path, detail, allowed):
        if path in allowed:
            counts[category.split(" ", 1)[1] + " (allowed)"] += 1
        else:
            problems.append((category, path, detail))

    def check_merged(path, f, u, r, added):
        """Both sides changed the path (or both added it); r is the result's entry."""
        if r is None:
            fail_unless("FAIL merged-deleted", path, "both sides changed it; the result deletes it", theirs)
        elif blank(r) and not blank(f) and not blank(u):
            fail_unless("FAIL merged-emptied", path, "both sides changed it; the result is an empty file", theirs)
        else:
            counts["merged"] += 1
            if f != u:
                missing = missing_from(r, [l for l in added if l.strip()])
                if missing:
                    warnings.append((path, len(missing), len([l for l in added if l.strip()]), missing[:3]))

    for status, old, new in changes(a.base, a.upstream):
        path = moved.get(new if status != "D" else old, new if status != "D" else old)
        if status in ("M", "T"):
            b, f, u, r = base.get(old), fork.get(path), up.get(new), res.get(path)
            if f is None:
                # fork deleted a file upstream still maintains
                category = "fork-deleted"
                counts[category] += 1
                if path not in ours and path not in theirs and r is not None:
                    problems.append(("FAIL fork-deleted-reappeared", path, "fork deleted it, result has it again"))
                continue
            if f == b:
                if r == u:
                    counts["took-upstream"] += 1
                else:
                    problems.append(("FAIL not-upstream", path, "fork never changed it but the result differs from upstream"))
                continue
            if r == f and f != u:
                if path in ours: counts["kept-fork (allowed)"] += 1
                else: problems.append(("FAIL kept-fork", path, "result equals the fork's file; upstream's change is dropped"))
            elif r == u and f != u:
                if path in theirs: counts["took-theirs (allowed)"] += 1
                else: problems.append(("FAIL took-theirs", path, "result equals upstream's file; the fork's change is dropped"))
            else:
                check_merged(path, f, u, r, lines_added(a, env, old, new))
        elif status == "A":
            f, u, r = fork.get(path), up[new], res.get(path)
            if f is not None and f != u:
                if r == f:
                    fail_unless("FAIL kept-fork", path, "both sides added it; the result equals the fork's file", ours)
                elif r == u:
                    fail_unless("FAIL took-theirs", path, "both sides added it; the result equals upstream's file", theirs)
                else:
                    check_merged(path, f, u, r, content(u))
            elif u in result_blobs:
                counts["added"] += 1
            elif r is None:
                fail_unless("FAIL added-missing", path, "upstream added the file; nothing equal to it exists in the result", {**ours, **theirs})
            elif r[0] != u[0] or missing_from(r, content(u)):
                fail_unless("FAIL added-truncated", path, "upstream added the file; the result has the path but its content or mode differs", {**ours, **theirs})
            else:
                counts["added"] += 1
        elif status == "D":
            if old in fork and fork[old] == base.get(old):
                counts["deleted"] += 1       # fork never touched it; deletion is the expected outcome
                if old in res:
                    problems.append(("FAIL deleted-kept", old, "unchanged in the fork, deleted upstream, still in the result"))
                continue
            kept = (moved.get(old, old)) in res
            category = "deleted-kept" if kept else "deleted-dropped"
            allowed = (ours if kept else theirs).get(moved.get(old, old)) or (ours if kept else theirs).get(old)
            if allowed is not None:
                counts[f"{category} (allowed)"] += 1
            else:
                problems.append(("DECISION " + category, old, "upstream deleted a file the fork changed; record the owner decision"))
        elif status == "R":
            u = up[new]
            r = res.get(new) or res.get(moved.get(old, old))
            f = fork.get(moved.get(old, old))
            if r is None and u not in result_blobs:
                problems.append(("FAIL renamed-missing", new, f"upstream renamed {old}; the new path is absent from the result"))
            elif r == u or u in result_blobs:
                counts["renamed"] += 1
            elif f is None:
                counts["renamed"] += 1       # the fork deleted the file; the deletion is a catalog matter, not a loss here
            elif f == base.get(old):
                if r[0] != u[0] or missing_from(r, content(u)):
                    fail_unless("FAIL renamed-truncated", new, f"upstream renamed {old}; the result has the file but its content or mode differs", {**ours, **theirs})
                else:
                    counts["renamed"] += 1
            else:
                check_merged(new, f, u, r, lines_added(a, env, old, new))

    print("| Category | Files |")
    print("|---|---:|")
    for key, value in sorted(counts.items()):
        print(f"| {key} | {value} |")
    if warnings:
        print(f"\nupstream-added lines missing from merged files ({len(warnings)} files; mapped through the fork's identity names):")
        for path, n, total, sample in warnings:
            print(f"- {path}: {n}/{total} lines, e.g. {sample[0][:100]!r}")
    if problems:
        print("\nunexplained:")
        for category, path, detail in problems:
            print(f"- {category}: {path} — {detail}")
    failed = bool(problems) or (a.strict_lines and bool(warnings))
    print("\nRESULT:", "UNEXPLAINED ENTRIES" if failed else "ACCEPTED")
    sys.exit(1 if failed else 0)


def lines_added(a, env, old, new):
    out = subprocess.run(["git", "-C", a.repo, "diff", "-U0", "--no-color", f"{a.base}:{old}", f"{a.upstream}:{new}"],
                         capture_output=True, env=env).stdout.decode("utf-8", "replace")
    return [l[1:] for l in out.split("\n") if l.startswith("+") and not l.startswith("+++")]


def blob_lines(a, env, sha):
    return subprocess.run(["git", "-C", a.repo, "cat-file", "blob", sha], capture_output=True, env=env).stdout.decode("utf-8", "replace").split("\n")


if __name__ == "__main__":
    main()
