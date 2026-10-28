#!/usr/bin/env python3
"""Classifies conflicting paths of a trial merge and prints a before/after table.

Input is the `conflicts.tsv` written by measure-conflicts.sh (path, index-stage mask, conflict type).
Causal classes for the baseline of LAB-198 (merge of OpenCode v1.19.4 into fork 2e6f66a9):

  names-*   conflicts that existed only because the fork renamed internal identifiers:
              names-scope      @opencode-ai/ -> @loginom-ai-agent/ (package manifests and imports)
              names-directory  packages/opencode -> packages/agent (git "file location")
              names-svckey     Effect service keys @opencode/Name -> @loginom-ai-agent/Name
              names-combined   needs more than one of the above
  the remaining classes describe why a path still conflicts after the names are upstream's again;
  they are keyed by path in RESIDUAL below. A path that no rule knows is reported as `unclassified`, which is
  what a new kind of divergence looks like after the next sync: add a rule and a catalog entry for it.

Usage:
  conflict-classes.py --before baseline-conflicts.tsv --after conflicts.tsv --residual forecast-tier1-conflicts.tsv
  conflict-classes.py --after conflicts.tsv        (single list, no baseline)
"""
import argparse
import collections
import re
import sys

# class id -> (title, rule over the path)
RESIDUAL = [
    ("external-names", "External names (env, user files)", lambda p: p in {
        "install",
        "packages/opencode/src/cli/upgrade.ts",
        "packages/opencode/src/share/share-next.ts",
        "packages/web/src/content/docs/cli.mdx",
    }),
    ("lockfile", "Generated lockfile", lambda p: p == "bun.lock"),
    ("manifest", "Manifests (name, version, fork dependencies)", lambda p: p.endswith("package.json")),
    ("ci-hygiene", "CI triggers and repository hygiene", lambda p: p.startswith(".github/") or p == ".gitignore"),
    ("doc-defect", "Fork documentation defect (blind path rewrite)", lambda p: p == "packages/web/src/content/docs/ecosystem.mdx"),
    ("install-structural", "Installation service (structural)", lambda p: "/installation/" in p or p.endswith("installation.test.ts")),
    ("content-tests", "Tests with the same fix on both sides", lambda p: p in {
        "packages/opencode/test/cli/run/run-process.test.ts",
        "packages/opencode/test/session/llm.test.ts",
    }),
    ("content-code", "Fork changes inside upstream code", lambda p: p in {
        "packages/opencode/script/build.ts",
        "packages/opencode/src/cli/cmd/tui.ts",
        "packages/opencode/src/provider/provider.ts",
        "packages/tui/src/app.tsx",
        "packages/tui/src/routes/home.tsx",
    }),
]
TITLES = {
    "names-scope": "Package scope (@opencode-ai/ -> @loginom-ai-agent/)",
    "names-directory": "Directory packages/opencode -> packages/agent",
    "names-svckey": "Effect service keys",
    "names-combined": "Combination of internal-name renames",
    **{key: title for key, title, _ in RESIDUAL},
    "unclassified": "Unclassified (new divergence: add a rule and a catalog entry)",
}
ORDER = ["names-scope", "names-directory", "names-svckey", "names-combined"] + [k for k, _, _ in RESIDUAL] + ["unclassified"]


def read(path, legacy_paths=False):
    """Reads conflicts.tsv. The baseline list uses the fork's former directory name for the agent package."""
    rows = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if parts and parts[0]:
                name = re.sub(r"^packages/agent(?=/)", "packages/opencode", parts[0]) if legacy_paths else parts[0]
                rows[name] = parts[2] if len(parts) > 2 else ""
    return rows


def residual_class(path):
    for key, _, rule in RESIDUAL:
        if rule(path):
            return key
    return None


def classify(path, kind, residual_paths):
    if residual_paths is not None and path not in residual_paths:
        # Present only in the baseline: caused by the rename of internal identifiers.
        if kind == "file-location":
            return "names-directory"
        if path.startswith("packages/stats/") and kind.startswith("modify/delete"):
            return "names-svckey"  # upstream deleted a file the fork had only re-keyed
        if path.endswith("share-next.test.ts"):
            return "names-combined"
        return "names-scope"
    return residual_class(path) or "unclassified"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before")
    ap.add_argument("--after", required=True)
    ap.add_argument("--residual", help="conflicts when only internal names are restored (forecast-tier1-conflicts.tsv)")
    a = ap.parse_args()
    after = read(a.after)
    residual = set(read(a.residual)) if a.residual else None
    counts_after = collections.Counter(classify(p, k, None) for p, k in after.items())
    counts_before = collections.Counter()
    if a.before:
        counts_before = collections.Counter(classify(p, k, residual) for p, k in read(a.before, legacy_paths=True).items())

    print("| Class | Before | After |")
    print("|---|---:|---:|")
    for key in ORDER:
        if counts_before[key] or counts_after[key]:
            print(f"| {TITLES[key]} | {counts_before[key] if a.before else '—'} | {counts_after[key]} |")
    print(f"| **Total** | **{sum(counts_before.values()) if a.before else '—'}** | **{sum(counts_after.values())}** |")
    print()
    print("Remaining paths:")
    for path in sorted(after, key=lambda p: (ORDER.index(classify(p, after[p], None)), p)):
        print(f"- `{path}` — {TITLES[classify(path, after[path], None)]} ({after[path] or 'content'})")
    if counts_after["unclassified"]:
        sys.exit(4)


if __name__ == "__main__":
    main()
