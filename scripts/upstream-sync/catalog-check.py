#!/usr/bin/env python3
"""Keeps docs/upstream-sync/catalog.md honest: every file in which the fork differs from upstream belongs to a catalog entry.

catalog.json lists entries with path globs (first match wins; `**` crosses directories, `*` does not). The tool takes
the files that exist in the upstream revision (--against) and differ in the working tree (modified, mode or type changed,
deleted or renamed; files the fork added, copies included, are fork-owned and out of scope). The working tree, not HEAD, so that the check also covers a resolved merge
before its commit, staged or not, new files included; the repository's own index is not touched (a temporary copy of it, with its own file time, is used), assigns each to an entry and fails when:
  * a divergent file matches no entry          (new divergence nobody has described: add or extend an entry);
  * an entry matches no divergent file          (stale entry: remove or narrow it);
  * an entry id is missing from catalog.md, or catalog.md describes an id that catalog.json does not have.

Usage: catalog-check.py [--repo DIR] [--catalog docs/upstream-sync/catalog.json] [--against REV] [--summary]
`--against` defaults to the revision recorded in catalog.json ("against"); after an upstream update it moves to the
merged tag's commit.
"""
import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile


def glob_regex(pattern):
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"; i += 3
        elif pattern.startswith("**", i):
            out += ".*"; i += 2
        elif pattern[i] == "*":
            out += "[^/]*"; i += 1
        elif pattern[i] == "?":
            out += "[^/]"; i += 1
        else:
            out += re.escape(pattern[i]); i += 1
    return re.compile("^" + out + "$")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--catalog", default="docs/upstream-sync/catalog.json")
    ap.add_argument("--against")
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()
    repo = a.repo
    spec = json.load(open(os.path.join(repo, a.catalog), encoding="utf-8"))
    against = a.against or spec["against"]
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C")
    with tempfile.TemporaryDirectory() as tmp:
        index = os.path.join(tmp, "index")
        shutil.copy2(subprocess.run(["git", "-C", repo, "rev-parse", "--path-format=absolute", "--git-path", "index"],
                                    capture_output=True, check=True, env=env).stdout.decode().strip(), index)   # copy2: git's racy-entry check needs the index's own time
        tree_env = dict(env, GIT_INDEX_FILE=index)
        subprocess.run(["git", "-C", repo, "add", "-A"], capture_output=True, check=True, env=tree_env)
        raw = subprocess.run(["git", "-C", repo, "diff", "--cached", "-l30000", "-M", "--name-status", "-z", against],
                             capture_output=True, check=True, env=tree_env).stdout.split(b"\0")
    divergent, i = [], 0
    while i < len(raw) - 1:
        st = raw[i].decode(); i += 1
        if st[0] == "R":
            divergent.append(raw[i + 1].decode()); i += 2      # classify by the path the fork uses now
        else:
            if st[0] in "MDT":
                divergent.append(raw[i].decode())
            i += 1

    entries = [(e["id"], [glob_regex(p) for p in e["paths"]]) for e in spec["entries"]]
    hits = collections.defaultdict(list)
    unmatched = []
    for path in sorted(set(divergent)):
        for entry_id, rxs in entries:
            if any(rx.match(path) for rx in rxs):
                hits[entry_id].append(path)
                break
        else:
            unmatched.append(path)

    problems = []
    if unmatched:
        problems.append(f"{len(unmatched)} divergent files match no catalog entry, e.g.: " + ", ".join(unmatched[:8]))
    stale = [entry_id for entry_id, _ in entries if not hits[entry_id]]
    if stale:
        problems.append("entries without divergent files: " + ", ".join(stale))
    doc = open(os.path.join(repo, os.path.dirname(a.catalog), "catalog.md"), encoding="utf-8").read()
    ids = {entry_id for entry_id, _ in entries}
    documented = set(re.findall(r"^##+ (CAT-\d+)\b", doc, re.M))
    if ids - documented:
        problems.append("ids missing from catalog.md: " + ", ".join(sorted(ids - documented)))
    if documented - ids:
        problems.append("catalog.md describes ids absent from catalog.json: " + ", ".join(sorted(documented - ids)))

    if a.summary or not problems:
        print(f"against {against[:12]}: {len(set(divergent))} divergent upstream files")
        for entry_id, _ in entries:
            print(f"  {entry_id}: {len(hits[entry_id])}")
    for problem in problems:
        print("PROBLEM:", problem, file=sys.stderr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
