#!/usr/bin/env python3
"""The acceptance gate: is a merge commit of the fork and an upstream commit the mechanical merge plus recorded decisions?

The gate looks at one commit, the merge commit, and at nothing else. It builds the oracle (merge_oracle.py: Git's own merge of
the two parents with the settings of `prepare`, plus apply-identity) and compares the merge commit's tree with it byte for byte.
Two kinds of path need a decision record in the merge commit itself, `docs/upstream-sync/merge-decisions.json`:

  conflict    the oracle's merge left the path conflicted: whatever the commit holds there was chosen by a person
  deviation   the path is not conflicted, and the commit holds other bytes (mode, type, or absence) than the oracle

A path without a record is a FAIL. A record without such a path is a FAIL too (stale). Everything else is accepted without
a judgment. The gate has no heuristics: it does not say that a conflict was resolved correctly in meaning. The reviewer judges
that from the records. Line-level observations (upstream-added lines missing, upstream-removed lines still present) are printed
as warnings next to recorded paths and never decide the result. Commits after the merge (build, fixes) are listed, not judged.

Decision file (format 1, committed together with the merge; the file itself is exempt from the comparison):
  {"format": 1, "decisions": [{"path": "<path>", "rule": "<rule>", "reason": "<why>"}]}
  rule: CAT-<n> (an entry of docs/upstream-sync/catalog.json in the same commit), ADR-<n>, STANDING-<n> or PROCEDURE-<n>,
  optionally followed by #anchor. reason: a sentence naming what was chosen and why.

Usage: verify-accepted.py --repo DIR --fork SHA --upstream SHA [--merge REV]
  --merge REV  the merge commit (default HEAD); its parents must be exactly --fork and --upstream
Exit code 0: ACCEPTED; 1: REJECTED; 2: the input is not a merge of these two commits.
"""
import argparse
import collections
import importlib.util
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


oracle_module = load("merge_oracle", "merge_oracle.py")
identity = oracle_module._identity.transform
git = oracle_module.git

DECISIONS_PATH = "docs/upstream-sync/merge-decisions.json"
CATALOG_PATH = "docs/upstream-sync/catalog.json"
FORMAT = 1
RULE = re.compile(r"^(CAT|ADR|STANDING|PROCEDURE)-(\d+)(#\S+)?$")


def read_decisions(repo, entries):
    """-> ({path: (rule, reason)}, [problem]) from the decision file in the merge commit's tree."""
    if DECISIONS_PATH not in entries:
        return {}, []
    try:
        doc = json.loads(git(repo, "cat-file", "blob", entries[DECISIONS_PATH][1])[1])
        assert type(doc["format"]) is int and doc["format"] == FORMAT and isinstance(doc["decisions"], list)
    except (ValueError, KeyError, TypeError, AssertionError):
        return {}, [("bad-record", DECISIONS_PATH, f"not a decision file of format {FORMAT}")]
    catalog_ids = set()
    if CATALOG_PATH in entries:
        catalog_ids = {e["id"] for e in json.loads(git(repo, "cat-file", "blob", entries[CATALOG_PATH][1])[1]).get("entries", [])}
    records, problems = {}, []
    for d in doc["decisions"]:
        path, rule, reason = (d.get(k) if isinstance(d, dict) else None for k in ("path", "rule", "reason"))
        if not (isinstance(path, str) and isinstance(rule, str) and isinstance(reason, str) and reason.strip()):
            problems.append(("bad-record", str(path), "a decision needs path, rule and reason"))
        elif not RULE.match(rule) or (rule.startswith("CAT-") and rule.split("#")[0] not in catalog_ids):
            problems.append(("bad-record", path, f"rule {rule!r} is not CAT-<n> of the catalog, ADR-<n>, STANDING-<n> or PROCEDURE-<n>"))
        elif path in records:
            problems.append(("bad-record", path, "two decisions for one path"))
        else:
            records[path] = (rule, reason.strip())
    return records, problems


def required(orc, result):
    """{path: (category, detail)} for every path that needs a decision."""
    need = {path: ("conflict", kind) for path, kind in orc.conflicts.items()}
    for path in set(orc.entries) | set(result):
        if path in need or path in orc.parked or path == DECISIONS_PATH or orc.entries.get(path) == result.get(path):
            continue
        want, got = orc.entries.get(path), result.get(path)
        need[path] = ("deviation", "absent from the oracle" if want is None else "missing from the commit" if got is None
                      else "mode or type differs from the oracle" if want[0] != got[0] else "content differs from the oracle")
    return need


def text_lines(repo, entry):
    if entry is None or entry[0] not in oracle_module.REGULAR:
        return None
    text = oracle_module.blob_text(repo, entry[1])
    return None if text is None else [identity(l) for l in text.split("\n") if l.strip()]


def line_warnings(repo, base_entries, up_entries, result, path):
    """Upstream lines the commit lacks at a recorded path, and lines upstream removed that it still holds."""
    base, up, res = (text_lines(repo, e.get(path)) for e in (base_entries, up_entries, result))
    if up is None or res is None:
        return []
    cb, cu, cr = (collections.Counter(x or []) for x in (base, up, res))
    lacking = sum(((cu - cb) - cr).values())
    kept = sum(max(cr[l] - cu[l], 0) for l in cb if cu[l] < cb[l])
    return [f"{what}: {n}" for what, n in (("upstream-added lines missing", lacking), ("upstream-removed lines still present", kept)) if n]


def main():
    ap = argparse.ArgumentParser()
    for key in ("repo", "fork", "upstream"):
        ap.add_argument("--" + key, required=True)
    ap.add_argument("--merge", default="HEAD")
    a = ap.parse_args()
    repo = a.repo
    merge = git(repo, "rev-parse", "--verify", a.merge + "^{commit}")[1].decode().strip()
    parents = git(repo, "rev-list", "--parents", "-n", "1", merge)[1].decode().split()[1:]
    if parents != [a.fork, a.upstream]:
        print(f"ERROR: {merge} has parents {parents}, not exactly the fork {a.fork} and upstream {a.upstream}", file=sys.stderr)
        sys.exit(2)

    orc = oracle_module.oracle(repo, a.fork, a.upstream)
    result = oracle_module.tree_entries(repo, merge)
    records, problems = read_decisions(repo, result)
    need = required(orc, result)
    for path, (category, detail) in sorted(need.items()):
        if path not in records:
            problems.append((category, path, detail))
    for path in sorted(set(records) - set(need)):
        problems.append(("stale-record", path, "recorded, but the commit matches the oracle there"))

    base = git(repo, "merge-base", a.fork, a.upstream)[1].decode().strip()
    base_entries, up_entries = oracle_module.tree_entries(repo, base), oracle_module.tree_entries(repo, a.upstream)
    warnings = []
    for path in sorted(set(records) & set(need)):
        warnings += [(path, w) for w in line_warnings(repo, base_entries, up_entries, result, path)]
    after = git(repo, "rev-list", "--reverse", f"{merge}..HEAD")[1].decode().split()

    print(f"merge {merge}  oracle tree {orc.tree}")
    print("| Paths | Count | Recorded |")
    print("|---|---:|---:|")
    kinds = collections.Counter(c for c, _ in need.values())
    for category in ("conflict", "deviation"):
        print(f"| {category} | {kinds[category]} | {sum(1 for p, (c, _) in need.items() if c == category and p in records)} |")
    print(f"| equal to the oracle | {len(set(result) - set(need) - {DECISIONS_PATH})} | |")
    if warnings:
        print(f"\nwarnings at recorded paths ({len({p for p, _ in warnings})}); they do not decide the result:")
        for path, text in warnings:
            print(f"- {path}: {text}")
    if after:
        print(f"\ncommits after the merge, not judged ({len(after)}):")
        for sha in after:
            print(f"- {git(repo, 'log', '-1', '--format=%h %s', sha)[1].decode().strip()}")
    if problems:
        print("\nunexplained:")
        for category, path, detail in problems:
            print(f"- FAIL {category}: {path} — {detail}")
    accepted = not problems
    print("\nRESULT:", "ACCEPTED" if accepted else "REJECTED")
    sys.exit(0 if accepted else 1)


if __name__ == "__main__":
    main()
