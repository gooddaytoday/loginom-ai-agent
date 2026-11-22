#!/usr/bin/env python3
"""Gives the fork's external names to text that arrived from upstream.

Upstream spells the product identity as OPENCODE_* variables, `.opencode` directories, `opencode.json(c)` and
`opencode.db`. The fork ships LOGINOM_AI_AGENT_*, `.loginom-ai-agent`, `loginom-ai-agent.json(c)` and `loginom-ai-agent.db`
(external names, never reverted; see docs/upstream-sync/adr-0001-modular-integration.md). After a merge, new upstream code
and tests still carry the upstream spelling; this applies the fork's spelling to them. Third-party provider keys
(OPENCODE_API_KEY, OPENCODE_GO_API_KEY) are not product names and stay; so do upstream URLs, theme files and the variables
that only unprocessed code reads (see the constants below). Visible brand text ("OpenCode" in UI strings and
documents) is a product decision per string and is NOT changed here; see catalog entry CAT-03.

Usage: apply-identity.py --repo DIR [--since REV] [--check] [PATH ...]
  --since REV  only files that differ from REV in the working tree, staged or not, new or moved (use the pre-merge fork SHA
               while resolving a merge: HEAD is still the fork before the merge commit)
  --check      change nothing, list files that would change, exit 1 if any
Without PATHs it covers the source trees the guard test names.test.ts scans.
"""
import argparse
import os
import re
import subprocess
import sys

SOURCES = re.compile(
    r"^(packages/(ai|app|cli|client|core|desktop|gui-plugins|loginom-host|loginom-runtime|plugin[^/]*|product|schema|script|server|session-ui|"
    r"simulation|sdk|tui|ui|util)/(src|script|scripts|test|tests|e2e|test-browser|bin)/"
    r"|packages/[^/]+/(package\.json|[^/]*\.config(\.test)?\.ts|vite\.js)$|script/|\.github/)"
)
TEXT = re.compile(r"\.(ts|tsx|js|mjs|cjs|json|jsonc|yml|yaml|ps1|sh|txt|md)$")
PROVIDER_KEYS = ("OPENCODE_API_KEY", "OPENCODE_GO_API_KEY")
# Set by workflows and read only by packages/process-daemon (build.rs, script/release-bin/zig), which this tool does not
# process: renaming one side would silently drop the setting (catalog entry CAT-13).
UNPROCESSED_READERS = ("OPENCODE_ZIG_CPU", "OPENCODE_REAL_ZIG")
# A name also starts right after an escape such as `\n` in a string or a regular expression.
VARIABLE = re.compile(r"(?:\b|(?<=\\[nrt]))OPENCODE_[A-Z0-9_]+")
# `.opencode` as a path segment, not a property (`?.opencode`, `...opencode`) or an escaped host (`console\.opencode\.ai`).
PATH_NAME = re.compile(r"(?<![\w$.?!)\]])\.opencode(?=[/\s\"'`)]|\\(?!\.)|$)|opencode\.(json|db|settings|updater)")
# Upstream URLs (`formulae.brew.sh/api/formula/opencode.json`) and theme files (`theme/assets/opencode.json`) keep their names.
UNTOUCHED = re.compile(r"https?://[^\s\"'`<>]+|\bassets/[\w./-]*")
# Archived upstream workflows keep upstream spelling; the guard test spells inherited OPENCODE_* names on purpose; the TUI
# snapshot test renders sample tool output that names OPENCODE_* variables, and its .snap file (not text here) wraps it;
# the drizzle-kit config points at an upstream developer's own database, and a changed line would make that path ours.
EXCLUDED = (".github/archived/", "packages/cli/test/flag-identity.test.ts", "packages/core/drizzle.config.ts",
            "packages/tui/test/cli/tui/inline-tool-wrap-snapshot.test.tsx", "scripts/upstream-sync/")


def wants(path):
    """The files this tool covers when no PATHs are named: source trees the guard test scans, text only."""
    return not path.startswith(EXCLUDED) and bool(SOURCES.match(path) and TEXT.search(path))


def transform(text):
    keep = PROVIDER_KEYS + UNPROCESSED_READERS
    text = VARIABLE.sub(lambda m: m.group(0) if m.group(0) in keep else "LOGINOM_AI_AGENT_" + m.group(0)[len("OPENCODE_"):], text)
    untouched = [m.span() for m in UNTOUCHED.finditer(text)]
    return PATH_NAME.sub(lambda m: m.group(0) if any(a <= m.start() < b for a, b in untouched)
                         else m.group(0).replace("opencode", "loginom-ai-agent"), text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--since")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("paths", nargs="*")
    a = ap.parse_args()
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C")
    if a.paths:
        files = a.paths
    elif a.since:
        changed_since = subprocess.run(["git", "-C", a.repo, "diff", "--name-only", "--no-renames", "--diff-filter=AM", a.since],
                                       capture_output=True, check=True, env=env).stdout.decode().splitlines()
        untracked = subprocess.run(["git", "-C", a.repo, "ls-files", "--others", "--exclude-standard"],
                                   capture_output=True, check=True, env=env).stdout.decode().splitlines()
        files = changed_since + untracked
    else:
        files = subprocess.run(["git", "-C", a.repo, "ls-files"], capture_output=True, check=True, env=env).stdout.decode().splitlines()
    changed = []
    for path in files:
        if path.startswith(EXCLUDED) or not (a.paths or wants(path)):
            continue
        full = os.path.join(a.repo, path)
        if not os.path.isfile(full) or os.path.islink(full):
            continue
        try:
            old = open(full, encoding="utf-8", newline="").read()
        except UnicodeDecodeError:
            continue
        new = transform(old)
        if new != old:
            changed.append(path)
            if not a.check:
                open(full, "w", encoding="utf-8", newline="").write(new)
    for path in changed:
        print(path)
    print(f"{'would change' if a.check else 'changed'}: {len(changed)} files", file=sys.stderr)
    if a.check and changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
