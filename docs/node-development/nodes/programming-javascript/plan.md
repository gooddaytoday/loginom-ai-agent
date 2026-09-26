# JavaScript: подплан исследования, разработки и приёмки

[Карточка](README.md) · [исследование](research.md) · [e2e](e2e-coverage.md) ·
[fixtures/oracle](fixtures/README.md) · [регламент](../../README.md) ·
[реестр](../../registry.json).

Дата: 2026-09-26. Подготовительный статус: **discovery_required**.
Component ID: `component.programming.JavaScript`.
Предлагаемый runtime type: `programming.javascript`; proposed mode: `script`.
Они **не существуют в текущем публичном API**. Исторического номера нет.
Исследованная база `loginom`: `a8ad59766dbdb4f2da0b54367a755ce00891dd71`.
Живой стенд по назначению пользователя:
**[http://logi-test-plan.bg.local/app/](http://logi-test-plan.bg.local/app/)**.
Целевой Loginom version/build/edition: **не проверен**. Текущий graph adapter
допускает 7.4.2; иной build требует отдельного подтверждения совместимости.
Первая платформа приёмки — Linux x64; остальные не сертифицируются этим планом.

Это результат plan-authoring, не назначение разработки. Наличие подплана
не запускает Goal, новую задачу, очередь, установку или live-операции.
При исполнении использовать [single](../../workflow/single-node.md),
[жизненный цикл](../../workflow/lifecycle.md),
[назначение](../../templates/assignment.md),
[completion](../../templates/completion.md) и [checkpoint](../../templates/checkpoint.md).

## Результат и границы

Модель получает бизнес-задачу и входную таблицу, понимает API Loginom,
самостоятельно пишет JavaScript, через один `dock_node_apply` создаёт либо
настраивает узел, выполняет его, читает результат и отдельно сохраняет пакет.
После нового открытия сохранённые код/настройки дают тот же независимый результат.
«Обучение» включает knowledge, обработчик интерфейса и проверку результата;
fine-tuning модели и train/apply аналитической модели здесь не нужны.

Рассмотрены три подхода:

1. Только подключить справочник — мало изменений, но JS отсутствует в handler,
   схемах и редакторных действиях; задача не решается.
2. **Рекомендованное табличное ядро**, затем расширения — позволяет полностью
   проверить код, динамическую схему, ошибки и persistence без зависимостей от
   внешней сети/файлов. Это исходный scope данного исполняемого подплана.
3. Сразу все возможности — потребует общих variable/multi-output контрактов,
   HTTP fixture, sidecar deployment и протокола async-ошибок. Эти работы
   сформулированы в разделе расширений, но не маскируются под готовность ядра.

### Обязательный scope ядра

- Ровно один подключённый табличный вход и один выход (port 0); new/existing.
- Синхронный код с `builtIn/Data`, scalar integer/real/string/boolean/datetime.
- Два отдельно проверяемых режима: схема задана в мастере (`declared`) либо
  формируется кодом (`code`). Это имена **предлагаемого** контракта.
- Полное чтение/замена исходника, в том числе LF, Unicode, кавычки, backticks,
  пустой код, строки URL и многострочный виртуализированный документ.
- NULL/empty/0/false, пустая таблица, 0/1/N выходных строк, повторное исполнение
  после изменения входа, сохранение выбранного порядка полей и строк.
- Настройка/Done, Close, Execute/read; синтаксическая и синхронная runtime-ошибка,
  исправление того же узла, local cancel и идентифицированный server stop.
- Save и независимый cold reopen с проверкой исходника, настроек, связей
  и полных малых результатов; одного зелёного статуса недостаточно.

Вне первого accepted scope: отсутствие входа, дополнительные таблицы/выходы,
variables ports, Variant, гарантированная арифметика всего int64, async/timers,
Fetch/FS, внешние ESM/CJS/JSON, builtIn/Calc, derived/locked components,
большие таблицы и другие платформы. Loginom умеет больше; это граница handler v1,
а не ограничение продукта. Не заявлять поддержку исключённого режима по Help.
Ограниченный scope не является песочницей для произвольного JS: не обещать
доказательство отсутствия побочных эффектов простым поиском слов в исходнике.

## Фаза 0. Документация, окружение и live discovery

Владелец — будущий разработчик single-задачи. Перед кодом прочитать источники
ниже; файлы с точными номерами строк и хешами перечислены в
[research](research.md), [e2e](e2e-coverage.md), [sources.json](sources.json).

### 0A. Допуск к работе

1. Сверить HEAD/base/незавершённые изменения. Текущая `javascript` содержит
   пользовательский untracked справочник; не удалять/перемещать его. Подготовить
   отдельный постоянный worktree под `.worktrees/<короткая-ветка>` по регламенту.
   Не считать текущий checkout уже изолированной средой разработки.
2. Подготовить локальную регистрацию памяти по
   [CURRENT.md](../../../../services/loginom-ai/tools/project-memory/CURRENT.md):
   build generation, preview/install hooks, отдельный bootstrap, реальные
   metadata/receipts, затем activation и actor health/find/read. Peer выводит
   механизм из cwd; не копировать macOS URI или авторизацию из исторической среды.
   После первого содержательного этапа проверить capture/extraction/read-back.
3. Оформить минимальную single campaign по [шаблону](../../templates/campaign.json)
   и общий [журнал хоста](../../templates/host-resources.json). Назначить отдельный
   разрешённый аккаунт Loginom, profile/browser/storage/package, все owners/leases.
   Если используется системный clipboard, учитывать его как общий ресурс.
4. Подготовить pinned Node24.19.0, Bun1.3.14 с требуемым revision, Playwright/MCP,
   Chromium1243 и платформенный action manifest. Найденный Node проверен,
   целый bundle ещё нет. Версии/hash брать из product pin, не shell PATH.
5. Использовать назначенный `http://logi-test-plan.bg.local/app/`; до live
   проверить DNS/сеть, отдельный разрешённый аккаунт/build/редакцию Loginom, доступность
   JS в палитре, storage и графическую сессию. Не занимать пользовательский
   браузер; только штатные Dock/runtime scripts в собственной среде.
6. Для приёмки понадобится самостоятельный CLI candidate и собственный OAuth
   profile; Desktop auth и shell proxy автоматически не засчитывать.
   Нужную модель проверить как `openai/gpt-6-sol`, variant `low`.

**Проверка выхода 0A:** заполненное assignment, действительные receipts
изолированных ресурсов/памяти, explicit base/source/build/pins. Здесь уже
обнаруженные пробелы — отсутствие CLI в проверенных путях, кампании/локальной
регистрации, mismatch shell Node/Bun; это устранимые задачи подготовки.
Неизвестный аккаунт/доступ — уточнить у пользователя только если его нельзя
надёжно установить из разрешённого контекста.

### 0B. Предметное исследование в Loginom

Использовать заранее подготовленные маленькие snippets и данные, не модель
приёмки как отладчик. Записывать version/build, собственные identities и очищенные
observations. Источники: Help JS/API/output-tables/ports; e2e `js_helpers.ts`,
`js_general.ts`, `js_data_output.ts`; runtime `node-target-browser.mjs`.

| Gate | Что установить | Условие закрытия |
| --- | --- | --- |
| G1 identity/editor | Component/fulltype/icon/group, реальный wizard/editor, дополнительные settings, порядок страниц | Наблюдаемые owner paths и полный readback принадлежащего узла; исторические selectors сверены |
| G2 execution points | Выполняют ли код Next, Done, Preview/Test, Execute; когда доступны generated columns | Явная диаграмма переходов/эффектов для обоих режимов; нет скрытого повторного исполнения |
| G3 schema/mapping | CodeConfigurableColumns, declared columns, autosync/required, two-sided mappings, change schema | New и existing сохраняют намеренные связи; несовместимость обнаружена до потери настроек |
| G4 source identity | Полный CodeMirror документ, пределы/Unicode/LF, redaction/digest, immutable receipt | Сохранённый текст целиком совпадает с принятым canonical source; публичная очистка не меняет исполняемый текст |
| G5 type semantics | null/undefined/empty, named access/case, int64/Number, Date bridge и точное scalar read | Заранее фиксируемый typed oracle, никаких выводов по округлённому preview |
| G6 diagnostics/lifecycle | Parse error vs sync throw, ownership ошибки, Stop/Close/cancel, потерянные ответы | Классифицированный terminal/ambiguous outcome; сохранён прежний исходник и соседний граф |
| G7 persistence | Полный исходник/options/schema после save/new open, свежий execution | Независимое чтение без перенастройки expected; доказано сохранение последней редакции |

Отдельно проверить синтаксис `??`, `?.`, top-level await, async function,
lookbehind, BigInt, globalThis изолированными snippets: один parse error не
должен скрыть результаты остальных. Подтвердить минимум используемого subset,
не пытаться заявить полную ECMAScript conformance. Async probes характеризуют
среду, но не расширяют accepted scope v1.

**Выход 0B:** `discovery.md` (создать при выполнении) с наблюдениями, версией,
подтверждённым порядком действий и ограничениями. Для G1–G7 здесь доказывается
осуществимость на прямых probes и фиксируются решения; готовый handler на этом
этапе не требуется. После этого статус плана — `ready_for_development`.
Окончательное закрытие gates по реализации происходит в фазах 1–4. Если стенд
или конкретный gate недоступен, оставить `discovery_required`, сохранить
checkpoint с owner/next trigger. Никаких вымышленных controls/API.

## Фаза 1. Контракт и доставка знаний модели

Источники образцов: `node-contracts.mjs`, `node-api.mjs`, `node-support.mjs`,
`node-contracts.d.ts`, `node-result-schema.mjs`; compact path `bridge.mjs`,
`user-workflow.mjs`, `user-results.mjs`, `describeNodeTypes`.

### 1A. Предлагаемый публичный контракт

После discovery-решений G1–G7 закрепить его в plan/discovery до реализации:

- Тип `programming.javascript`, mode `script`, input/output 0. Не добавлять
  возможность выбирать произвольный browser script или RPC.
- `parameters.source_text`: полный текст. Для new обязателен; для existing отсутствие
  означает сохранить старый код, пустая строка — явная замена на пустой.
  Уже существующий `parameters.source` — объект импорта `imports.text`;
  его форму не менять. JS schema привязать к своему type и проверить
  совместимость import/JS в compact и full envelopes.
- `parameters.schema_mode`: `declared|code`; для new обязателен.
  `parameters.columns` — полный упорядоченный declared-набор с name, label,
  scalar type, data_kind и usage. В code режиме структура создаётся программой;
  её нельзя угадывать парсингом текста или подменять ожидаемой таблицей.
- Existing `{}` сохраняет исходник и настройки, но возвращает наблюдённую
  конфигурацию; изменение режима не должно очищать несогласованные manual mappings.
- Входные/выходные mappings, finish/read и lifecycle — существующая оболочка.
  Валидировать names, duplicates, типы, форму списка, режим и bindings до эффекта.
- Предлагаемый v1 bound исходника: **32 KiB UTF-8, 1024 LF-строки**, без CR/NUL.
  Это выбранный инженерный предел, не предел ChakraCore. Public schema и
  локальная проверка байтов должны согласоваться. Source выше лимита — отказ
  до мутации, не обрезание. Изменять предел только явно по результату G4.

Это предварительная форма, не пример существующего callable API. Если discovery
покажет несовместимость, исправить спецификацию до объявления ready; не оставлять
исполнителю выбор двух несовместимых контрактов. Общие файлы закрепить за одним
owner этой single-задачи; согласовать перенос при наличии другой кампании.

### 1B. Knowledge

Подготовить одну версионированную редакцию справки с provenance исходного
пользовательского файла и официальных страниц. Исправления перечислены в
[аудите](research.md#5-официальная-документация-и-особенности-chakracore).
Сам исходный файл сохраняется неизменным.

Короткие обязательные правила и scalar Data API доставлять on-demand в
описании JS через `dock_action_describe`; полные материалы/будущие расширения
разделить по версиям и feature scope. Не вставлять весь 51-KiB документ во все
разговоры. Не считать remote SKILL или root Markdown автоматически прочитанным.
Новый knowledge asset должен входить в resource manifest и runtime pin;
отдельно фиксировать knowledge SHA, clientRevision и skillRevision.

Контекст узла содержит наблюдённые порты/technical names/types, schema_mode,
mapping, код либо явный отказ полного чтения, source digest и identities.
Данные/labels/comments не становятся инструкциями. Модель не подменяет
нехватку наблюдения догадкой о порте, API или старом коде из истории.

### 1C. Исходник и журнал

Установить контракт raw source → digest/length → private execution data →
redacted evidence. Проверенный код вводится байт-в-байт в принятой LF-форме;
для публичных журналов не гарантируется полное раскрытие исходника.
При необходимости отдельного приватного snapshot применить существующие
ownership/права/retention; не добавлять скрытый общий архив исходников.
Точный acknowledge подтверждает согласованную квитанцию и digest, а не
равенство исходника изменённому redactor тексту. Публичные URL/password-like
строки должны проходить без изменения программы и без снятия очистки.

**Проверка фазы:** новые pure parameter tests, согласованность compact/full
schemas/handler, factual model-visible describe, digest/pin mutation test,
redactor regression на несекретных литералах. Отрицательные inputs не вызывают
graph/editor. Запрет generic browser JS остаётся действующим.

## Фаза 2. Узкий редактор и конфигурация

Пример чтения CodeMirror и keyboard-only записи:
`workspace-ui.mjs:2536–2597,3482–3501`; pure readback:
`calculator-readback.mjs`; компактный handler: `reform-node.mjs:25–46`.
Копировать принципы ownership/полного чтения, не selectors калькулятора.

Создать JS-specific modules (предлагаемые имена `javascript-parameters.mjs`,
`javascript-context.mjs`, `javascript-node.mjs`, `javascript-readback.mjs`)
и узкий private intent замены текста. До/после жеста проверить тот же
document/workflow/node/editor, полный старый текст и фокус. Чтение видимых pre
не является доказательством полного документа. Не применять setValue,
модельный page.evaluate, eval/Function, прямой RPC или редактирование XML пакета
в обход штатного UI. Код из source — данные для редактора Loginom.

Настраивать флаг формирования столбцов и declared fields по подтверждённой
процедуре. Existing сохраняет незапрошенные description/cache/intermediate/
port properties. Source/readback фиксирует полные code hash/length, настройки,
schema/mapping, receipts и observation scope; echo request не считается чтением.

**Проверка фазы:** exact text для empty/Unicode/quotes/CR rejection/длинного
документа и границы лимита; no duplicate inserts; сохранение текста при
переходах мастера; foreign dialog/focus/epoch; отмена редактора и восстановление
исходного кода. Dedicated editor разрешён только своему узлу; общий CodeMirror
deny тест остаётся зелёным.

## Фаза 3. Жизненный цикл, схема и восстановление

Основа: `createTabularTransformNodeSupport` из `calculator-node.mjs:35–48`,
`node-procedure.mjs`, `node-apply.mjs`, `node-execution-procedure.mjs`,
`node-execution-evidence.mjs`, `node-read-contract.mjs`.
Переиспользовать общий graph/connect/execute/read, если G2 подтверждает порядок.
Иначе описать минимальное JS-specific расширение фазы, а не общий интерпретатор
сценариев или второй браузер.

1. Связать вход, наблюдать его схему, открыть принадлежащий узлу мастер.
2. Применить исходник/настройки и проверить G2-последовательность materialization.
   Отметить каждое фактическое исполнение; Preview не считать read-only.
3. Согласовать output schema и mapping. Для нового code output можно применить
   подтверждённую default autosync-политику. Existing manual/required fields
   сохраняются; несовместимая смена требует явного решения, не очистки.
4. Done фиксирует конфигурацию без обещания свежего выхода; Close отбрасывает
   только свой draft. Если предварительный input mapping уже коммитится,
   неподдержанный Close-комбинированный запрос отклонять до изменения.
5. Execute привязать к одному native execution. Read на маленьких fixtures
   должен доказать полное покрытие: row_count, sample_complete, схема, все ячейки,
   precision и freshness. `read.coverage=full` Свёртки не переиспользовать молча.
6. Повторить чтение через `dock_node_read` по квитанции последнего принятого
   apply. Существующий read проверяет execution/schema, но не актуальный JS
   source digest. Добавить JS-specific подтверждение source identity либо
   отдельный read-only аудит; не выдавать старый execution за результат
   изменённого кода/входа. Изменение требует нового исполнения.

### Ошибки и восстановление

| Ситуация | Требуемое поведение |
| --- | --- |
| Invalid parameters/type/name/cap/port | Отказ до target/editor mutation |
| Syntax error | Ошибка относится к своему wizard; исходник/черновик и cleanup явно установлены, нет SUCCEEDED |
| Sync runtime throw | Свежий native failed execution, bounded diagnostic, результат не refreshed; можно исправить тот же узел |
| Lost reply после ввода/Done/Execute | Сначала inspect того же owner/operation; неизвестный эффект не повторять |
| Same operation ID, другой source/settings | Конфликт; не новый запуск |
| Local cancel / server stop | Разные операции; Stop только identified execution, дождаться фактического terminal/cleanup |
| Timeout | Оригинальный deadline не продлевать; wait timeout не доказывает завершения |
| Async rejection / console.error | Не объявлять корректность по статусу; вне accepted v1, результаты probes сохранить отдельно |

Автоматическое «исправление» пользовательского алгоритма или бизнес-формулы
не является техническим recovery. После ошибки исправляется только установленная
причина при сохранении согласованного намерения. Чужие пакеты/связи не меняются.

**Проверка фазы:** fixed/code schema, 0/1/N rows, both Close/Done/Execute,
изменённый upstream, разрешённая смена схемы, known failure, lost reply,
ограниченный long-running stop и успешный последующий rerun. Настройка и эффект
исполнения отражены отдельно, нет второго Execute при неизвестном исходе.

## Фаза 4. Независимый oracle и сохранение

Уже подготовлены [fixtures](fixtures/README.md) и ожидаемые бизнес-значения.
Будущие `javascript_configuration_evidence.py`, `javascript_output_evidence.py`,
`javascript_node_acceptance.py` — **TO_IMPLEMENT**, не существующие команды.
Взять структуру разделения configuration/output из
`tools/loginom-acceptance/calculator_*` и требования точности из `collapse/*`;
старый Hermes transport не запускать. Точный CLI/driver invocation нового
аудитора вписать в checkpoint до ready_for_acceptance.

Oracle читает реальные source/options/ports/mappings и typed values независимо
от handler. Подготовить нативные typed fixtures по `typed-cases.json`, сохранить
их hashes. Вход с большими int64 нельзя заранее преобразовать в JS Number.
Для real диагностического roundtrip значений 0, −1.25 и 10.125 требуется
exact value/native-byte equality: числа точно представимы в двоичном формате,
а копирование не оправдывает погрешность. Основная целочисленная задача также
требует exact equality. Для будущей неточной арифметики допуск задаётся отдельно
с объяснением его происхождения. Date сравнивается без
необоснованного timezone преобразования; NULL не равен empty/zero/false.

После подтверждённого save закрыть только свой пакет/контекст, независимо
открыть сохранённый `.lgp`, прочитать конфигурацию и выполнить заново без передачи
нового кода/expected. Сопоставить полный исходник или independently obtained
digest, оба schema modes, все связи/выходы. Save receipt и ZIP/XML inspection
полезны, но без cold execution не доказывают воспроизводимость.

**Проверка фазы:** oracle отвергает заранее внесённые подмены значения, типа,
порядка, количества, source digest, mode/mapping, execution и усечение.
`JSTableCompare.lgp` не использовать как независимый oracle JavaScript.
Старые FAIL и evidence каждой попытки сохраняются; expected не подгоняются.

## Фаза 5. Адресные тесты, ревью и кандидат

Из каталога `packages/loginom-runtime/client`, переменная `LOGINOM_NODE`
указывает на проверенный Node24.19.0. Это существующие baseline-команды:

```sh
"$LOGINOM_NODE" --test test/node-api.test.mjs test/node-apply.test.mjs test/node-apply-runtime.test.mjs test/node-result-schema.test.mjs test/user-workflow.test.mjs test/user-results.test.mjs
"$LOGINOM_NODE" --test test/workspace-ui.test.mjs test/node-read.test.mjs test/node-execution-evidence.test.mjs test/node-execution-stop.test.mjs test/package-persistence.test.mjs test/execution-journal.test.mjs
"$LOGINOM_NODE" --test test/calculator-context.test.mjs test/calculator-parameters.test.mjs test/calculator-procedure.test.mjs test/calculator-readback.test.mjs
```

Дополнить их созданными JS tests фаз 1–4; до запуска проверить реальные имена
файлов. Полный `"$LOGINOM_NODE" --test test/*.test.mjs` нужен при затронутых общих
контрактах/редакторе/журнале. Не прогонять постоянно весь suite после каждой
документальной правки. Source provenance обновить по `docs/migration/source-map.json`
и проверить штатным `script/migration/verify_sources.py`.

В runtime нет script typecheck. Если меняются Agent/Host TS — `bun typecheck`
из соответствующего пакета; при затронутом provider schema adaptation также
`bun test test/provider/transform.test.ts` из `packages/agent`.
SDK/Client generation нужны **только** при изменении соответствующих public
Protocol/Server HttpApi/SDK контрактов; не добавлять бессмысленную регенерацию
из-за MJS handler и не редактировать generated вручную.

E2E выполнить отдельно по [каталогу](e2e-coverage.md) на Node16.20.2,
подготовленном test target и single concurrency. Зафиксировать actual active/skip
counts, build и JUnit. Отсутствующие deps/стенд — BLOCKED этой проверки,
не PASS и не доказанный дефект JS. Пропущенные важные сценарии перенести
в адресную матрицу handler, не считать их автоматической готовностью.

После завершения разработки — один отдельный проход ревью на Astra/medium
в той же задаче, затем один раунд исправлений подтверждённых live-дефектов
и адресная перепроверка. Это не независимое контекстное ревью.

Из зафиксированного source собрать отдельный immutable standalone candidate
по [runbook](../../../testing/loginom-ai-agent/standalone-cli.md) и
`packages/loginom-host/script/build-cli.ts` из owning package. Нужны новые
absolute output directory, `LOGINOM_AI_AGENT_NODE_SOURCE`,
`LOGINOM_AI_AGENT_BROWSER_SOURCE`, exact Bun revision, manifest и hashes.
Не смешивать source handler со старым installed bundle; не заменять рабочую
пользовательскую установку. Candidate включает knowledge asset и его pin.

**ready_for_acceptance:** G1–G7 закрыты; code/source tests и live matrix имеют
результаты; ревью/исправления завершены; exact auditor invocation, fixtures,
oracle и candidate зафиксированы; собственный OAuth/profile готов; есть слот.

## Фаза 6. Автономный CLI и критерий завершения

Выполнять по [CLI-регламенту](../../workflow/acceptance-cli.md), не копировать
старые Hermes launchers из исторических аудиторов. Модель:
**`openai/gpt-6-sol`, `low`**, существующая ChatGPT OAuth-подписка.
Использовать один общий host acceptance slot и атомарный `acceptance.lock`;
локальная single campaign не создаёт второй слот.

Две независимые последовательные попытки — code и declared schema — получают
только бизнес-задачу/входы/уникальный save path. Условия model workspace и
вариант задания описаны в [fixtures README](fixtures/README.md).
Модель сама генерирует код и собирает сценарий; подача готового JS/графа/
ожидаемых чисел превращает прогон в DEBUG_ONLY. Если задача решена другими
узлами без проверяемого JS handler, это не его приёмка.

На каждую попытку отводится **30 минут** от отправки задания; контроллер
предела внешний, у `run` нет флага node acceptance deadline. По истечении
останавливать свой CLI штатно, сохранять исход и проверять cleanup.
Raw stdout/БД/system/reasoning не архивировать: сначала отбор публичных событий
и redactor, затем evidence. Не использовать `--thinking`, `--continue`,
старое безусловное `recover --acknowledge` или fallback модель.

После каждого прогона независимый аудитор проверяет:

1. Input hashes, фактические model/variant/build/source/candidate/knowledge SHA.
2. Исполнен component JavaScript через новый handler, правильный schema mode,
   исходник не содержит подставленных ответов, вход действительно подключён.
3. Полная схема/порядок/6×4 ячейки/NULL rules и свежий execution; суммы вторичны.
4. Последняя редакция сохранена и независимо открывается/выполняется без ремонта.
5. Собственные операции/пакет/browser/runtime закончены; unknown cleanup не PASS.

Обновить card/registry/checkpoint/completion только по полученным evidence.
Не повышать одновременно integration/release: «принят» не означает merge,
push, релиз или обновление установленного клиента. На этом single-задача
заканчивается; следующий узел не назначается.

## Матрица требований → проверки → результата → доказательства

Все строки ниже пока **not_checked**, кроме статического исследования и
baseline 24/24, указанных в research. Идентификаторы пригодны для отчёта.

| ID / требование | Проверка | Ожидаемый результат | Evidence |
| --- | --- | --- | --- |
| J01 knowledge | Actual describe/prepare в candidate | Версия/hash и Data API доступны модели; нет ложного editor context | Очищённый tool response + knowledge manifest |
| J02 input/schema | Imported sales, technical names/types | 6×5, пробелы и порядок сохранены до JS | Input receipt + hash |
| J03 code output | Sales task, code mode | expected.json 6×4 exact | Native execution + полный typed output |
| J04 declared output | Те же данные, declared mode | Тот же бизнес-результат, другое проверенное setting | Configuration + typed output |
| J05 source | Empty/Unicode/LF/URL/long/cap+1 | Полное равенство в bound, сверх bound отказ до записи | Source digests + editor receipt |
| J06 null/types | Нативные typed-cases | null/empty/0/false различимы; Date/real по заданному правилу | Typed values/native bytes |
| J07 safe integer | Decimal-string/native inputs | Exact safe-range; вне него нет ложной гарантии | Input/output precision evidence |
| J08 empty/cardinality | Empty и 0/1/N rows | Полная схема и верное число/порядок | row_count + complete read |
| J09 schema edits | declared↔code, manual required fields | Нет silent reset; допустимое изменение или явный отказ | Before/after mapping |
| J10 same node | Изменить исходник, сохранить другие свойства | Один узел, точный новый код, нет дублей | Node identity + configuration |
| J11 freshness | Changed/reordered source | 2700/2850 в changed; reordered равен baseline | Новый execution + all-cell oracle |
| J12 validation | Invalid code/parameter/unknown field | Раздельные ошибки, нет false success | Owned diagnostic + cleanup |
| J13 recovery | Lost reply/same-ID/cancel/stop | Нет повторного неизвестного эффекта | Журнал фаз/operation/native execution |
| J14 Done/Close | Configure и discard | Нет ложного fresh output; предыдущие настройки сохранены | Config/dirty-state receipts |
| J15 persistence | Save/new open/execute | Последний source/options/schema и те же результаты | Saved artifact + cold audit |
| J16 oracle integrity | Преднамеренные подмены | Каждая подмена отклоняется | Oracle negative report |
| J17 UI regression | Общий deny и соседний calculator | Generic code запрещён, прежние узлы работают | Адресные source tests |
| J18 autonomy | Две Sol low попытки | Без технических подсказок, полный заявленный scope | Sessions/events/completion |
| J19 context | Изменённые поля/старый код, label/comment с текстом инструкции | Используется текущее наблюдение; содержимое данных не меняет задачу | Context/source identities + tool evidence |

## Следующие расширения узла

Каждое расширение получает отдельное назначение/версию scope, собственный
oracle и CLI-приёмку; ядро не считается «всем JavaScript».

1. **Zero/multi-input, variables, multi-output.** Перед изменением API исследовать
   создание/удаление/порядок портов и variable bindings. Current public read
   ports=0/1, default=[0] и отсутствие additional output contract — реальные
   зависимости. Multi-output требует Loginom7.3+. Проверки: gaps/неподключённые
   порты, два выхода с разным числом строк, пустой второй выход, false/0/null
   variables, input remapping after reopen, #11986.
2. **builtIn/Calc и Variant.** Разрешённые функции/плагины, locale, исключения
   контекстных Calc функций, typed per-cell output. Не считать имя поля типом;
   не приводить Variant к строке ради oracle.
3. **ESM/CJS/JSON и FS.** Отдельная доставка sidecars с hashes, сохранённый
   package path, nested relative imports, UTF-8/UTF-16LE BOM, missing module,
   cache scope/rerun. FS только в собственном разрешённом storage; exact bytes,
   permissions/cleanup, save/move/reopen. Не предполагать npm/Node APIs или
   автоматическое включение файлов в `.lgp`.
4. **Async/Fetch.** Управляемый HTTP fixture доступен из Loginom Server,
   а не только из браузера агента. Success/404/500/malformed JSON/redirect/
   timeout/abort(reason)/TLS; body single-read. Сначала определить протокол
   завершения/ошибки async, post-cancel callbacks и эффект Preview. Version gate
   AbortController≥7.3, credentials shape требует probe; не отключать TLS
   ради PASS. Console и успешный статус не заменяют бизнес-результат.
5. **Масштаб/редакции.** Полный результат >100 строк, ресурсы, ограниченные
   diagnostics, другие Loginom builds и Windows/macOS. Умеренная нагрузка и
   конечные скрипты; не проводить непредусмотренный стресс рабочего сервера.

## Точка продолжения

Подтверждено: статическое исследование процесса/docs/код/Help/e2e; исходные
SHA; отсутствие handler; условия окружения; набор fixtures и независимые
ожидания; baseline 24/24 и document validation. Продуктовый код не менялся.

Открыто: G1–G7 и все runtime/CLI строки матрицы, фактический аккаунт/build,
изоляция/память worktree, полный candidate, e2e dependencies, JS auditor.
URL стенда уже назначен: `http://logi-test-plan.bg.local/app/`; повторно
спрашивать выбор адреса не нужно. Владелец продолжения — назначенный single-разработчик; next trigger — команда
выполнить этот подплан, затем закрытие 0A и live discovery.

При таком назначении Astra/medium создаёт Goal до готовности к первому ревью,
без самоназначенного token_budget; checkpoint сохраняется на каждой границе.
Текущая задача планирования Goal не создавала. Обычные probes/правки/проверки
в уже назначенном scope не требуют повторного разрешения. При реальном блокере
указать конкретное недостающее условие, owner и безопасный следующий шаг.
