# История обучения JavaScript и перенос 2026-10-15

Архив сохраняет обучение v1 26 сентября — 3 октября 2026 и сведения целевой ветки
перед переносом. Прежние команды, аккаунты, маршруты памяти и следующие шаги —
исторические данные; действующий порядок задаёт [RUNBOOK](../../RUNBOOK.md).

## Источники и результаты прежнего обучения

- Источник: `origin/javascript@399bb8b589818eab322088ec424d4110bb7990d0`.
- Целевая база: `node-javascript@4ca0a4b07f04e2b4039ae6cb6d97c05c64310c2b`.
- [Полный журнал обучения: 18 806 исходных строк](origin-javascript-399bb8b589/checkpoint.md).
- [Прежний подплан](origin-javascript-399bb8b589/plan.md) и [карточка](origin-javascript-399bb8b589/README.md).
- [Checkpoint целевой ветки: 305 исходных строк](node-javascript-4ca0a4b07f/checkpoint.md).
- [Исторический жизненный цикл](origin-javascript-399bb8b589/workflow/lifecycle.md).
- [Итог обучения](../../nodes/programming-javascript/completion.md), [матрица J01–J27/G1–G7](../../nodes/programming-javascript/completion-audit.md), [pair13](../../nodes/programming-javascript/completion-phase6.md).
- [Машиночитаемый manifest и карта 28 cherry-pick](transfer-manifest.json).

Сначала 31 восстановленный файл побайтно сопоставлен с исходной веткой.
Затем изменены только маркировка и навигация исторических документов; исходные
Git blob/hash и hashes адаптированных файлов записаны в provenance/manifest.
Нынешние исправления после rebase, семь coercion CSV и readiness сохранены.
Source `6f6a66eb62` соответствует rebased `f28df036d3`; повторного переноса кода нет.

## Ограничения доказательств

Прежняя приёмка относится к candidate15/source `6f6a66eb62`, Loginom 7.4.2/Linux,
headed Chromium и original pair13. Она не переносится на нынешний SHA.
Raw campaign evidence и документационный ZIP не найдены по записанным локальным
путям на этой машине; их содержимое не перепроверено. `acceleration-review.md`
отсутствует в доступном source/history; его ссылки явно отмечены недоступными.
Live, CLI, TestCafe, установленный Desktop и выпуск заново не проверялись.

## Проверки переноса

Проверено на Node 24.19.0 (SHA256 совпал с product release pin), Python 3.10.12:

- Knowledge/parameters: **14 PASS**, native typed/integer/coercion: **1526 PASS**,
  Python fixtures: **15 PASS**, без FAIL/SKIP.
- Все **17** fixture bytes/SHA; независимо **6 int64 + 3 binary64** encoding PASS.
- Содержательный текст **34** исторических Markdown-документов сохранён;
  оба исторических JSON совпадают с исходником побайтно. Изменены навигация
  и историческая маркировка; исходные hashes сохранены для всех 44 mappings.
- Все **67** локальных Markdown fragments существуют; новых битых ссылок нет.
- Продуктовый и memory-код, runtime pins, readiness всех узлов, семь coercion CSV
  и исходный посторонний untracked-план неизменны. Текущий checkpoint — 14 строк.
- `git diff --check 4ca0a4b07f` и проверка 28 cherry-pick trailers PASS.

Документационный validator имеет те же **5** прежних ошибок, новых нет:
`evidence hash migration-map`, `evidence hash text-import-parameters`,
`evidence hash text-export-handler` и related historical hash для
`services/loginom-ai/docs/loginom-dock/operations.md`, `agent-handoff.md`.
Посторонние source hashes не пересчитывались. Полные команды, карта коммитов,
источники и результаты проверок — в [transfer manifest](transfer-manifest.json).
