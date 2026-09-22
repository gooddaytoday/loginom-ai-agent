# Description + dataset: checkpoint

Обновлено 2026-09-22. План НЕ завершён. Последняя full final15: 9 PASS / 1 BLOCKED. Все завершённые попытки закрыты, неизвестный read D65 сохранён. Новый кандидат 16 ожидает первого окна до отправки задачи. Цель остаётся новый полный 10/10 на одном установленном кандидате.

## Текущий этап: кандидат 16, ожидание первого окна

D-F08 исправлен и зафиксирован в `3e19818b6fd65bf867e0d382f0acdf718e8c4b07`: compact user-v1 не публикует/не принимает budget_ms в node_read. После проверки compact schema клиент назначает новой операции 600000 ms. Полный диагностический API, default 300000 и явно принятые сроки неизменны. Исходный read D65-final15 не повторялся и не продлевался.

Проверки: 56 узких PASS; runtime 2291 PASS / 2 Windows-only SKIP / 0 FAIL; source attribution 5045 PASS; общие macOS source checks 8/8 PASS. DEBUG_ONLY исходной последовательности D65, включая известный FAILED/cleanup=true и исправление того же Calculator, завершён: дополнительное чтение исходных 55 строк/exact прошло за 95313 ms с budget=600000, numbers_verified=true, format_restoration.restored=true, workflow_returned=true, cleanup=true. Возвращено 19 строк, status=partial — не 55/55. Save SUCCEEDED, awaited host/child shutdown exit=0. Приватный audit `reread-16-debug-audit.json`, replay `replay-reread-d65-16b.log`, каталог `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-eSO5k7`. Первый диагностический контроллер остановился на известном FAILED; второй продолжил исходное исправление. Оба диагностические, не acceptance.

Кандидат **0.1.7-local.20260922.4**, source `3e19818b6fd65bf867e0d382f0acdf718e8c4b07`, ASAR `fc673c24ddda56969e0d514538f8b256f979bd6c44e1390134b1f226f4e91500`. Установлен из readonly DMG в `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.4/Loginom AI Agent.app`. Подпись deep/strict и совпадение ASAR PASS; DMG/ZIP по 4446 ресурсов PASS, Desktop offline Node/Chromium/onboarding/awaited exit PASS.

Общий build-macos дважды остановился при упаковке CLI на `cli-source-snapshot` после готовых Desktop DMG/ZIP: процессы без активности завершены SIGTERM, логи/сэмпл сохранены. Первая папка `description-20260922-4` не используется. Во второй `description-20260922-4b` из того же чистого commit отдельно выполнены штатные source archive/write-manifest/verify-artifact. Desktop offline проверен приватной копией штатного smoke, содержащей все исходные Desktop-проверки и исключающей CLI. **Общая сборка и CLI acceptance не объявляются PASS**; Desktop артефакты проверены отдельно. Исходники/пины/проверки Desktop не ослаблялись. `candidate16-install.json` сохраняет это ограничение.

D65-target16 подготовлен, **НЕ отправлен**; final16 ещё не подготовлена. Первый запуск до prompt превысил 45s, процесс 75196 завершён Playwright. Повтор того же профиля: app16 PID **75251**, окон 0, SecurityAgent PID 75219. Пользователю отправлен запрос ручного подтверждения нового системного диалога. Автоматический доступ к SecurityAgent ранее запрещён, обход недопустим. Секреты не сохранять. 30-минутный срок D65 не начат. Приложение оставлено ждать подтверждения; это единственный активный тестовый Desktop.

После ответа: использовать **существующий app16**, дождаться firstWindow, проверить prompt, configureUI, status=ready отдельными await, затем submitUI. Не пересоздавать профиль/попытку и не запускать второе приложение. Если пользователь сообщает, что запроса нет, выяснить состояние окна/старта, не считать Keychain доказанной причиной только по процессу. После целевого PASS — новая полная final16, 10 задач, до пяти клиентов, новый strict audit; прежние успехи не переносить.

## Завершённые серии

- Baseline `.21.10`: 7 PASS / 3 BLOCKED.
- `.11`: целевой D45 BLOCKED; `.12`: целевые D45/D48/D65 PASS, final12 9 PASS / 1 BLOCKED.
- `.22.1`: целевой D27 PASS, final13 7 PASS / 3 BLOCKED (D02/D36 маски, D24 неверный artifact_id модели).
- `.22.2`: target14 D36 PASS, D02 BLOCKED из-за скрытой внешней копии графа; final14 только подготовлена, не отправлена.
- `.22.3`: target15 D02/D36 PASS (10/3 узла); final15 9 PASS / 1 BLOCKED (D65/D-F08).

Final15 strict audit: complete=false, completed=9, expected=10, max_observed=5; все 10 файловые/model/изоляция/срок/закрытие checks пройдены. PASS: D02 12 узлов/22.72 мин; D47 6/17.35; D23 5/17.08; D45 6/23.12; D19 10/27.75; D36 4/9.99; D24 3/8.93; D48 6/13.48; D27 9/14.53. D65 7 узлов, без save. 8 успешных типов/режимов, не 14/14. 145 завершённых ожиданий масок, max=481 ms, remaining=0; минутная маска в live не повторилась. D02 safe NOT_APPLIED auto-placement исправлен моделью новым запросом с explicit position; это не unresolved bug.

## Предыдущий проверенный live-кандидат

`0.1.7-local.20260922.3`, source `512a9b9bef88800d358b0e808d0f03fbd59b5e51`, ASAR `4bff65eddf15aea569ccc59ab82f06ff359cc9e139b9814ab3962bac3b137b15`. Установка `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.3/Loginom AI Agent.app`. Runtime 2289 PASS / 2 SKIP, general macOS 8/8 PASS, clean build, DMG/ZIP 4446 resources, offline smoke, signature и ASAR совпадение PASS. Эта сборка ещё НЕ содержит D-F08 fix. Рабочая установка пользователя не менялась. Keychain подтверждена пользователем, повторных запросов на кандидате 15 не было.

## Канонические условия и приватный контроллер

Порядок старта D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Исходные description.md+dataset.csv неизменны, фиксированный prompt, GPT-5.6 Sol low, Loginom 7.4.2, macOS Desktop backend v1. До пяти независимых клиентов по последнему поручению пользователя. Каждая попытка 30 минут от отправки; сроки pending неизменны. Без технических подсказок/ручных изменений. Analytical correctness/description completeness not_checked; бизнес-помощи нет.

Evidence root `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`. Private чаты/receipts/profiles не копировать в Git; секреты, headers и env не печатать. `audit-final.py <series>` проверяет latest node outcomes и исходные файлы, source lineage, save-after-graph, modified=false, сроки, изоляцию/закрытие; для target series допускает только явно запланированное подмножество, final всегда все десять. `audit-masks.py <series>` учитывает завершённые traces. Full mode coverage берётся из успешных операций всех финальных узлов, включая те, которые затем перечитывались.

Persistent Node REPL: ctl=attempt-controller-v7.mjs, parallel13, pw, env, fs, evidence, baselineManifest. Все slots15/targets15/slots13/targets14 закрыты; nextIndex15=10, **launchNext15 больше не вызывать**. candidate15/installed15, final15Manifest, target15Manifest сохранены. s65 — закрытая неуспешная попытка, не poll её backend. Дополнительно доступны install16/candidate16/installed16, target16Manifest с одним подготовленным D65, targets16=[] и app16 (живой PID 75251 без окна). Для final16 подготовить новые profiles через ctl.prepareAttempt, launch/configure/submit через Desktop. После изменений parallel13.checkpoint с НОВЫМИ candidate/manifest/slots. Готовность соединения ждать отдельными await status, не async waitForFunction. При pre-prompt readiness отказе использовать тот же slot, не создавать второй профиль.

Pinned Bun `/Users/kartamyshev/.cache/loginom-macos-build/tools/bun-darwin-aarch64/bun`; Node `/Users/kartamyshev/.cache/loginom-macos-build/tools/node-v24.19.0-darwin-arm64/bin/node`; browsers `/Users/kartamyshev/.cache/loginom-macos-build/browsers`. Проверки package-local. Build env полностью LOGINOM_AI_AGENT_CHANNEL/NODE_SOURCE/TEST_NODE/BROWSER_SOURCE, NODE_SOURCE — бинарник. Source checks не совмещать с пятью live клиентами. Финально обновить results/план/бизнес-реестр/canonical Linux checkpoint, закрыть процессы, commit docs и только после фактических 10/10 завершить goal. F03/F07 universal recovery, исходную полную причину F12, compaction и аналитическую корректность не заявлять без доказательств.
