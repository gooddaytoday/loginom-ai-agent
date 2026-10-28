#!/usr/bin/env python3
"""Возврат внутренних имён upstream (OpenCode) в дереве форка.

Обратное преобразование к script/migration/rebrand.py (классы svckey, scope, pkgdir):
  scope   @loginom-ai-agent/<пакет upstream>  -> @opencode-ai/<пакет>
          @loginom-ai-agent/agent             -> opencode          (пакет packages/opencode)
  svckey  "@loginom-ai-agent/<Ключ>"          -> "@opencode/<Ключ>"   (ключи сервисов Effect)
  pkgdir  packages/agent                      -> packages/opencode
Пакеты форка (product, loginom-host, runtime, site, evals) сохраняют область @loginom-ai-agent.
Внешние имена (LOGINOM_AI_AGENT_*, .loginom-ai-agent, loginom-ai-agent.json…) не трогаются.

Правка построчная и опирается на общую базу: строка форка, равная прямому преобразованию строки
базы, заменяется строкой базы дословно (там, где обратная замена неоднозначна, например
`../agent/agent` — это каталог src/agent, а не пакет), остальные строки получают обратные замены.

Использование: revert-names.py --repo DIR --base SHA [--apply] [--report FILE]
Без --apply ничего не пишет (сухой прогон со статистикой).

Историческая справка (LAB-198 / S2): применён один раз к дереву 2e6f66a9 после `git mv packages/agent packages/opencode`
(base = 501ff62c); результат — коммит «restore upstream internal package names». Повторный запуск на уже обработанном
дереве отказывает (EXTRA_EDITS не находят прежний текст). После него bun.lock обрабатывает rename-lock.py, затем `bun install`
версией bun из packageManager. Прямая замена форка — script/migration/rebrand.py (не запускать: она вернёт старые имена).
"""
import argparse, difflib, json, os, re, subprocess, sys

# Пакеты форка: области не меняем.
FORK_ONLY = {"product", "loginom-host", "runtime", "site", "evals"}
# Не трогаем: исторические документы и сам инструмент прямой замены, сгенерированные lock-файлы.
SKIP_PREFIX = ("script/migration/", "docs/superpowers/", "docs/archive/", "docs/node-development/", "docs/migration/",
               "reports/", "node_modules/", "evals/docs/")
SKIP_FILES = {"bun.lock", "WINDOWS_IMPLEMENTATION_PLAN.md"}
# Отчёты о прошлых прогонах описывают состояние на момент прогона: пути в них не переписываем.
SKIP_RX = re.compile(r"(^|/)(reports|history)/")


# Path references the line pass cannot decide (the directory is built from segments or the relative path is
# ambiguous with the src/agent module). Each entry: file, old text, new text, expected number of occurrences.
EXTRA_EDITS = [
    ("packages/desktop/electron.vite.config.ts", '"../agent/dist/node"', '"../opencode/dist/node"', 1),
    ("packages/desktop/scripts/prebuild.ts", 'resolve(packageDirectory, "../agent")', 'resolve(packageDirectory, "../opencode")', 1),
    ("packages/desktop/scripts/predev.ts", 'resolve(packageDirectory, "../agent")', 'resolve(packageDirectory, "../opencode")', 1),
    ("packages/desktop/scripts/check-macos.ts", 'package: "agent"', 'package: "opencode"', 2),
    ("packages/loginom-host/test/skills-acceptance-turns.test.ts", '"../../agent/test/cli/package-docs-routing/cases.json"', '"../../opencode/test/cli/package-docs-routing/cases.json"', 2),
    ("packages/loginom-runtime/AGENTS.md", "`../agent/src/provider/transform.ts`", "`../opencode/src/provider/transform.ts`", 1),
    ("evals/src/cli.ts", 'path.join(repoRoot, "packages", "agent")', 'path.join(repoRoot, "packages", "opencode")', 1),
    ("evals/test/cli.test.ts", 'path.join("packages", "agent")', 'path.join("packages", "opencode")', 1),
    ("packages/opencode/test/server/session-list.test.ts", '"packages", "agent"', '"packages", "opencode"', 4),
    ("packages/opencode/test/server/httpapi-session.test.ts", '"packages", "agent"', '"packages", "opencode"', 1),
    # scope written as a separate path segment (the fixture directory of a fake plugin package)
    ("packages/opencode/test/tool/registry.test.ts", '"node_modules", "@loginom-ai-agent", "plugin"', '"node_modules", "@opencode-ai", "plugin"', 1),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--report")
    a = ap.parse_args()
    repo = a.repo
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C")

    def git(*args, inp=None):
        return subprocess.run(["git", "-C", repo, *args], input=inp, capture_output=True, check=True, env=env).stdout

    # Рабочие пакеты upstream: имена @opencode-ai/<X> в базе (каталоги packages/**, кроме исключённых rebrand.py).
    excluded_pkg = ("packages/loginom-runtime/",)
    upstream_pkgs = set()
    for p in git("ls-tree", "-r", "--name-only", a.base).decode().splitlines():
        if p.startswith("packages/") and p.endswith("/package.json") and not p.startswith(excluded_pkg):
            try:
                name = json.loads(git("show", f"{a.base}:{p}")).get("name", "")
            except Exception:
                continue
            if name.startswith("@opencode-ai/"):
                upstream_pkgs.add(name.split("/", 1)[1])
    upstream_pkgs.discard("")

    scope_rx = re.compile(r"@loginom-ai-agent/([A-Za-z0-9_-]+)")

    def inv_scope(m):
        t = m.group(1)
        rest = m.string[m.end():m.end() + 2]
        if t == "agent":
            return "opencode"
        if t in FORK_ONLY:
            return m.group(0)
        if t in ("cli", "stats") and re.match(r"/[A-Z]", rest):
            return "@opencode/" + t          # ключ сервиса @opencode/cli/Имя
        if t in upstream_pkgs:
            return "@opencode-ai/" + t
        return "@opencode/" + t              # ключи сервисов: @opencode/Имя, @opencode/v2/…, @opencode/acme

    pkgdir_rx = re.compile(r"packages/agent(?![\w-])")

    def inv(line):
        if "@loginom-ai-agent/" in line:
            line = scope_rx.sub(inv_scope, line)
        if "packages/agent" in line:
            line = pkgdir_rx.sub("packages/opencode", line)
        return line

    fwd_scope_rx = re.compile(r"@opencode-ai/([a-zA-Z0-9_-]+)")

    def fwd(line):
        line = fwd_scope_rx.sub(lambda m: "@loginom-ai-agent/" + m.group(1) if m.group(1) in upstream_pkgs else m.group(0), line)
        line = line.replace("packages/opencode", "packages/agent").replace("../opencode", "../agent")
        line = line.replace("@opencode/", "@loginom-ai-agent/")
        return line

    # Пары путей база -> HEAD.
    raw = git("diff", "-l30000", "-M", "--name-status", "-z", a.base, "HEAD").split(b"\0")
    base_of, i = {}, 0
    while i < len(raw) - 1:
        st = raw[i].decode(); i += 1
        if st[0] == "R":
            base_of[raw[i + 1].decode()] = raw[i].decode(); i += 2
        else:
            if st[0] == "M":
                base_of[raw[i].decode()] = raw[i].decode()
            i += 1

    entries = []
    for rec in git("ls-tree", "-r", "-z", "HEAD").split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, typ, sha = meta.decode().split()
            if mode in ("100644", "100755"):
                entries.append((mode, sha, path.decode()))

    stats = {"files_changed": 0, "oracle_files": 0, "no_base_files": 0, "lines_oracle_restored": 0, "lines_inverted": 0}
    changes = []   # (path, lineno, before, after, kind)
    for mode, sha, path in entries:
        if path in SKIP_FILES or path.startswith(SKIP_PREFIX) or SKIP_RX.search(path):
            continue
        if path.startswith("docs/") and not re.fullmatch(r"docs/testing/loginom-ai-agent/[^/]+\.md", path):
            continue
        raw_b = git("cat-file", "blob", sha)
        if b"\0" in raw_b:
            continue
        try:
            text = raw_b.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if "@loginom-ai-agent/" not in text and "packages/agent" not in text and "../agent" not in text:
            continue
        lines = text.split("\n")
        bp = base_of.get(path)
        base_lines = None
        if bp is not None:
            try:
                bt = git("cat-file", "blob", f"{a.base}:{bp}")
                if b"\0" not in bt:
                    base_lines = bt.decode("utf-8").split("\n")
            except Exception:
                base_lines = None
        out = []
        if base_lines is not None:
            stats["oracle_files"] += 1
            tb = [fwd(l) for l in base_lines]
            sm = difflib.SequenceMatcher(None, tb, lines, autojunk=False)
            for op, i1, i2, j1, j2 in sm.get_opcodes():
                if op == "equal":
                    for k in range(i2 - i1):
                        if base_lines[i1 + k] != lines[j1 + k]:
                            stats["lines_oracle_restored"] += 1
                            changes.append((path, j1 + k + 1, lines[j1 + k], base_lines[i1 + k], "oracle"))
                    out.extend(base_lines[i1:i2])
                else:
                    for k, l in enumerate(lines[j1:j2]):
                        n = inv(l)
                        if n != l:
                            stats["lines_inverted"] += 1
                            changes.append((path, j1 + k + 1, l, n, "inverse"))
                        out.append(n)
        else:
            stats["no_base_files"] += 1
            for k, l in enumerate(lines):
                n = inv(l)
                if n != l:
                    stats["lines_inverted"] += 1
                    changes.append((path, k + 1, l, n, "inverse-nobase"))
                out.append(n)
        new_text = "\n".join(out)
        if new_text != text:
            stats["files_changed"] += 1
            if a.apply:
                with open(os.path.join(repo, path), "w", encoding="utf-8", newline="") as f:
                    f.write(new_text)

    if a.apply:
        for path, old, new, expected in EXTRA_EDITS:
            full = os.path.join(repo, path)
            with open(full, encoding="utf-8", newline="") as f:
                text = f.read()
            if text.count(old) != expected:
                sys.exit(f"EXTRA_EDITS: {path}: expected {expected} x {old!r}, found {text.count(old)}")
            with open(full, "w", encoding="utf-8", newline="") as f:
                f.write(text.replace(old, new))
        stats["extra_edits"] = len(EXTRA_EDITS)
    stats["upstream_pkgs"] = sorted(upstream_pkgs)
    print(json.dumps(stats, ensure_ascii=False, indent=1), file=sys.stderr)
    if a.report:
        with open(a.report, "w", encoding="utf-8") as f:
            for c in changes:
                f.write("\t".join([c[0], str(c[1]), c[4], c[2].replace("\t", " ")[:300], c[3].replace("\t", " ")[:300]]) + "\n")


if __name__ == "__main__":
    main()
