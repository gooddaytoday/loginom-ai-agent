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
  not-upstream      fork never touched it, result differs from upstream                                  FAIL
  added-missing     upstream added a file and nothing equal to it exists in the result                  FAIL
  deleted-kept      upstream deleted a file the fork changed and the result keeps it                    DECISION
  deleted-dropped   upstream deleted a file the fork changed and the result deletes it                  DECISION

FAIL and DECISION entries are accepted only through --allow-ours / --allow-theirs files whose lines are
`path  # reason`: the reason is the recorded owner decision (see docs/upstream-sync/catalog.md for ownership policies).
--allow-ours covers kept-fork, deleted-kept; --allow-theirs covers took-theirs, deleted-dropped.

Usage: verify-accepted.py --repo DIR --base SHA --fork SHA --upstream SHA [--allow-ours F] [--allow-theirs F] [--strict-lines]
Exit code 0: every upstream change is accounted for; 1: unexplained entries.
"""
import argparse
import collections
import os
import re
import subprocess
import sys

# The fork spells some external identifiers differently; upstream lines are compared after the same mapping.
IDENTITY = [
    (re.compile(r"\bOPENCODE_(?!API_KEY|GO_API_KEY)"), "LOGINOM_AI_AGENT_"),
    (re.compile(r"(?<![\w-])\.opencode(?![\w-])"), ".loginom-ai-agent"),
    (re.compile(r"(?<![\w-])opencode\.(json|jsonc|db)"), r"loginom-ai-agent.\1"),
]


def identity(line):
    for rx, rep in IDENTITY:
        line = rx.sub(rep, line)
    return line


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
                out[path.decode()] = meta.split()[2].decode()
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

    counts = collections.Counter()
    problems = []      # (category, path, detail)
    warnings = []
    for status, old, new in changes(a.base, a.upstream):
        path = moved.get(new if status != "D" else old, new if status != "D" else old)
        if status == "M":
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
                counts["merged"] += 1
                if r is not None and f != u:
                    added = [l for l in lines_added(a, env, old, new) if l.strip()]
                    present = collections.Counter(blob_lines(a, env, r))
                    missing = [l for l in added if not (present[l] > 0 or present[identity(l)] > 0)]
                    if missing:
                        warnings.append((path, len(missing), len(added), missing[:3]))
        elif status == "A":
            if path in res or up[new] in result_blobs or new in res:
                counts["added"] += 1
            elif path in theirs or path in ours:
                counts["added-missing (allowed)"] += 1
            else:
                problems.append(("FAIL added-missing", path, "upstream added the file; nothing equal to it exists in the result"))
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
            if new in res or up[new] in result_blobs or moved.get(new, new) in res:
                counts["renamed"] += 1
            else:
                problems.append(("FAIL renamed-missing", new, f"upstream renamed {old}; the new path is absent from the result"))

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
