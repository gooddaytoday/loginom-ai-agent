# Description + dataset: checkpoint

Обновлено 2026-09-22. План НЕ завершён. Последняя full final15: 9 PASS / 1 BLOCKED. Все Desktop закрыты, неизвестный read D65 сохранён. Цель остаётся новый полный 10/10 на одном установленном кандидате.

## Текущая доработка D-F08

D65-final15 построил/выполнил 7 узлов и сам исправил ошибку формулы на том же retained Calculator. Затем `dock_node_read` operation_id=`read-abc-detail-65-001`, source=`node-abc-65-fix-001`, ports=[0], sample_rows=55, exact=true, **budget_ms=60000** (выбрала модель). В таблице 20 полей, 14 numeric. Admission 01:25:49.910 UTC с configure/execute/total=60000; отказ 01:26:49.915, step 335 при maxSteps=4096. Причина — deadline, не шаговый лимит. AMBIGUOUS/read, effect=true, cleanup=false; save правильно заблокирован. Модель завершилась сама, Stop не нажимался, Desktop закрыт. Не продлевать/не повторять старый read.

Исправление D-F08: compact user-v1 больше не публикует/не принимает budget_ms в node_read. Bridge валидирует compact schema, затем expandNodeRead задаёт 600000 на новую операцию. Полный диагностический API и default 300000/явные бюджеты неизменны. Изменены bridge.mjs, user-workflow.mjs, два тестовых файла, AGENTS, source-transforms и документы. Узкие RED/GREEN: 56 PASS (`reread-16-{red,green}.log`); attribution 5045 PASS. Source-map base hashes не изменялись.

Полный runtime: 2291 PASS / 2 Windows-only SKIP / 0 FAIL (`runtime-tests-16.log`). Общие macOS source checks: 8/8 PASS (`source-checks-16.json`).
DEBUG_ONLY повтор исходных D65 node_apply, включая известный FAILED/cleanup=true и исправление того же узла, затем ТО ЖЕ дополнительное чтение 55 строк/exact без поля budget_ms: shell 90206, `replay-reread-d65-16b.log`, каталог `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-eSO5k7`. Скрипт `replay-reread-d65.ts`, копия ресурсов `mask-debug-resources`: исходный установленный кандидат 15 + два изменённых runtime файла. Это не installed acceptance. После read проверить admission budget=600000, elapsed, success, format restoration, save и awaited host/child close. Не подключать второй CDP к Loginom.

Первый DEBUG_ONLY остановился на известном FAILED без перехода к исходному исправлению; исправлен только приватный контроллер повтора, начат новый изолированный DEBUG_ONLY.

Следующее: дождаться DEBUG_ONLY; commit чистых входов; новый build `.20260922.4` в `description-20260922-4`, отдельная установка и проверки DMG/ZIP/offline/signature/hash. Затем целевой D65-target16 с исходными файлами, затем НОВАЯ полная final16 в пять клиентов. Ни target16, ни final16 ещё не подготовлены/не отправлены. Старые успехи не переносить.

## Завершённые серии

- Baseline `.21.10`: 7 PASS / 3 BLOCKED.
- `.11`: целевой D45 BLOCKED; `.12`: целевые D45/D48/D65 PASS, final12 9 PASS / 1 BLOCKED.
- `.22.1`: целевой D27 PASS, final13 7 PASS / 3 BLOCKED (D02/D36 маски, D24 неверный artifact_id модели).
- `.22.2`: target14 D36 PASS, D02 BLOCKED из-за скрытой внешней копии графа; final14 только подготовлена, не отправлена.
- `.22.3`: target15 D02/D36 PASS (10/3 узла); final15 9 PASS / 1 BLOCKED (D65/D-F08).

Final15 strict audit: complete=false, completed=9, expected=10, max_observed=5; все 10 файловые/model/изоляция/срок/закрытие checks пройдены. PASS: D02 12 узлов/22.72 мин; D47 6/17.35; D23 5/17.08; D45 6/23.12; D19 10/27.75; D36 4/9.99; D24 3/8.93; D48 6/13.48; D27 9/14.53. D65 7 узлов, без save. 8 успешных типов/режимов, не 14/14. 145 завершённых ожиданий масок, max=481 ms, remaining=0; минутная маска в live не повторилась. D02 safe NOT_APPLIED auto-placement исправлен моделью новым запросом с explicit position; это не unresolved bug.

## Последний установленный кандидат

`0.1.7-local.20260922.3`, source `512a9b9bef88800d358b0e808d0f03fbd59b5e51`, ASAR `4bff65eddf15aea569ccc59ab82f06ff359cc9e139b9814ab3962bac3b137b15`. Установка `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.3/Loginom AI Agent.app`. Runtime 2289 PASS / 2 SKIP, general macOS 8/8 PASS, clean build, DMG/ZIP 4446 resources, offline smoke, signature и ASAR совпадение PASS. Эта сборка ещё НЕ содержит D-F08 fix. Рабочая установка пользователя не менялась. Keychain подтверждена пользователем, повторных запросов на кандидате 15 не было.

## Канонические условия и приватный контроллер

Порядок старта D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Исходные description.md+dataset.csv неизменны, фиксированный prompt, GPT-5.6 Sol low, Loginom 7.4.2, macOS Desktop backend v1. До пяти независимых клиентов по последнему поручению пользователя. Каждая попытка 30 минут от отправки; сроки pending неизменны. Без технических подсказок/ручных изменений. Analytical correctness/description completeness not_checked; бизнес-помощи нет.

Evidence root `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`. Private чаты/receipts/profiles не копировать в Git; секреты, headers и env не печатать. `audit-final.py <series>` проверяет latest node outcomes и исходные файлы, source lineage, save-after-graph, modified=false, сроки, изоляцию/закрытие; для target series допускает только явно запланированное подмножество, final всегда все десять. `audit-masks.py <series>` учитывает завершённые traces. Full mode coverage берётся из успешных операций всех финальных узлов, включая те, которые затем перечитывались.

Persistent Node REPL: ctl=attempt-controller-v7.mjs, parallel13, pw, env, fs, evidence, baselineManifest. Все slots15/targets15/slots13/targets14 закрыты; nextIndex15=10, **launchNext15 больше не вызывать**. candidate15/installed15, final15Manifest, target15Manifest сохранены. s65 — закрытая неуспешная попытка, не poll её backend. Для новой серии подготовить новые profiles через ctl.prepareAttempt, launch/configure/submit через Desktop. После изменений parallel13.checkpoint с НОВЫМИ candidate/manifest/slots. Готовность соединения ждать отдельными await status, не async waitForFunction. При pre-prompt readiness отказе использовать тот же slot, не создавать второй профиль.

Pinned Bun `/Users/kartamyshev/.cache/loginom-macos-build/tools/bun-darwin-aarch64/bun`; Node `/Users/kartamyshev/.cache/loginom-macos-build/tools/node-v24.19.0-darwin-arm64/bin/node`; browsers `/Users/kartamyshev/.cache/loginom-macos-build/browsers`. Проверки package-local. Build env полностью LOGINOM_AI_AGENT_CHANNEL/NODE_SOURCE/TEST_NODE/BROWSER_SOURCE, NODE_SOURCE — бинарник. Source checks не совмещать с пятью live клиентами. Финально обновить results/план/бизнес-реестр/canonical Linux checkpoint, закрыть процессы, commit docs и только после фактических 10/10 завершить goal. F03/F07 universal recovery, исходную полную причину F12, compaction и аналитическую корректность не заявлять без доказательств.
