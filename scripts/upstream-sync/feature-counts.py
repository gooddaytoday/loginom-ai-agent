#!/usr/bin/env python3
"""Сводка содержательных расхождений по функциям (S1–S14 из отчёта S1) из divergence-files.tsv.

Каждый файл назначается одной функции по основному пути; общие файлы (например, session/tools.ts одновременно
про фильтр профиля и про каталог инструментов Loginom) считаются один раз, поэтому цифры — приближённые.

Использование: feature-counts.py divergence-files.tsv > feature-counts.md
"""
import collections, csv, re, sys

RULES = [  # порядок важен: первое совпадение
    ("S14 манифесты и lock", r"(^bun\.lock$)|(^|/)package\.json$"),
    ("S13 сборка, выпуск, CI", r"^(\.github/|\.husky/|nix/)|^(turbo\.json|\.gitignore|\.gitattributes|install)$|^packages/(opencode/(script|bin)|desktop/scripts|script)/|electron-builder\.config|electron\.vite"),
    ("S9 установка и обновление", r"opencode/(src|test)/(installation|cli/upgrade)|desktop/src/main/updater|tui/src/app\.tsx"),
    ("S5 скиллы и команды", r"opencode/(src|test)/(skill|command|tool/skill)"),
    ("S7 провайдеры, OAuth, прокси", r"opencode/(src|test)/(provider|plugin|mcp)/|proxy-env"),
    ("S1-S2 инструменты и профиль", r"opencode/(src|test)/(tool/|session/(tools|profile-tools))|opencode/test/tool/"),
    ("S6 целостность метаданных и API", r"opencode/(src|test)/(session/message-v2|server/)"),
    ("S4 вложения", r"attachment|prompt-input/|build-request-parts|local-attachment|file-snapshot"),
    ("S3 границы хода и сессия", r"opencode/(src|test)/(session|effect)/"),
    ("S8 процессы CLI, воркер, desktop main", r"opencode/(src|test)/(cli|index|node|util|standalone|acp|auth|storage)|desktop/src/(main|preload)/|desktop/test/"),
    ("S10 идентичность, бренд, i18n, ресурсы", r"/i18n/|/locales/|\.(png|jpg|jpeg|ico|icns|svg|gif|webp|md|mdx)$|session/prompt/.*\.txt$|^packages/core/|app/public/|app/index\.html|ui/src/(v2/components/wordmark|components/(logo|favicon))|desktop/icons|opencode/src/config/"),
    ("S11 интерфейс app, ui, desktop renderer", r"^packages/(app|ui|session-ui)/|desktop/src/renderer/"),
    ("S12 TUI", r"^packages/tui/"),
]
COMPILED = [(n, re.compile(p)) for n, p in RULES]


def feature(path):
    for name, rx in COMPILED:
        if rx.search(path):
            return name
    return "прочее"


rows = [r for r in csv.DictReader(open(sys.argv[1], encoding="utf-8"), delimiter="\t") if r["label"] in ("substantive", "binary")]
agg = collections.defaultdict(lambda: [0, 0, 0, 0, 0, 0])
for r in rows:
    a = agg[feature(r["base_path"])]
    a[0] += 1
    a[1] += int(r["add"]); a[2] += int(r["del"])
    a[3] += int(int(r["upstream_commits_1000"]) > 0)
    a[4] += int(r["in_real_delta"])
    a[5] += int("test" in r["base_path"] or ".spec." in r["base_path"] or "/e2e/" in r["base_path"])
print("| функция | файлов | из них тестов | + строк | − строк | затронуто upstream (1000 коммитов) | в реальной дельте |")
print("|---|---|---|---|---|---|---|")
for name in [n for n, _ in RULES] + ["прочее"]:
    a = agg.get(name)
    if a:
        print(f"| {name} | {a[0]} | {a[5]} | {a[1]} | {a[2]} | {a[3]} | {a[4]} |")
print(f"| **всего** | {len(rows)} | {sum(a[5] for a in agg.values())} | {sum(a[1] for a in agg.values())} | {sum(a[2] for a in agg.values())} | {sum(a[3] for a in agg.values())} | {sum(a[4] for a in agg.values())} |")
