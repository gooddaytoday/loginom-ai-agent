#!/usr/bin/env python3
"""Переименовывает рабочие пакеты в bun.lock, не пересчитывая разрешение внешних зависимостей.

Использование: rename-lock.py REPO BASE_SHA. Историческая справка: применён вместе с revert-names.py (LAB-198 / S2); затем
`bun install` версией из packageManager привёл порядок записей к каноническому. Набор уникальных name@version при этом
не менялся."""
import json, re, subprocess, sys
repo, base = sys.argv[1], sys.argv[2]
env = dict(GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", PATH=__import__("os").environ["PATH"])
def git(*a): return subprocess.run(["git", "-C", repo, *a], capture_output=True, check=True, env=env).stdout
pk = set()
for p in git("ls-tree", "-r", "--name-only", base).decode().splitlines():
    if p.startswith("packages/") and p.endswith("/package.json") and not p.startswith("packages/loginom-runtime/"):
        n = json.loads(git("show", f"{base}:{p}")).get("name", "")
        if n.startswith("@opencode-ai/"): pk.add(n.split("/", 1)[1])
FORK_ONLY = {"product", "loginom-host", "runtime", "site", "evals"}
def sub(m):
    t = m.group(1)
    if t == "agent": return "opencode"
    if t in FORK_ONLY: return m.group(0)
    if t in pk: return "@opencode-ai/" + t
    raise SystemExit("unexpected scoped name in lock: " + m.group(0))
text = open(f"{repo}/bun.lock", encoding="utf-8").read()
text = re.sub(r"@loginom-ai-agent/([A-Za-z0-9_-]+)", sub, text)
text = text.replace('"packages/agent"', '"packages/opencode"').replace("workspace:packages/agent", "workspace:packages/opencode")
open(f"{repo}/bun.lock", "w", encoding="utf-8", newline="").write(text)
