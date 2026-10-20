# Browser recovery: порядок планов и общий контракт

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать дизайн самостоятельного восстановления Loginom через Playwright пятью последовательными планами; после каждого продукт остаётся рабочим и проверенным.

**Architecture:** Флаг сборки становится приватной capability runtime (план 1). Executor формулирует основание перехода T1–T4, выполняет общую проверку — чтения и собственные проходы консоли процессов и Preview — и пишет recovery-квитанцию (план 2). Bridge держит аренду браузера, allowlist Playwright MCP и бюджет шага; план 3 заканчивается первым прогоном на реальном Loginom. Host, агентский цикл и навык проводят того же агента через временный режим (план 4). Остальная приёмка и включение флага в release — последними (план 5).

**Tech Stack:** Node 24.19.0 и `node:test` (runtime), Bun 1.3.14 и `bun test` (host, agent, desktop, evals), Playwright MCP 0.0.82 внутри процесса runtime, MCP SDK, Effect Schema.

**Spec:** [docs/superpowers/specs/2026-10-19-browser-recovery-design.md](../specs/2026-10-19-browser-recovery-design.md)

## Результат и границы

- **Готово, когда** выполнены планы 1–5: BR-S1–BR-S6 проходят на реальном Loginom, host-тест BR-S7 зелёный, матрица доступности упакованных CLI и Desktop на Linux — PASS, строки естественных отказов — PASS или `BLOCKED` с ID прогонов, владелец дал команду слияния.
- **Первый проверяемый результат** — план 2, Task 0: на реальном Loginom существующие процедуры консоли процессов и Preview доказывают выполнение и читают схему с тихого графа после ручного выполнения. **Первый сквозной результат** — план 3, Task 5: BR-S1 и BR-S3 через `supervise()`.
- **Предусловия живых шагов** ([preflight-отчёт](../../testing/loginom-ai-agent/reports/2026-10-19-browser-recovery-preflight.md), пункты 2–4): зависимости runtime по lockfile, Chromium по pins и staged resources, приватная конфигурация Loginom, вход и связность с Dock. Плану 5 дополнительно нужны профили двух моделей и судьи, ID кейсов естественных отказов от 18.10 и вход в GitHub.
- **Исключения:** восстановление доставки входного файла; проверка настроек узла runtime; `completed` для шага без выполнения; приёмка на Windows и macOS; правки отдельных процедур Dock; новые читатели настроек; dev/beta.

| План | Файлы | Строки (+/−), оценка |
| --- | --- | --- |
| 1 | ~19 | ~+450 / −20 |
| 2 | ~17 | ~+1600 / −80 |
| 3 | ~15 | ~+1300 / −40 |
| 4 | ~9 | ~+400 / −20 |
| 5 | ~9 | ~+450 / −10 |

Превышение оценки плана вдвое — сигнал остановиться и пересмотреть подход.

## Global Constraints

- Базовый ориентир и номера строк планов — `d64cd92aa7`, PR в `demo-022`. Реализация начинается от актуальной `origin/demo-022` после сверки её отличий по файлам плана; фактическая база записана в checkpoint.
- При автономном выполнении планы идут последовательно в одной изолированной накопительной ветке с draft PR в `demo-022`. В неё перенесены документы дизайна и планов. Слияние и выпуск выполняются только отдельной командой владельца; промежуточное слияние не блокирует следующие задачи.
- Общий контракт ниже обязателен для всех планов. Имена и форматы меняются только правкой этого файла.
- Перед каждым PR: тесты затронутых пакетов, `bun typecheck` в изменённых Bun-пакетах, `git diff --check`. Checkpoint — до 20 строк: SHA, результат, ограничения, следующий шаг.

## Review Focus

Здесь только риски на стыках планов; остальные — в планах.

1. Жест общей проверки без подтверждённой квитанции не возвращает браузер ни модели, ни Dock (план 2, Task 5; план 3, Task 2).
2. Повторный `finish` после `unresolved` не сталкивает идентичности квитанций проверки (план 2, Task 5).
3. Состояние попытки теряется между runtime и агентом. План 4, Task 2 разбирает `_meta` настоящим `CallToolResultSchema` в ветках успеха и ошибки.
4. Release-сборка получает режим до приёмки. `release.yml` меняется только в плане 5, Task 4, после гейта.
5. Агент завершил ход при активной попытке. План 3, Task 4 и план 4, Task 1 переводят её в `stopped` по концу run.

---

## Планы

| План | Ветка | Результат |
| --- | --- | --- |
| [1. Флаг сборки](2026-10-19-browser-recovery-1-flag.md) | `recovery-build-flag` | runtime получает `browserRecovery: true` только от упакованной сборки с флагом |
| [2. Основание и проверка](2026-10-19-browser-recovery-2-basis.md) | `recovery-step-basis` | живая проба; executor выдаёт T1–T4, доказывает остановку, проверяет шаг проходами консоли и Preview, пишет квитанцию; `acceptanceFault` |
| [3. Аренда браузера](2026-10-19-browser-recovery-3-lease.md) | `recovery-browser-lease` | `dock_browser_recovery`, allowlist, бюджет и журнал в bridge; BR-S1 и BR-S3 на реальном Loginom |
| [4. Агент и навык](2026-10-19-browser-recovery-4-agent.md) | `recovery-agent-turn` | конец run в host, скриншот по capability модели, одно напоминание, текст навыка |
| [5. Приёмка и релиз](2026-10-19-browser-recovery-5-acceptance.md) | `recovery-acceptance` | evals, остальные сценарии, упакованные артефакты, включение в release |

## Решения владельца от 19.10

- Воспроизводимый отказ — приватный acceptance-only вход runtime `acceptanceFault` по образцу `acceptanceCleanupPackage`; продукт его не ставит. Он используется в source-level сценариях. Упакованные CLI и Desktop проверяются только на естественных отказах.
- Время бюджета — суммарное пребывание шага в `browser`; handoff и общая проверка его не расходуют. Каждый `finish` расходует один вызов из 30.
- База — `d64cd92aa7`.
- Allowlist — 16 инструментов, которые публикует Playwright MCP 0.0.82. `browser_press_sequentially`, `browser_check` и `browser_uncheck` в 0.0.82 доступны только навыкам (`skillOnly`); посимвольный ввод — `browser_type {slowly: true}`, чекбоксы — `browser_fill_form`.
- Общая проверка сама открывает и закрывает консоль процессов и Preview существующими процедурами. Жесты делает runtime, модель в это время не действует, сломанная процедура не вызывается. Не открылось окно — факт не проверен.
- Выполнение доказано, схема не прочитана — `unresolved` и повторный `finish`.
- Preview открывается для каждого запрошенного выходного порта: процедура открытия получает номер порта.
- Шаг без выполнения после восстановления получает не больше `continuable`; ограничение записано в дизайне (§8).
- Флаг включается для Linux, Windows и macOS; Windows и macOS отдельно не принимаются.
- Доставка входного файла в первую версию не входит (дизайн, §1, §5).

## Решения планов (подтвердить при ревью)

- `dock_browser_recovery` публикуется всегда, когда capability включена; `start` без основания отклоняется кодом `BROWSER_RECOVERY_NOT_OFFERED`.
- `stop` не делает UI-жестов. Ответ `stop` и автоматической остановки несёт `next_step` безопасного завершения: существующий `dock_operation_recover` с `abandon_operation`, если у узла есть драйвер освобождения и нет незавершённой verification; при неизвестной квитанции проверки — только инструкцию сообщить фактическое состояние. Для остановленной попытки отказ освобождения не возвращает `user_action`.
- Ни вызов Playwright, ни проход проверки не получают сигнал отмены: принятое действие завершается в собственных пределах (действие Playwright 15 с, `browser_wait_for` до ~60 с, проверка до 240 с), затем попытка переходит в `stopped`. Правила отмены host не меняются.
- Для `dock_browser_recovery` `runtimeCallTimeout` = 255000 мс (проверка 240000 мс и 15000 мс запаса); сроки host и адаптера агента выводятся из него. Handoff ждёт не дольше `min(остаток срока операции, 60000 мс)`: живой executor дольше минуты после остановки фазы — аномалия, и попытка честно уходит в `stopped`.
- Блокировка новых чатов после падения runtime — существующее поведение строгого режима восстановления host (`LOGINOM_AI_AGENT_STRICT_RECOVERY=1`); в режиме по умолчанию runtime закрывается вместе с браузером и попытка не возобновляется. Дизайн, §6, уточнён по коду; BR-S7 проверяет строгий режим.
- Узловой шаг получает `completed` только с проверенными выполнением и схемой; выполнение без схемы — `unresolved`; без установленного выполнения тихий граф даёт `continuable`. Без базовой линии выполнения (сбой до подготовки выполнения, например на `input_mapping`) выполнение не устанавливается.
- Сохранение, подтверждённое общей проверкой, не становится собственным Save для закрытия пакета при выходе CLI; это делает финальный Save через Dock, о чём говорит `next_step`.
- `run-released` остаётся: runtime чата переживает конец run (`retireRuntime` снимает только устаревший runtime, `host.ts:235-236`), и без уведомления попытка, в том числе на уже освобождённой операции (T4), осталась бы в `browser`. Сигнал `admit` для этого не годится: host шлёт его вместе с вызовами инструментов для приёма вложений.
- `compare` в evals не меняется; добавляется только `recovered_via_browser_count`.

## Общий контракт

### Флаг и capability

| Что | Значение |
| --- | --- |
| Вход сборки (читают только скрипты сборки) | `LOGINOM_AI_AGENT_BROWSER_RECOVERY=1` — включено, иначе выключено |
| Константа CLI | Bun `define` `LOGINOM_AI_AGENT_BROWSER_RECOVERY` = `'1'`/`'0'`; `InstallationBrowserRecovery: boolean` в `packages/core/src/installation/version.ts` |
| Константа Desktop | electron-vite `define` `import.meta.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY`; `BROWSER_RECOVERY` в `packages/desktop/src/main/constants.ts` |
| Метаданные артефакта | `browserRecovery: boolean` в `metadata` `cli-manifest.json` и в Desktop `release-manifest.json`; при чтении необязательное |
| Приватное поле | `browserRecovery: boolean`: `launchNodeHost` → handshake `start` → `createLoginomHost` → supervisor `Launch` → runtime `start` → bridge `config` |
| Диагностика | `session.metadata.browserRecovery`, записывается в `session.json` попытки |

### Инструменты

`dock_browser_recovery` (у агента `loginom_dock_browser_recovery`), вход `{action, ...}`, `additionalProperties: false`:

| `action` | Аргументы | Поля ответа (`structuredContent`, `result_version: "user-v1"`, `kind: "dock_browser_recovery"`) |
| --- | --- | --- |
| `start` | `operation_id` из `next_step.arguments` | `state`, `attempt_id`, `recovery_input`, `allowed_tools`, `budget`, `instruction` |
| `finish` | `report: {actions: string[] ≤30 (≤500 символов), result: string ≤2000, settings: string[] ≤50 (≤500 символов)}` | `state`, `result`, `verified`, `attested_by_model`, `receipt_id`, `budget`, `next_step` |
| `stop` | `reason: string ≤1000` | `state: "stopped"`, `stop_reason`, `summary`, `next_step` |

- Любой ответ со `state: "stopped"` (ответ `stop`, `start`, `finish` или allowlist-инструмента) несёт `stop_reason`, `summary` и `next_step`: при живой странице — безопасное завершение исходной операции, иначе `{instruction}` сообщить фактическое состояние.

- `attempt_id` — `br-<n>`, порядковый номер попытки в процессе runtime. Идентичность проверки — `<attempt_id>:v<k>`, где `k` — номер `finish` в попытке. Квитанция — `<attempt_id>:receipt`; пишется только при `completed` или `continuable`.
- `recovery_input.request` опускается с `request_omitted: true`, если сериализованный запрос длиннее 16384 байт: ответ `start` должен уложиться в 46000 байт, а inspect запрос не возвращает.

Allowlist Playwright MCP (у агента `loginom_<имя>`), ровно 16 имён: `browser_snapshot`, `browser_find`, `browser_take_screenshot`, `browser_click`, `browser_hover`, `browser_type`, `browser_press_key`, `browser_fill_form`, `browser_select_option`, `browser_drag`, `browser_mouse_click_xy`, `browser_mouse_move_xy`, `browser_mouse_drag_xy`, `browser_mouse_wheel`, `browser_handle_dialog`, `browser_wait_for`. У `browser_snapshot` и `browser_take_screenshot` удалён параметр `filename`; `browser_take_screenshot` требует `scale` (`css` или `device`).

### Состояния, результаты, основание

- `state`: `dock`, `handoff`, `browser`, `verifying`, `stopped`. `result`: `completed`, `continuable`, `unresolved`.
- Триггеры: `T1`/`NODE_RELEASE_REFUSED`, `T2`/`NO_RECOVERY_OPTIONS`, `T3`/`REPEATED_PHASE_FAILURE`, `T4`/`CONFIRMATION_LOST` с `effect` `execution`, `export` или `save`.
- Основание приходит модели как `next_step` ответа Dock:

```json
{"tool":"dock_browser_recovery","arguments":{"action":"start","operation_id":"apply-7"},
 "trigger":"T2","reason_code":"NO_RECOVERY_OPTIONS","effect":null,
 "step":{"kind":"node","document_id":"doc","workflow_id":"wf","node_id":"n1","phase":"configure"},
 "budget":{"calls_remaining":30,"ms_remaining":600000},"instruction":"…"}
```

- При исчерпанном бюджете шага `next_step` содержит только `instruction`: сообщить фактическое состояние; инструмента нет.
- Ключ шага: `node:<document_id>:<workflow_id>:<node_id>:<phase>`, `save:<document_id>:<package_path>`.
- Бюджет на ключ шага: 30 вызовов (allowlist-вызов модели или `finish`) и 600000 мс суммарно в `browser`. После `completed` ключ удаляется.
- Коды ошибок ответов: `BROWSER_RECOVERY_NOT_OFFERED`, `BROWSER_RECOVERY_ACTIVE`, `BROWSER_RECOVERY_INACTIVE`, `BROWSER_RECOVERY_TOOL_FORBIDDEN`, `BROWSER_RECOVERY_ARGUMENT_FORBIDDEN`, `BROWSER_RECOVERY_BUDGET_EXHAUSTED`, `BROWSER_RECOVERY_PAGE_CHANGED`, `BROWSER_CALL_UNCONFIRMED`, `RECOVERY_RECEIPT_UNCONFIRMED`.
- `stop_reason`: `model_stop`, `run_released`, `runtime_closed`, `handoff_unverified`, `budget_exhausted`, `page_changed`, `browser_call_unconfirmed`, `verification_unconfirmed`, `cancelled`, `receipt_unconfirmed`.

### Передача состояния агенту и IPC

- Каждый ответ `dock_browser_recovery` и allowlist-инструмента несёт `_meta["loginom/browser_recovery"] = {attempt_id, state, calls_remaining, ms_remaining}`.
- Агент копирует `{attempt_id, state}` в metadata части инструмента под ключом `loginomBrowserRecovery`. Напоминание — синтетическая текстовая часть пользователя с `metadata.browser_recovery_reminder = attempt_id`.
- Host → runtime: `{operation: "run-released"}` → `{released: true}` при `release` run агента.

### Журнал и acceptance-вход

- События `execution-events.jsonl` (поле `phase`): `browser_recovery_basis`, `browser_recovery_handoff`, `browser_recovery_state`, `browser_recovery_call`, `browser_recovery_verified`, `browser_recovery_dock_resumed`, `acceptance_fault_injected`. Обычные запуски без опции новых событий не пишут. Изображение в журнале — только `{mime, bytes, sha256}`.
- `acceptanceFault` (план 2, Task 7): массив до 4 записей `{kind: "phase_stop", node_type, phase, code, times}` или `{kind: "release_refusal", node_type, times}`; `code` соответствует `^[A-Z][A-Z0-9_]{0,63}$`, `times` — 1..3.
- Событие `acceptance_fault_injected` сохраняет `phase` как имя события, а фазу отказа — в `target_phase` (`release` для отказа освобождения); остальные поля: `kind`, `node_type`, `code`, `remaining`.

## Команды проверки

- Node и Bun — закреплённые версии из `packages/product/loginom-release.json`, не из обычного `PATH`.
- Runtime client: `cd packages/loginom-runtime/client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/<file>.test.mjs`; весь набор — `cd packages/loginom-runtime && PATH="$(dirname "$LOGINOM_AI_AGENT_TEST_NODE"):$PATH" bun run test:upstream`.
- Runtime entry: `cd packages/loginom-runtime && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/<file>.test.mjs`.
- Host: `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/<file>` и `bun typecheck`.
- Agent, desktop, product, evals: `bun test <file>` и `bun typecheck` из каталога пакета.
- `LOGINOM_AI_AGENT_TEST_NODE` — абсолютный путь к Node 24.19.0 из `packages/product/loginom-release.json`.

## Checkpoint — 20.10.2026

- База реализации: `0afb4c483a`; принятый код плана 3, Task 2: `c123d4afc0`.
- План 1, Tasks 1–4, и план 2, Tasks 0–7: выполнены и отмечены в подпланах; task reviews и итоговое whole-branch review приняты; четыре итоговых замечания исправлены и подтверждены scoped re-review.
- Последние полные source-проверки плана 2: runtime client 4420 PASS / 13 SKIP; focused 144/144; start-input 22/22; Host capability 2/2, Host typecheck и `git diff --check` — PASS.
- Task 0 на Loginom: реальный Calculator, новое успешное выполнение и схема Preview независимо подтверждены; итоговый собственный пакет, transport и браузер закрыты.
- Ограничение пробы: закрытие несохранённого пакета первой неудачной попытки осталось неподтверждённым.
- Проверки установленных артефактов и живого recovery ещё впереди; release-флаг в CI не включён.
- План 3 прошёл preflight и scoped review уточнений; Tasks 1–2 выполнены, 33/33 focused PASS; независимые task reviews без замечаний. CI опубликованного checkpoint плана 2 — PASS.
- Следующий шаг: план 3, Task 3 — browser dispatch и проверка страницы после каждого вызова.
