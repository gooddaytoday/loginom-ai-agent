#!/usr/bin/env python3
"""Контрфактический коммит: форк с возвращёнными именами upstream.

Строит синтетический дочерний коммит FORK_SHA, в котором выбранные классы механических
переименований возвращены к виду upstream. Родитель — FORK_SHA, поэтому база слияния с upstream
не меняется. Печатает SHA коммита; его подают в measure-conflicts.sh как FORK_SHA, чтобы получить
число конфликтов «если бы расхождений по этим именам не было».

Это инструмент прогноза, а не предложение коммита: возврат внешних имён (env, имена файлов
конфигурации) ломает совместимость и возможен лишь через адаптер идентичности.

Классы:
  scope      @loginom-ai-agent/ -> @opencode-ai/                      (внутреннее имя пакета)
  svckey     @loginom-ai-agent/Имя -> @opencode/Имя                  (внутренний ключ сервиса Effect)
  pkgdir     packages/agent -> packages/opencode, пути и ссылки       (внутреннее расположение)
  env        LOGINOM_AI_AGENT_ -> OPENCODE_                           (внешнее: переменные окружения)
  userfiles  .loginom-ai-agent -> .opencode;                          (внешнее: каталог проекта,
             loginom-ai-agent.{json,jsonc,global.dat,settings.dat}     файлы конфигурации и данных)

Правка содержимого — построчная: строка форка, равная прямому преобразованию строки базы, заменяется
строкой базы дословно; остальные строки получают обратные замены. Содержимое правится только в
файлах, которые меняла и ветка upstream (остальные не влияют на конфликты).

Использование:
  counterfactual-names.py --repo DIR --base SHA --fork SHA --upstream SHA \
      --classes svckey,scope,pkgdir[,env,userfiles] [--report FILE] [--all-files]
"""
import argparse, difflib, json, os, re, subprocess, sys, tempfile

CLASSES = {
    # имя: (прямые замены base->fork, обратные замены fork->base, префиксы путей fork->base)
    # svckey стоит перед scope: обратная замена ключей сервиса должна сработать раньше общей замены пакетов.
    "svckey": ([(r'(?<=")@opencode/', "@loginom-ai-agent/")],
              [(r'(?<=")@loginom-ai-agent/(?=[A-Z]|cli/[A-Z]|stats/[A-Z])', "@opencode/")], []),
    "scope": ([(r"@opencode-ai/", "@loginom-ai-agent/")],
              [(r"@loginom-ai-agent/", "@opencode-ai/")], []),
    "pkgdir": ([(r"packages/opencode(?![\w-])", "packages/agent")],
               [(r"packages/agent(?![\w-])", "packages/opencode")],
               [("packages/agent/", "packages/opencode/")]),
    "env": ([(r"OPENCODE_", "LOGINOM_AI_AGENT_")],
            [(r"LOGINOM_AI_AGENT_", "OPENCODE_")], []),
    "userfiles": ([(r"(?<!\w)\.opencode(?![\w-])", ".loginom-ai-agent"),
                   (r"(?<![\w-])opencode\.(json|jsonc|global\.dat|settings\.dat)", r"loginom-ai-agent.\1")],
                  [(r"(?<!\w)\.loginom-ai-agent(?![\w-])", ".opencode"),
                   (r"(?<![\w-])loginom-ai-agent\.(json|jsonc|global\.dat|settings\.dat)", r"opencode.\1")],
                  [(".loginom-ai-agent/", ".opencode/")]),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--fork", required=True)
    ap.add_argument("--upstream", required=True)
    ap.add_argument("--classes", required=True)
    ap.add_argument("--report")
    ap.add_argument("--all-files", action="store_true",
                    help="править содержимое всех файлов, а не только тронутых upstream (для оценки расхождений)")
    a = ap.parse_args()
    asked = [c for c in a.classes.split(",") if c]
    for c in asked:
        if c not in CLASSES:
            sys.exit(f"неизвестный класс: {c}")
    names = [c for c in CLASSES if c in asked]   # порядок применения — порядок объявления
    fwd = [(re.compile(p), r) for c in names for p, r in CLASSES[c][0]]
    inv = [(re.compile(p), r) for c in names for p, r in CLASSES[c][1]]
    prefixes = [x for c in names for x in CLASSES[c][2]]

    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1",
               GIT_AUTHOR_NAME="sync-measure", GIT_AUTHOR_EMAIL="sync-measure@example.invalid",
               GIT_COMMITTER_NAME="sync-measure", GIT_COMMITTER_EMAIL="sync-measure@example.invalid",
               GIT_AUTHOR_DATE="2026-01-01T00:00:00Z", GIT_COMMITTER_DATE="2026-01-01T00:00:00Z")

    def git(*args, inp=None, e=None):
        return subprocess.run(["git", "-C", a.repo, *args], input=inp, capture_output=True, check=True,
                              env=e or env).stdout

    def apply(rules, s):
        for rx, rep in rules:
            s = rx.sub(rep, s)
        return s

    def move(path):
        for src, dst in prefixes:
            if path.startswith(src):
                return dst + path[len(src):]
        return path

    # Пары путей база -> форк и множество путей, изменённых в upstream.
    def name_status(x, y):
        out = git("diff", "-l30000", "-M", "--name-status", "-z", x, y).split(b"\0")
        res, i = [], 0
        while i < len(out) - 1:
            st = out[i].decode(); i += 1
            if st[0] == "R":
                res.append((st[0], out[i].decode(), out[i + 1].decode())); i += 2
            else:
                res.append((st[0], out[i].decode(), out[i].decode())); i += 1
        return res

    base_of = {}                       # путь форка -> путь базы
    for st, old, new in name_status(a.base, a.fork):
        if st in "MR":
            base_of[new] = old
    up_changed = set()
    for st, old, new in name_status(a.base, a.upstream):
        up_changed.update((old, new))

    entries = []                       # (mode, type, sha, path)
    for rec in git("ls-tree", "-r", "-z", a.fork).split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, typ, sha = meta.decode().split()
            entries.append((mode, typ, sha, path.decode()))

    def blob(spec):
        return git("cat-file", "blob", spec)

    def decode(b):
        if b"\0" in b:
            return None
        try:
            return b.decode("utf-8")
        except UnicodeDecodeError:
            return None

    report = {"classes": names, "moved": 0, "content_rewritten": 0, "exact_base_restored": 0,
              "roundtrip_failures": [], "skipped_binary": []}
    index_lines = []
    for mode, typ, sha, path in entries:
        new_path = move(path)
        new_sha = sha
        base_path = base_of.get(path, path if path in up_changed else None)
        touched_by_upstream = a.all_files or (base_path in up_changed) or (path in up_changed) or (new_path in up_changed)
        if touched_by_upstream and mode in ("100644", "100755") and (inv or prefixes):
            raw = blob(sha)
            text = decode(raw)
            if text is None:
                report["skipped_binary"].append(path)
            else:
                fork_lines = text.split("\n")
                base_text = None
                if path in base_of or (path in up_changed):
                    try:
                        base_text = decode(blob(f"{a.base}:{base_of.get(path, path)}"))
                    except subprocess.CalledProcessError:
                        base_text = None
                if base_text is not None:
                    base_lines = base_text.split("\n")
                    tb = [apply(fwd, l) for l in base_lines]
                    sm = difflib.SequenceMatcher(None, tb, fork_lines, autojunk=False)
                    out = []
                    for op, i1, i2, j1, j2 in sm.get_opcodes():
                        if op == "equal":
                            out.extend(base_lines[i1:i2])
                        else:
                            out.extend(apply(inv, l) for l in fork_lines[j1:j2])
                else:
                    out = [apply(inv, l) for l in fork_lines]
                new_text = "\n".join(out)
                if new_text != text:
                    # проверка круговой согласованности: прямое преобразование результата должно дать форк
                    if apply(fwd, new_text) != text:
                        report["roundtrip_failures"].append(path)
                    new_sha = git("hash-object", "-w", "--stdin", inp=new_text.encode("utf-8")).decode().strip()
                    report["content_rewritten"] += 1
                    if base_text is not None and new_text == base_text:
                        report["exact_base_restored"] += 1
        if new_path != path:
            report["moved"] += 1
            index_lines.append(f"0 {'0' * 40}\t{path}")
        if new_path != path or new_sha != sha:
            index_lines.append(f"{mode} {new_sha}\t{new_path}")

    idx = tempfile.mktemp(prefix="cf-index-")
    e2 = dict(env, GIT_INDEX_FILE=idx)
    try:
        git("read-tree", a.fork, e=e2)
        git("update-index", "--index-info", inp=("\n".join(index_lines) + "\n").encode("utf-8"), e=e2)
        tree = git("write-tree", e=e2).decode().strip()
    finally:
        if os.path.exists(idx):
            os.unlink(idx)
    commit = git("commit-tree", tree, "-p", a.fork, "-m",
                 f"counterfactual: revert names [{','.join(names)}]").decode().strip()
    report["commit"] = commit
    report["tree"] = tree
    if a.report:
        with open(a.report, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
    print(commit)
    print(json.dumps({k: (v if not isinstance(v, list) else len(v)) for k, v in report.items()}, ensure_ascii=False),
          file=sys.stderr)


if __name__ == "__main__":
    main()
