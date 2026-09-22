# Description + dataset: checkpoint

Обновлено 2026-09-22. План не завершён. Связка ключей подтверждена пользователем; блокировка первого запуска снята.

## Текущее состояние

Кандидат 14: `0.1.7-local.20260922.2`, исходники `5a144cd7c1d8cea269a52be59fa5a1d340d27b3d`, ASAR `5a6b4a572eed65a15a0126c093e1854b031f372db688e997cc80f05f22ac9a71`. Установлен в `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.2/Loginom AI Agent.app`. Пользовательская установка не менялась. DMG/ZIP (4446 ресурсов), offline smoke, подпись и совпадение ASAR проверены.

Целевые target14 завершены, оба Desktop штатно закрыты:
- D36: CREATED_EXECUTED_SAVED, 4 узла, оригинальный CSV подтверждён, сохранение после графа, modified=false.
- D02: BLOCKED, 5 выполненных узлов. `node-group-region-20260922-001` остановлен в target при предпросмотре upstream перед созданием группировки: `Node procedure is blocked by a mask or dialog`. F3 подтверждён, окно PreviewWindow появилось. В исходной попытке полный native schema не сохранён до assertContext; отдельное воспроизведение ниже подтвердило скрытые внешние копии графа. Повторные resume/recovery отказы; модель запросила ручное закрытие окна. Техническая помощь не оказана. Pending сохранён, cleanup=false. Кнопка Stop не нажималась: модель ждала вопрос, рабочий node worker уже не выполнялся; приложение закрыто штатно.

Final14: все десять профилей подготовлены, НИ ОДИН prompt не отправлен. Не создавать профили повторно. Пока новый отказ D02 не разобран, final14 не начинать. Если нужен новый runtime fix — новая сборка, целевая проверка и новая полная серия на одном кандидате.

## Канонические условия

Порядок старта D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Неизменные description.md + dataset.csv, фиксированный начальный prompt. GPT-5.6 Sol low, Loginom 7.4.2, macOS Desktop backend v1. До пяти независимых клиентов по последнему поручению пользователя; разные профили, сессии и пути пакетов. Предел 30 минут от отправки, без продления pending. Технические подсказки и ручное исправление графа запрещены. Analytical correctness и description completeness — not_checked. Бизнес-ответы пока не потребовались.

## Завершённая история

Baseline `.21.10`: 7 PASS / 3 BLOCKED. `.11` целевой D45 не прошёл. `.12` целевые D45/D48/D65 прошли; final12 9 PASS / 1 BLOCKED. `.22.1` целевой D27 прошёл; final13 7 PASS / 3 BLOCKED (D02/D36 маски, D24 ошибочный artifact_id модели). Все прежние Desktop и DEBUG_ONLY закрыты. Полный реестр причин, hashes и ограничений — в description-dataset-debugging-results.md.

D-F05/D-F06 исправлены в 5a144cd7c: ожидание масок после Done и Apply/Cancel до исходного срока, без повторных жестов; владелец проверяется, после маски требуется проверка quiet-state. 2287 runtime PASS / 2 Windows SKIP, source attribution 5045 PASS, общие macOS source checks 8/8 PASS. Ранние проверки под нагрузкой имели два отказа; изолированные полные повторы прошли, история сохранена. DEBUG_ONLY прежних D02/D36 прошли, но исходная долгая маска не повторилась. В target14 ожидания кратких масок наблюдались, но минутная live-маска пока не воспроизведена.

## Диагностика нового preview refusal

Первый DEBUG_ONLY повтор исходных запросов D02-target14 завершён (exit 0, host/child close awaited), пять операций PASS, шестая повторила отказ: native schema `verified=false`, reason=`preview_port_graph`, masks=[], принадлежащий исходному узлу PreviewWindow. Материалы `replay-preview-d02.log`, каталог `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-g1qnxW`.

Второй и третий DEBUG_ONLY завершены штатно. Третий (`replay-preview-identity-d02.log`, `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-vMKKzD`) подтвердил причину: global exact(tid) содержит два элемента — видимый в native graph и скрытый вне его. Native shape/port identity/hit-test корректны. Это не alternate SVG; экспериментальная проверка этой гипотезы удалена, приватный RED не считать регрессией подтверждённого бага.

Незакоммиченный runtime fix: node-preview-schema ограничивает уникальность tid подготовленным native graph; чужие native roots и дубликаты внутри graph всё ещё отвергаются. node-procedure сохраняет `node_observation_context_refused`, не разрешая жестов. Новая регрессия hidden foreign graph RED/GREEN; 89 узких PASS. Source transforms обновлены, 5045 PASS.

Полный runtime завершён: 2289 PASS / 2 Windows SKIP / 0 FAIL, `runtime-tests-15.log`. DEBUG_ONLY на исправленных файлах прошёл шесть исходных запросов, включая прежний отказ, и save; host/child close awaited, exit 0 (`replay-preview-fixed-d02.log`, `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-iforC6`). Все диагностические процессы закрыты.

Общие macOS source checks завершены: 8/8 PASS (`source-checks-15.{log,json}`). Далее review/commit, clean build `.20260922.3` в новый output, установка, целевые D02/D36 и новая полная final15 в пять клиентов. Старый final14 остаётся NOT_STARTED.

## Приватные материалы и продолжение

Корень evidence: `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`. Чаты, receipts, profiles, metadata и execution journals не переносить в Git. Не печатать headers, env или секреты.

Persistent Node REPL: `ctl` = attempt-controller-v7.mjs, `parallel13`, `targets14` (оба closed), `target14Manifest`, `final14Manifest`, `candidate14`, `installed14`, `pw`, `env`, `fs`. Старые slots13 закрыты и не используются. Полный финальный аудит: `audit-final.py <series>` проверяет последние состояния узлов, оригинальные файлы и CSV lineage, модель, порядок/изоляцию/длительность, save-after-graph, modified=false и закрытие. Исторический final13 повторно проверен, максимум одновременных клиентов 5.

Pinned Bun `/Users/kartamyshev/.cache/loginom-macos-build/tools/bun-darwin-aarch64/bun`; Node `/Users/kartamyshev/.cache/loginom-macos-build/tools/node-v24.19.0-darwin-arm64/bin/node`; browsers `/Users/kartamyshev/.cache/loginom-macos-build/browsers`. Проверки package-local. Сборка только чистого commit с новой версией/output; переменные полностью LOGINOM_AI_AGENT_CHANNEL/NODE_SOURCE/TEST_NODE/BROWSER_SOURCE, NODE_SOURCE — бинарник.

Следующее: диагностировать preview отказ; исправить подтверждённую причину и проверить; затем целевые и новая полная серия десяти задач в пять клиентов. В конце обновить results/план/бизнес-реестр/canonical Linux checkpoint, закрыть свои процессы и зафиксировать документы. Не объявлять 10/10 до нового полного успеха. F03/F07 recovery, полную причину F12 и compaction не заявлять без доказательств.
