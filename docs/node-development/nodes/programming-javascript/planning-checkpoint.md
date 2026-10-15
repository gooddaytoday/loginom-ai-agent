# JavaScript: checkpoint подготовки подплана

Дата: 2026-09-26. [План](plan.md), [исследование](research.md),
[источники](sources.json), [e2e](e2e-coverage.md), [fixtures](fixtures/README.md).

## Результат

Plan-authoring завершён; статус `discovery_required`. Созданы карточка,
предметный подплан, исследование, каталог e2e, исходные данные и независимые
ожидания. Реестр получил только ссылки/plan_status/next_action; readiness всех
78 компонентов сохранён. Inventory перегенерирован штатным валидатором.

Изучены весь workflow-комплект `docs/node-development`, шаблоны, snapshots
окружения/readiness, validation/history, standalone runbook, подпланы и
исторический audit Калькулятора, актуальный runtime, 26 официальных страниц,
основные/смежные e2e и пользовательский справочник.

Пользователь назначил стенд
[http://logi-test-plan.bg.local/app/](http://logi-test-plan.bg.local/app/).
Предложен scope синхронного табличного ядра; прочие возможности разобраны
как отдельные расширения. Это предложение плана, не уже проведённая приёмка.

## Проверено

- Git base/source: `a8ad59766dbdb4f2da0b54367a755ce00891dd71`;
  E2E SHA: `7a41b5adbb9c45dca8d756a8220615554301c2e0`.
- Bundled Node24.19.0 и SHA совпали с product pin.
- Из `packages/loginom-runtime` pinned Node выполнил
  `client/test/node-api.test.mjs`, `client/test/capability-registry.test.mjs`,
  `client/test/user-workflow.test.mjs`: **24/24 PASS**, skip=0.
- `python3 docs/node-development/tools/validate.py --render`, затем
  `python3 docs/node-development/tools/validate.py`: **PASS**.
  Внешний оригинальный архив отдельно не проверялся; новый архив не создавался.
- `git diff --check`: **PASS**; новые документы также проверены на whitespace.
- Проверены 44 file hashes: 16 продуктовых исходников, исходный справочник,
  19 e2e-файлов и 8 fixture/document files.
- CSV/expected пересчитаны независимой Decimal-арифметикой: baseline/reordered
  6×4, сумма 1950; changed 2850 и RowID1=2700; empty=0. Это проверка спецификации
  oracle, не выполнения Loginom.
- Отдельные read-only проверки документационного процесса, кода и e2e
  подтвердили полноту ссылок; исправлены source parameter collision,
  discovery/implementation gate cycle, граница dock_node_read, exact real
  roundtrip, single-row fixture и explicit e2e target.

## Не выполнялось и условия продолжения

Продуктовый код и содержимое исходного справочника не изменялись;
его актуальный путь — [references/js_node_loginom_system_prompt.md](references/js_node_loginom_system_prompt.md).
Стенд не открывался; фактический build (ожидается 7.4.2), edition, ОС сервера,
account и network не проверены.
E2E не запускались, зависимости не устанавливались. Handler, JS auditor,
CLI candidate, live discovery и автономная модельная приёмка ещё предстоят.

Campaign/task/attempt/CLI session не создавались; общие ресурсы не занимались.
Goal, установка клиента, merge/push/release не выполнялись. Запущенных
операций Loginom или неизвестных эффектов этой задачи нет.

Будущий владелец — назначенный single-разработчик. После команды выполнить
подплан начать с 0A: изоляция, локальная память нового worktree, инструменты,
аккаунт и реальная версия назначенного стенда. Затем 0B разрешает G1–G7
прямыми probes и переводит план в `ready_for_development`. Окончательные
gates реализации закрываются фазами 1–4; приёмка — фазой 6.

Проверенная память текущей задачи не заменяет worktree enrollment. Старые
macOS пути/Peer/OAuth и PASS не переносить; Peer выводится из текущего cwd.
Никаких новых разрешений для обычных действий внутри будущего согласованного
scope не требуется; недоступное существенное условие фиксируется отдельно.

## Уточнения после ревью и решения пользователя, 2026-09-26

- Исходный справочник перенесён из корня repo в `references/` этой карточки
  и включён в Git. Байты и SHA-256 сохранены; прежний путь и статус на момент
  исследования остаются в `sources.json`. Runtime-редакция и подключение
  знаний модели по-прежнему требуют фазы 1B.
- Обязательный запуск внешнего e2e/TestCafe был добавлен JS-подпланом ошибочно:
  канонический регламент требует сопоставления Help/E2E с UI и кодом.
  Сняты зависимость от Node16/TestCafe и его запуска как условия готовности.
  Каталог остаётся источником сценариев; отдельная диагностика возможна при
  установленной причине и подготовленной среде. Для неё зафиксированы
  ограничения hardcoded account/storage и бесконечного Stop-теста.
- Обязательные адресные source tests, live-матрица нового handler/runtime,
  независимый oracle, сохранение/cold reopen и автономная CLI-приёмка сохранены.
  Стенд остаётся `http://logi-test-plan.bg.local/app/`.
- Проверка уточнений: SHA-256 staged-справочника совпал с исходным; старого
  файла в корне больше нет. `validate.py` — PASS в рабочей копии и чистом
  Git-экспорте staged tree (63 active / 278 total Markdown);
  `git diff --cached --check` — PASS. Live/TestCafe/CLI не запускались.
- Целевой build обучения — Loginom 7.4.2; исходный справочник относится
  к этому build (решение пользователя). Он совпадает с build, который допускает
  текущий graph adapter. Фактический build стенда и ОС сервера подтверждаются
  в 0A; иной build — блокер подготовки. Runtime-редакция знаний получает
  `validated_for` 7.4.2 (фаза 1B, J01).
- Исходные замечания ревью сохранены в
  [review-recommendations.md](review-recommendations.md); их последующая
  проверка и решения описаны ниже.

## Перепроверка внешнего ревью, 2026-09-26

Все десять разделов разобраны в [review-verification.md](review-verification.md).
Внесены подтверждённые требования; ошибочные обоснования отклонены, свойства
целевого Loginom оставлены live gates. Существовавшие до этой работы правки
про целевую версию 7.4.2 и исходный текст рекомендаций сохранены.

- Учтены две стадии ограничения ответов, bounded source-read без Execute,
  stale digest precondition, знания в prepare/describe, точный ввод и decoded
  save/reopen source, отказ cross-process resume, semantic import preflight,
  диагностика и различие static/dynamic bindings.
- Записан перенос docs-коммитов после регистрации worktree от product base;
  добавлены `dynamic_schema`, declared-задание и пары input files по режимам.
- Условия первого ревью отделены от candidate/CLI проверок, расширена матрица.
  Полная ES conformance, выполнение всего внешнего TestCafe и всего исходного
  FS/Fetch-справочника не стали обязательными задачами.
- Найдена дополнительная предпосылка: текущий Host мигрирует exact URL стенда
  при запуске. До автономной приёмки нужен подтверждённый явный target между
  процессами; если срабатывает legacy migration, требуется адресное исправление
  owning Host. Source-only проверки не заменяют эту CLI-проверку.
- Выполнены чистые Node24 probes бюджетов/redactor/схем/process-local runner,
  30 локальных браузерных случаев CodeMirror и анализ 496 исторических LGP.
  [Evidence](review-evidence.json) отличает stand-in и исторический формат
  от реального Loginom. Продуктовый код не изменён; live стенд и CLI не запускались.
- Проверка документов: `validate.py --render`, затем `validate.py` — PASS;
  чистый Git-экспорт staged tree — PASS (66 active / 281 total Markdown);
  `git diff --cached --check` — PASS. Проверены 9 fixture hashes и 14 hashes
  дополнительных исходников/справочника; исходные sales/code-task/expected/
  typed-cases не изменены. Readiness всех 78 компонентов совпадает с прежним.
- Повторная проверка новых решений уточнила effective source preflight для
  existing/omitted source и output reread, а также redaction полного текста
  до chunking. Новые требования не объявлены готовой реализацией.
