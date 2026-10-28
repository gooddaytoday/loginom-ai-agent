#!/usr/bin/env python3
"""Gives the fork's external names to text that arrived from upstream.

Upstream spells the product identity as OPENCODE_* variables, `.opencode` directories, `opencode.json(c)` and
`opencode.db`. The fork ships LOGINOM_AI_AGENT_*, `.loginom-ai-agent`, `loginom-ai-agent.json(c)` and `loginom-ai-agent.db`
(external names, never reverted; see docs/upstream-sync/adr-0001-modular-integration.md). After a merge, new upstream code
and tests still carry the upstream spelling; this applies the fork's spelling to them. Third-party provider keys
(OPENCODE_API_KEY, OPENCODE_GO_API_KEY) are not product names and stay. Visible brand text ("OpenCode" in UI strings and
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
    r"^(packages/(opencode|core|desktop|loginom-host|loginom-runtime|product|app|cli|server|schema|tui|ui|session-ui|sdk|enterprise)/(src|script|scripts|test|tests|e2e|test-browser|bin)/"
    r"|packages/[^/]+/(package\.json|[^/]*\.config\.ts)$|script/|\.github/)"
)
TEXT = re.compile(r"\.(ts|tsx|js|mjs|cjs|json|jsonc|yml|yaml|ps1|sh|txt|md)$")
PROVIDER_KEYS = ("OPENCODE_API_KEY", "OPENCODE_GO_API_KEY")
# Archived upstream workflows keep upstream spelling; the guard test spells inherited OPENCODE_* names on purpose.
EXCLUDED = (".github/archived/", "packages/core/test/flag-identity.test.ts", "scripts/upstream-sync/")


def wants(path):
    """The files this tool covers when no PATHs are named: source trees the guard test scans, text only."""
    return not path.startswith(EXCLUDED) and bool(SOURCES.match(path) and TEXT.search(path))


def transform(text):
    text = re.sub(r"\bOPENCODE_[A-Z0-9_]+", lambda m: m.group(0) if m.group(0) in PROVIDER_KEYS else "LOGINOM_AI_AGENT_" + m.group(0)[len("OPENCODE_"):], text)
    text = re.sub(r"(?<![a-zA-Z0-9])\.opencode(?=[/\\\s\"'`)]|$)", ".loginom-ai-agent", text)
    for source, target in (("opencode.json", "loginom-ai-agent.json"), ("opencode.db", "loginom-ai-agent.db"),
                           ("opencode.settings", "loginom-ai-agent.settings"), ("opencode.updater", "loginom-ai-agent.updater")):
        text = text.replace(source, target)
    return text


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
