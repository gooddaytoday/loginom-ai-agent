#!/usr/bin/env python3
"""Классификация расхождений форка с upstream по файлам.

Для каждого файла, который форк изменил относительно общей базы (изменение или переименование),
определяет, чем объясняется различие:
  move-only    содержимое совпадает с базой, изменился только путь;
  mech:<кл.>   различие целиком объясняется заменами указанных классов имён
               (классы — из counterfactual-names.py: svckey, scope, pkgdir, env, userfiles);
               берётся наименьший набор классов, дающий побайтное совпадение;
  binary       бинарный файл изменён (значки, логотипы);
  substantive  остаток после замен всех классов — содержательные правки или бренд-строки.
Для остатка считаются строки, отличающиеся от «базы с применёнными заменами», кластер и «горячесть»
файла в upstream (число коммитов, затронувших файл, за последние 1000 по first-parent до базы).
Дополнительно считает окна изменчивости upstream: для 12 окон по 144 first-parent-коммита до базы и для
реальной дельты — сколько изменённых upstream путей попадает в разные части расхождения.

Использование:
  classify-divergence.py --repo DIR --base SHA --fork SHA --upstream SHA --out DIR
Выход: divergence-files.tsv, divergence-summary.md, churn-windows.tsv
"""
import argparse, collections, difflib, importlib.util, itertools, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cfnames", os.path.join(HERE, "counterfactual-names.py"))
cfn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfn)
NAMES = list(cfn.CLASSES)
FWD = {n: [(re.compile(p), r) for p, r in cfn.CLASSES[n][0]] for n in NAMES}
INTERNAL = {"svckey", "scope", "pkgdir"}
WINDOW = 144
WINDOWS = 12


def fwd(text, sel):
    for n in NAMES:
        if n in sel:
            for rx, rep in FWD[n]:
                text = rx.sub(rep, text)
    return text


def cluster(p):
    """Кластер по пути в базе (до переименования каталога)."""
    test = bool(re.search(r"(^|/)(test|tests|e2e|test-browser)/|\.test\.|\.spec\.", p))
    sfx = " (tests)" if test else ""
    if p == "bun.lock" or re.search(r"(^|/)package\.json$", p):
        return "K10 manifests+lock"
    if re.search(r"\.(png|jpg|jpeg|ico|icns|svg|gif|webp)$", p) or "/i18n/" in p or "/locales/" in p:
        return "K11 brand assets/strings"
    if p.endswith((".md", ".mdx")) or re.search(r"session/prompt/.*\.txt$", p):
        return "K11 brand assets/strings"
    if p.startswith((".github/", ".husky/", "nix/")) or p in (".gitignore", ".gitattributes", "turbo.json", "install"):
        return "K9 CI/build/release"
    if (p.startswith(("packages/opencode/script/", "packages/desktop/scripts/", "packages/script/", "packages/opencode/bin/"))
            or "electron-builder.config" in p or "electron.vite" in p):
        return "K9 CI/build/release"
    if re.search(r"packages/opencode/(src|test)/(installation|cli/upgrade)", p) or "desktop/src/main/updater" in p:
        return "K5 install/update" + sfx
    if re.search(r"packages/opencode/(src|test)/(session|effect|tool|server|permission|mcp)/", p):
        return "K1 session/tools/server" + sfx
    if re.search(r"packages/opencode/(src|test)/(skill|command)", p):
        return "K3 skills/commands" + sfx
    if re.search(r"packages/opencode/(src|test)/(provider|plugin)/|proxy-env", p):
        return "K4 provider/plugin/proxy" + sfx
    if p.startswith("packages/opencode/"):
        return "K2 CLI/worker/config" + sfx
    if p.startswith("packages/core/"):
        return "K12 core identity/paths" + sfx
    if p.startswith("packages/desktop/"):
        return "K6 desktop main/renderer" + sfx
    if p.startswith(("packages/app/", "packages/ui/", "packages/session-ui/")):
        return "K7 app/ui" + sfx
    if p.startswith("packages/tui/"):
        return "K8 tui" + sfx
    return "K13 other" + sfx


def main():
    ap = argparse.ArgumentParser()
    for k in ("repo", "base", "fork", "upstream", "out"):
        ap.add_argument("--" + k, required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C")

    def git(*args, inp=None):
        return subprocess.run(["git", "-C", a.repo, *args], input=inp, capture_output=True, check=True, env=env).stdout

    def name_status(x, y):
        raw = git("diff", "-l30000", "-M", "--name-status", "-z", x, y).split(b"\0")
        res, i = [], 0
        while i < len(raw) - 1:
            st = raw[i].decode(); i += 1
            if st[0] == "R":
                res.append((st[0], raw[i].decode(), raw[i + 1].decode())); i += 2
            else:
                res.append((st[0], raw[i].decode(), raw[i].decode())); i += 1
        return res

    ns = name_status(a.base, a.fork)
    pairs = [(s, o, n) for s, o, n in ns if s in "MR"]
    added = [n for s, o, n in ns if s == "A"]
    deleted = [o for s, o, n in ns if s == "D"]

    spec_in = b"".join(f"{a.base}:{o}\n{a.fork}:{n}\n".encode() for _, o, n in pairs)
    data = git("cat-file", "--batch", inp=spec_in)
    blobs, pos = [], 0
    for _ in range(len(pairs) * 2):
        nl = data.index(b"\n", pos)
        size = int(data[pos:nl].split()[2])
        blobs.append(data[nl + 1:nl + 1 + size]); pos = nl + 1 + size + 1

    # churn upstream: коммиты first-parent до базы и реальная дельта
    log = git("log", "--first-parent", "-n", "1000", "--format=@@%h", "--name-only", "--no-renames", a.base).decode()
    churn = collections.Counter(l for l in log.split("\n") if l and not l.startswith("@@"))
    real = {l for l in git("diff", "--no-renames", "--name-only", a.base, a.upstream).decode().split("\n") if l}

    combos = [frozenset(c) for k in range(0, len(NAMES) + 1) for c in itertools.combinations(NAMES, k)]
    rows, tally = [], collections.Counter()
    for k, (st, old, new) in enumerate(pairs):
        x, y = blobs[2 * k], blobs[2 * k + 1]
        label, classes, add, dele = "", "", 0, 0
        try:
            tx, ty = x.decode("utf-8"), y.decode("utf-8")
        except UnicodeDecodeError:
            tx = ty = None
        if x == y:
            label = "move-only"
        elif tx is None:
            label = "binary"
        else:
            hit = next((c for c in combos if fwd(tx, c) == ty), None)
            if hit is not None:
                label = "mech"; classes = ",".join(n for n in NAMES if n in hit)
            else:
                label = "substantive"
                xl, yl = fwd(tx, set(NAMES)).splitlines(), ty.splitlines()
                for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, xl, yl, autojunk=False).get_opcodes():
                    if op != "equal":
                        dele += i2 - i1; add += j2 - j1
        key = label if label != "mech" else "mech:" + ("internal-only" if set(classes.split(",")) <= INTERNAL else "needs-external")
        tally[key] += 1
        rows.append((old, new, label, classes, cluster(old) if label in ("substantive", "binary") else "", add, dele,
                     churn[old], int(old in real)))

    with open(os.path.join(a.out, "divergence-files.tsv"), "w", encoding="utf-8") as f:
        f.write("base_path\tfork_path\tlabel\tclasses\tcluster\tadd\tdel\tupstream_commits_1000\tin_real_delta\n")
        for r in sorted(rows):
            f.write("\t".join(map(str, r)) + "\n")

    # окна изменчивости upstream
    first_parent = git("rev-list", "--first-parent", a.base).decode().split()
    sets = {
        "все изменённые форком": {r[0] for r in rows},
        "после возврата внутренних имён": {r[0] for r in rows if not (r[2] == "move-only" or (r[2] == "mech" and set(r[3].split(",")) <= INTERNAL))},
        "после возврата всех имён": {r[0] for r in rows if r[2] in ("substantive", "binary")},
        # K10 (кроме bun.lock), K11 и K9 уходят из расхождения политикой владения файлами: манифесты без правок name/version,
        # оверлей строк и ресурсов бренда, отдельные файлы CI форка (см. отчёт S1)
        "после политики владения (без K9, K10 кроме bun.lock, K11)": {
            r[0] for r in rows
            if r[2] in ("substantive", "binary") and (r[0] == "bun.lock" or r[4].split(" ")[0] not in ("K9", "K10", "K11"))},
    }

    def window(x, y):
        return {l for l in git("diff", "--no-renames", "--name-only", x, y).decode().split("\n") if l}

    wins = [("реальная дельта база→upstream", real)]
    for i in range(WINDOWS):
        wins.append((f"история {i:2d}: {first_parent[(i + 1) * WINDOW][:8]}..{first_parent[i * WINDOW][:8]}",
                     window(first_parent[(i + 1) * WINDOW], first_parent[i * WINDOW])))
    with open(os.path.join(a.out, "churn-windows.tsv"), "w", encoding="utf-8") as f:
        f.write("window\tchanged_paths\t" + "\t".join(sets) + "\n")
        for name, w in wins:
            f.write(f"{name}\t{len(w)}\t" + "\t".join(str(len(w & s)) for s in sets.values()) + "\n")

    clusters = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    for r in rows:
        if r[2] in ("substantive", "binary"):
            c = clusters[r[4]]; c[0] += 1; c[1] += r[5]; c[2] += r[6]; c[3] += int(r[7] > 0); c[4] += r[8]
    top = collections.Counter(p.split("/")[0] + "/" + (p.split("/")[1] if "/" in p else "") for p in added)
    with open(os.path.join(a.out, "divergence-summary.md"), "w", encoding="utf-8") as f:
        f.write(f"# Расхождения форка с upstream: файлы, изменённые форком\n\n- форк `{a.fork}`, база `{a.base}`\n")
        f.write(f"- парных файлов (изменение или переименование): **{len(pairs)}**; добавлено форком: {len(added)}; удалено: {len(deleted)}\n\n")
        f.write("| класс | файлов |\n|---|---|\n")
        for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
            f.write(f"| {k} | {v} |\n")
        by = collections.Counter(r[3] for r in rows if r[2] == "mech")
        f.write("\n## Механические различия по наборам классов (наименьший набор)\n\n| набор | файлов |\n|---|---|\n")
        for k, v in sorted(by.items(), key=lambda kv: -kv[1]):
            f.write(f"| {k} | {v} |\n")
        f.write("\n## Содержательный остаток по кластерам\n\n| кластер | файлов | + строк | − строк | затронуто upstream (1000 коммитов) | в реальной дельте |\n|---|---|---|---|---|---|\n")
        for k, v in sorted(clusters.items()):
            f.write(f"| {k} | {v[0]} | {v[1]} | {v[2]} | {v[3]} | {v[4]} |\n")
        f.write("\n## Файлы, добавленные форком (по верхним каталогам, первые 15)\n\n| каталог | файлов |\n|---|---|\n")
        for k, v in top.most_common(15):
            f.write(f"| {k} | {v} |\n")
    print(open(os.path.join(a.out, "divergence-summary.md"), encoding="utf-8").read())


if __name__ == "__main__":
    main()
