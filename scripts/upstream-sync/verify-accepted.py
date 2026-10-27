#!/usr/bin/env python3
"""Checks that a merge of an upstream tag took upstream's changes instead of discarding them.

A conflict can be "resolved" by choosing the fork's whole file; the metric then looks perfect and the update is lost.
For every file upstream changed since the merge base this compares four versions: base, fork (pre-merge), upstream and
the committed merge result. A version is a mode and a content; a file turned into a symlink or a lost executable bit is a
difference. The verdicts are fixed by docs/upstream-sync/acceptance-contract.md; every cell of that contract is a test
(acceptance_cells.py). Verdicts:

  fork did not touch the file (or made the same change)   result must be upstream's version (names mapped), else
      not-upstream      FAIL     changed or modified file differs from upstream's
      deleted-kept      FAIL     upstream deleted it (or renamed it away) and the result still has it
      added-missing     FAIL*    upstream added it and the result has nothing equal to it
      added-truncated   FAIL*    added file present but lacks lines (or has another mode or type)
      renamed-missing   FAIL     upstream renamed it and the new path is absent
      renamed-truncated FAIL*    renamed file present but lacks lines (or has another mode or type)
  both sides changed it (differently)
      kept-fork         DECISION result equals the fork's version: upstream's change is dropped         (--allow-ours)
      took-theirs       DECISION result equals upstream's version: the fork's change is dropped         (--allow-theirs)
      merged-deleted    FAIL*    the result deletes it                                                   (--allow-theirs)
      merged-emptied    FAIL*    the result is an empty file                                             (--allow-theirs)
      neither-side      FAIL     a file that cannot be merged line by line (binary, symlink, submodule) is neither version
      mode-lost         FAIL*    the merged file lost the executable bit one side changed
      upstream-lines    warning  lines upstream added are missing from the merged text (--strict-lines fails)
  one side deleted what the other changed
      deleted-kept      DECISION upstream deleted a file the fork changed (or moved) and the result keeps it   (--allow-ours)
      deleted-dropped   DECISION ... and the result deletes it                                                  (--allow-theirs)
      fork-deleted      DECISION the fork deleted a file upstream changed; absent: (--allow-ours), present: (--allow-theirs)
  * cleared by the decision file named on the right of the same row; added-*, renamed-truncated and mode-lost by either file.

A DECISION or FAIL* entry is accepted only through --allow-ours / --allow-theirs files whose lines are
`path  # reason`: the reason is the recorded owner decision (see docs/upstream-sync/catalog.md for ownership policies).

Line level is a heuristic: for text, upstream's added lines must appear in the result as a multiset after the fork's names
are applied (OPENCODE_X and LOGINOM_AI_AGENT_X are one line), and copies of a line upstream removed must be gone when the
fork did not change that line's count. It does not check order or position, and a line the fork already had satisfies an
equal line upstream added.

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

DECISIONS = {"deleted-kept", "deleted-dropped", "fork-deleted"}
DETAIL = {
    "not-upstream": "the result differs from upstream's version",
    "deleted-kept": "upstream deleted or renamed it away; the result still has it",
    "deleted-dropped": "upstream deleted a file the fork changed; the result deletes it",
    "added-missing": "upstream added the file; nothing equal to it exists in the result",
    "added-truncated": "upstream added the file; the result has the path but its content or mode differs",
    "renamed-missing": "upstream renamed the file; the new path is absent from the result",
    "renamed-truncated": "upstream renamed the file; the result has it but its content or mode differs",
    "kept-fork": "result equals the fork's version; upstream's change is dropped",
    "took-theirs": "result equals upstream's version; the fork's change is dropped",
    "merged-deleted": "both sides changed it; the result deletes it",
    "merged-emptied": "both sides changed it; the result is an empty file",
    "neither-side": "both sides changed a file that cannot be merged by lines; the result is neither version",
    "mode-lost": "the merged file lost the mode one side changed",
    "fork-deleted": "the fork deleted a file upstream changed; record the owner decision",
}


def main():
    ap = argparse.ArgumentParser()
    for key in ("repo", "base", "fork", "upstream"):
        ap.add_argument("--" + key, required=True)
    ap.add_argument("--allow-ours")
    ap.add_argument("--allow-theirs")
    ap.add_argument("--strict-lines", action="store_true")
    a = ap.parse_args()
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C")

    def git(*args):
        return subprocess.run(["git", "-C", a.repo, *args], capture_output=True, check=True, env=env).stdout

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
    result_versions = set(res.values())
    moved = {old: new for st, old, new in changes(a.base, a.fork) if st == "R"}   # fork-side renames
    blobs = {}

    def data(v):
        if v[1] not in blobs:
            blobs[v[1]] = subprocess.run(["git", "-C", a.repo, "cat-file", "blob", v[1]], capture_output=True, env=env).stdout
        return blobs[v[1]]

    def kind(v):
        if v[0] == "160000":
            return "sub"
        if v[0] == "120000":
            return "link"
        return "bin" if b"\0" in data(v)[:8000] else "text"

    def lines(v):
        return data(v).decode("latin-1").split("\n")

    def mergeable(*vs):
        return all(v is None or kind(v) == "text" for v in vs)

    def blank(v):
        return kind(v) == "text" and not any(l.strip() for l in lines(v))

    def counted(ls):
        return collections.Counter(identity(l) for l in ls if l.strip())

    def lacks(v, wanted):
        return sum((counted(wanted) - counted(lines(v))).values())

    def retained(b, f, u, r):
        """Copies of a line upstream removed that the merged text still holds, for lines the fork left alone."""
        cb, cf, cu, cr = (counted(lines(v)) for v in (b, f, u, r))
        leftovers = {l: cr[l] - cu[l] for l in cb if cf[l] == cb[l] and cu[l] < cb[l] and cr[l] > cu[l]}
        return leftovers

    def same(r, u):
        if r is None or u is None:
            return r is u
        if r == u:
            return True
        return r[0] == u[0] and kind(u) == "text" and kind(r) == "text" and identity(data(r).decode("latin-1")) == identity(data(u).decode("latin-1"))

    def holds(r, u):
        """r has upstream's file: same mode and type, and every line of it (text) or the same bytes (other)."""
        if r is None or r[0] != u[0] or kind(r) != kind(u):
            return False
        return lacks(r, lines(u)) == 0 if kind(u) == "text" else r == u

    def judge(op, b, f, u, r, added, old_left, fork_moved):
        """-> (category or None, who may record the decision, upstream lines missing). The contract, cell by cell."""
        if u is None and fork_moved and f == b:
            return ("deleted-dropped", "theirs", 0) if r is None else ("deleted-kept", "ours", 0)
        if f == b or (f == u and op in ("A", "R", "D")):
            if u is None:
                return ("deleted-kept", None, 0) if r is not None else (None, None, 0)
            if old_left:
                return "deleted-kept", None, 0
            if op in ("A", "R"):
                if holds(r, u):
                    return None, None, 0
                if op == "R":
                    return ("renamed-missing", None, 0) if r is None else ("renamed-truncated", "either", 0)
                return ("added-missing" if r is None else "added-truncated"), "either", 0
            return (None, None, 0) if same(r, u) else ("not-upstream", None, 0)
        if f == u:
            if r is None:
                return "merged-deleted", "theirs", 0
            if blank(r) and not blank(u):
                return "merged-emptied", "theirs", 0
            return (None, None, 0) if same(r, u) else ("not-upstream", None, 0)
        if u is None:
            return ("deleted-dropped", "theirs", 0) if r is None else ("deleted-kept", "ours", 0)
        if f is None:
            return "fork-deleted", ("ours" if r is None else "theirs"), 0
        if r is None:
            return "merged-deleted", "theirs", 0
        if r == f:
            return "kept-fork", "ours", 0
        if r == u:
            return "took-theirs", "theirs", 0
        if blank(r) and not blank(f) and not blank(u):
            return "merged-emptied", "theirs", 0
        if not mergeable(b, f, u):
            return "neither-side", None, 0
        want_mode = u[0] if b is not None and u[0] != b[0] else f[0]
        if kind(r) != "text" or r[0] != want_mode:
            return "mode-lost", "either", 0
        return None, None, lacks(r, added) + sum(retained(b, f, u, r).values() if b is not None else [])

    counts = collections.Counter()
    problems = []      # (kind, category, path, detail)
    warnings = []

    for status, old, new in changes(a.base, a.upstream):
        op = {"M": "M", "T": "M", "A": "A", "D": "D", "R": "R"}.get(status, "M")
        fpath = moved.get(old, old)
        fork_moved = fpath != old
        b = base.get(old) if op != "A" else None
        u = up.get(new) if op != "D" else None
        f = fork.get(new if op == "A" else fpath)
        if op == "R":
            r = res.get(new) if res.get(new) is not None else res.get(fpath if fpath != new else old)
            old_left = old in res and old != new
        elif op == "M":
            r, old_left = res.get(fpath), False
        elif op == "A":
            r, old_left = res.get(new), False
        else:
            r, old_left = res.get(fpath if fork_moved else old), False
        if r is None and op in ("A", "R") and u in result_versions and (f is None or f == b or f == u):
            r = u                     # a fork directory move can place the file elsewhere; its bytes are in the result
        path = new if op in ("A", "R") else (fpath if op == "M" else old)
        added = []
        if u is not None and f is not None and f != b and f != u and (b is not None or op == "A"):
            added = [l for l in (lines(u) if b is None else added_lines(a, env, old, new)) if l.strip()]
        category, who, missing = judge(op, b, f, u, r, added, old_left, fork_moved)
        if category is None:
            both = f not in (None, b) and f != u
            key = {"A": "added", "D": "deleted", "R": "renamed"}.get(op) or ("merged" if both else "took-upstream")
            counts[key] += 1
            if missing:
                gone = list((counted(added) - counted(lines(r))).elements())
                kept = list(retained(b, f, u, r)) if b is not None else []
                what = "lines" if gone else "lines removed by upstream are still present"
                warnings.append((path, missing, len(added) or missing, (gone or kept or [''])[:3], what))
            continue
        names = {path, old, new, fpath}
        cleared = (who in ("ours", "either") and names & ours.keys()) or (who in ("theirs", "either") and names & theirs.keys())
        if cleared:
            counts[category + " (allowed)"] += 1
        else:
            problems.append(("DECISION" if who in ("ours", "theirs") and category in DECISIONS else "FAIL", category, path, DETAIL[category]))

    print("| Category | Files |")
    print("|---|---:|")
    for key, value in sorted(counts.items()):
        print(f"| {key} | {value} |")
    if warnings:
        print(f"\nupstream-added lines missing from merged files ({len(warnings)} files; mapped through the fork's identity names):")
        for path, n, total, sample, what in warnings:
            print(f"- {path}: {n}/{total} {what}, e.g. {sample[0][:100]!r}")
    if problems:
        print("\nunexplained:")
        for kind_, category, path, detail in problems:
            print(f"- {kind_} {category}: {path} — {detail}")
    failed = bool(problems) or (a.strict_lines and bool(warnings))
    print("\nRESULT:", "UNEXPLAINED ENTRIES" if failed else "ACCEPTED")
    sys.exit(1 if failed else 0)


def added_lines(a, env, old, new):
    out = subprocess.run(["git", "-C", a.repo, "diff", "-U0", "--no-color", f"{a.base}:{old}", f"{a.upstream}:{new}"],
                         capture_output=True, env=env).stdout.decode("latin-1")
    return [l[1:] for l in out.split("\n") if l.startswith("+") and not l.startswith("+++")]


if __name__ == "__main__":
    main()
