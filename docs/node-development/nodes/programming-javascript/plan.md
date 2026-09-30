# JavaScript: подплан исследования, разработки и приёмки

[Карточка](README.md) · [исследование](research.md) · [e2e](e2e-coverage.md) ·
[fixtures/oracle](fixtures/README.md) · [рекомендации ревью](review-recommendations.md) ·
[проверка рекомендаций](review-verification.md) · [перепроверка ускорения](acceleration-review.md) ·
[регламент](../../README.md) · [реестр](../../registry.json).

Дата: 2026-09-26; порядок продолжения обновлён 2026-09-29 по acceleration review.
Подготовительный статус: **discovery_required**; часть runtime уже реализована.
Component ID: `component.programming.JavaScript`.
Runtime type: `programming.javascript`; mode: `script`. В ветке `node-javascript`
они уже описаны в схемах, но публичный apply handler ещё не зарегистрирован.
Исторического номера нет.
Исследованная база `loginom`: `a8ad59766dbdb4f2da0b54367a755ce00891dd71`.
Живой стенд по назначению пользователя:
**[http://logi-test-plan.bg.local/app/](http://logi-test-plan.bg.local/app/)**.
Целевой build обучения — **Loginom 7.4.2** (решение пользователя 2026-09-26).
К нему относится исходный [справочник](references/js_node_loginom_system_prompt.md),
и тот же build допускает текущий graph adapter (`node-target-browser.mjs:318`).
В 0A подтверждён фактический Loginom **Enterprise 7.4.2** под выделенным
аккаунтом; evidence — [checkpoint](checkpoint.md). Через принадлежащий сеансу
`Session.Version.IsWindows=false` отдельно подтверждена ОС сервера **Linux**;
дистрибутив и версия ядра не установлены.
Иной build — блокер подготовки, а не основание переносить знания 7.4.2.
Первая платформа приёмки — Linux x64; остальные не сертифицируются этим планом.
Все браузерные действия, диагностические пробы и CLI-приёмка выполняются
**только в headed-режиме** (назначение пользователя 2026-09-26). Использовать
общий `client/lib/browser-launch.mjs`: `headless: false`, maximized,
`--force-device-scale-factor=1`, viewport `null`. Не заменять видимый запуск
headless или виртуальным экраном без отдельного назначения пользователя.
Режим фокуса — **обычный headed-запуск без `--x11-no-focus`**: последнее
указание основной задачи от 2026-09-29 07:47 UTC — «запуская браузер как обычно».
Предыдущее указание X11 относилось к одной итерации и выполнено; последующее
использование флага оператором не является новым пользовательским назначением.
Исторические no-focus evidence сохраняются со своим режимом. Возвращать этот
opt-in можно по новому явному назначению с зафиксированной инструкцией, а не по
отсутствующему `headed-browser-focus-x11.md`.

Первоначальный подплан подготовлен в режиме plan-authoring. Пользователь затем
назначил исполнение; актуальная фаза и допуск памяти зафиксированы в
[checkpoint](checkpoint.md). Сам документ не запускает очередь или live-операции.
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
большие таблицы, другие build Loginom и платформы. Loginom умеет больше; это граница handler v1,
а не ограничение продукта. Не заявлять поддержку исключённого режима по Help.
Ограниченный scope не является песочницей для произвольного JS: не обещать
доказательство отсутствия побочных эффектов простым поиском слов в исходнике.

## Порядок продолжения после acceleration review

Срез этой правки: docs `13a02e8be2d698d5fbc7f19d146fa82d55f53e48`, code
`7b8e19bee073cb596607688173234e57052e27b1`. Это ревизии чтения, не новая
продуктовая база. Решения ниже применяют разделы 6–9 и 13
[обзора](acceleration-review.md); обязательные G1–G7, J01–J27 и фазы 0–6
сохраняются. Буквы A–F задают порядок связанных результатов внутри этих фаз,
а не дополнительные gates. Правка документов не запускает исполнение.

### A. Однократная актуализация и правила возобновления — P0

- Читать сначала текущую сводку и «Указания пользователя» в
  [checkpoint](checkpoint.md), затем нужный gate в [discovery](discovery.md)
  и строки J-матрицы ниже. Историю открывать адресно по указанному evidence.
  Перед новой операцией сверить реальные процессы, browser context, pending
  operation/receipts и ownership/leases. Живую попытку наблюдать по её handle;
  timeout наблюдения не разрешает новый запуск или смену профиля.
  Выполненные разовые указания не повторять после компакции; новый запрос
  отличать по времени/содержанию, а не по повторному появлению в контексте.
- Canonical docs/checkpoint находятся в основном checkout ветки `javascript`;
  код — в `.worktrees/node-javascript`. Проверять оба HEAD и status. Старый
  checkpoint и untracked handoff/design файлы child не заменяют каноническую
  сводку и не включаются в code commit через `git add .`. Их перенос/удаление
  не является предпосылкой разработки; до отдельного решения сохранять на месте.
- Таблица discovery разделяет решение 0B и проверку реализации. Публичный
  source-read, managed writer/Code Next/Done, типовая оболочка, knowledge и
  module preflight уже существуют. Подключать их по фактическим exports;
  переизобретать source-read или валидатор не требуется. Полный JS apply ещё
  отсутствует; возврат клика Next/Done не подтверждает переход/commit.
- В 0B остаются точные вопросы G1 identity/assistant, G3 source→physical,
  G5 обязательных API/J24 и G6 Stop/cancel. G2 принимает консервативную
  трактовку Next/Done как потенциально эффектных действий; доказывать отсутствие
  скрытого исполнения не требуется. Решения G4/G7 об осуществимости приняты
  в пределах имеющихся probes, а public/candidate/CLI проверки остаются в фазах
  1–6. Статус `discovery_required` не обнуляет выполненную реализацию.
- Допуск Ubuntu/worktree/памяти из 0A не проходить заново без затрагивающей
  перемены окружения или фактического отказа. При недоступной памяти действует
  пользовательское правило остановки; исключение из обзора P2.4 **не принято**.
  После восстановления сверить состояние и capture, затем продолжить с checkpoint.

Выход A: актуальные сводки, уровни J01–J27 и следующий результат B записаны.
Это документационное условие в данной правке выполнено; новых live PASS нет.

### B. Публичный configure существующего узла — внутренняя веха подтверждена

В фазах 1–3 связать действующие `validateJavascriptParameters`,
`inspectJavascriptModulePolicy`, source admission и managed adapter/writer
из `client/lib/javascript-*.mjs` с owned lifecycle. Опорные точки на code SHA
выше: `javascript-managed-code-next.mjs:109`
(`dispatchManagedJavascriptCodeNext`) и `javascript-managed-done.mjs:99`
(`dispatchManagedJavascriptDone`); actual public source-read уже зарегистрирован
в `node-api.mjs` и `executor.mjs`. Перед изменением прочитать эти реализации
и соответствующие `client/test/javascript-*.test.mjs`.

Один связный результат: existing code-table с сохранением settings, expected
digest и effective module policy проходит write → full readback → Code Next →
Done → подтверждение своего графа → независимый публичный source-read.
Проверенный исходный case меняет только комментарий (`javascript-live.mjs:1161`).
«Без смены схемы» — граница этого фиксированного operator-only source, а не
гарантия для произвольного кода. Схему нельзя доказывать парсингом source.

**До B-live устранить две конкретные несовместимости композиции:**

1. `node-apply.mjs:288–300` требует `execution_started=false` после Done,
   а `javascript-managed-done.mjs:67` возвращает `null` и
   `wizard_commit_verified=false`. Ожидание графа и новый source-read должны
   подтвердить commit, но не превращают неизвестные внутренние эффекты Verify
   в доказанное отсутствие исполнения. Нужен узкий JS-specific finish verifier:
   различить подтверждённую конфигурацию, наблюдённую границу execution и
   отсутствие **явного** Execute от неизвестных внутренних эффектов. Сохранить
   эту неопределённость в evidence/диагностике; не приводить `null` к `false`
   ради общего guard. Старый verifier остальных типов остаётся строгим.
   При незавершённом переходе или неопределённом собственном действии операция
   остаётся unsettled; успешное чтение source само это не отменяет.
2. Публичный Done использует `configuration.status=applied`,
   `execution.status=not_requested`, `output.status=not_refreshed` (без нового
   execution ID и свежих ячеек). `not_requested` означает, что явный Execute
   не запрашивался, а не доказанное отсутствие внутренних эффектов.
   `configured_only` — отдельное operator mapping evidence с
   `source_identity_verified=false`; это не `output.status` и не полное
   сопоставление выходных полей. Если оно или JS readback выводится модели,
   согласованно расширить `node-result-schema.mjs`, `node-contracts.d.ts`
   и compact projection в `user-results.mjs`,
   проверить локальную full/user-v1 projection и относящуюся к B source/direct
   часть J21 до B-live; candidate/CLI часть остаётся в F. Нельзя добавлять сырой operator-объект
   в ответ в обход публичной схемы. Полный source mapping требует G3 и Execute.

Маршрут B — публичный dispatcher в изолированном acceptance runtime:
`createActionRuntime` (`executor.mjs:1358–1360`) уже принимает
`nodeApplyHandlers`/`nodeApplyDriverFactory`. При `allowCandidate:true` только
в испытательной среде подключить реальный ограниченный JS handler поверх
штатного набора/drivers, сохранив `imports.text`, нужный
для доступности node tools; браузер, gate и журнал остаются теми же.
Его pure admission до target/graph/editor допускает только existing,
`finish=done`, `inputs=[]`, `mappings=[]`, `read.ports=[]`, замену source с
expected digest; прочие parameters, включая смену режима/columns, запрещены.
До редакторной мутации наблюдением подтвердить текущий code-режим и сохранение
settings. Live использует закреплённый
source+комментарий и исходную code-схему; остальное отклоняется до мутации.
`validateJavascriptParameters` переиспользовать, но он сам по себе допускает
new/declared/execute и не заменяет это ограничение trial. В продуктовом
`createCandidateNodeSupport` JS до готовности полного handler не регистрировать:
текущая карточка не описывает частичную поддержку. B даёт public API-path
evidence в испытательной среде, не installed candidate или CLI-приёмку.

Перенести из private operator только нужные ожидания/предикаты в `client/lib`;
направление зависимости — operator → runtime. Runtime не импортирует
`tools/loginom-acceptance` и его fixtures/oracle. Каждый эффект сохраняет свой
ACK/receipt и остаток исходного deadline; неизвестный ответ не повторяется.
Текущий цикл imports через `executor`/managed adapter из-за `withBrowserReceipt`
не расширять новыми обратными зависимостями. При необходимом выделении receipt
helper — отдельная адресная правка с прежними receipt/gate tests, без переноса
всего executor или operator. Это сохраняет проверенную композицию ценой
отложенного общего рефакторинга; независимый oracle по-прежнему не использует
продуктовый verifier для доказательства правильности результата.

Проверка B: локальные wrong owner/focus/digest, lost reply/no duplicate,
отказ неподдержанного trial до target, точные Done/result schemas и regression
остальных типов, затем headed case с точным source/settings, неизменными
input mapping, настроенными output targets/связями графа и cleanup 3/3.
Неподтверждённые source→physical связи не выдавать за сохранённое полное mapping.
Existing configure остаётся внутренней вехой полного v1.

Результат 2026-09-29: узкий injected handler в child code
`f8ceebcac98ac6c7eb0dc69d5eed918e85c21e86` прошёл headed
`public-node-apply-03` с независимым public source-read и cleanup 3/3.
Точный SHA, source/settings/mapping/graph evidence, два предыдущих отказа и
границы результата записаны в [checkpoint](checkpoint.md).
Обе несовместимости перед B-live закрыты; продуктовый registry JS не расширен.
Следующий связный результат — ранние P1-пробы 6×4 и Stop/cancel ниже, затем C/D.

### Ранние различающие пробы — P1, до фиксации Execute/read контракта

1. **Бизнес 6×4 (J02–J04/J11/J16/J20).** На существующем операторе провести
   минимально достаточные 1–3 сгруппированных прогона: оба schema mode на
   `sales.csv`, затем changed/reordered с заранее закреплённым oracle.
   Сначала проверить input 6×5, краевые пробелы Customer и реальные mappings
   переставленного импорта; потом все 6×4 значения, типы, порядок и freshness.
   Брать задания/ожидания из [fixtures README](fixtures/README.md) и hashes
   manifest. Эталонный JS остаётся operator-only, без передачи модели/knowledge.
   Это ранняя проверка осуществимости и oracle, не public/CLI приёмка и не
   замена C/D. Диагностический результат 6×2 недостаточен. Если найден дефект
   oracle, остановить сравнение и оформить отдельное решение до модельных
   попыток; expected под наблюдённый output не менять.
2. **Stop/cancel (G6/J13).** До долгого исполнения через handler провести
   отдельную пробу конечного цикла с пределом не более 60 секунд и собственным
   native execution. Сначала проверить применимость общего
   `createNodeExecutionProcedure(...).stop()` из `node-execution-procedure.mjs`
   и native proofs `node-execution-evidence.mjs`; образец проверки —
   `client/test/node-execution-stop.test.mjs`. Затем наблюдать Stop, terminal,
   cleanup и успешный короткий rerun того же узла. Local cancel проверить
   отдельно: он не доказывает server stop. Lost reply не допускает повтор Stop
   или Execute без inspect. Бесконечный цикл и стресс общего стенда запрещены.
   Результат определяет контракт Stop/deadline и правило ограниченных циклов
   в knowledge; неизвестный Stop блокирует соответствующий путь и приёмку.

Ранний P1 Stop/cancel подтверждён `p1-stop-finite-08`/source `0328cadfc9`:
native cancelled за 6,612 секунды, отдельный local cancel, short rerun того же
узла с полным 6×4 oracle и cleanup 3/3. Evidence/hashes и границы — в checkpoint.
Это осуществимость фиксированного private пути; public/CLI J13 и aggregate G6
не закрыты. Далее C/D, повтор этого finite trial без затронувшего изменения
не нужен.

Безопасность проб проверяется локально до live. Новая неопределённость требует
связи с обязательным требованием, различающего наблюдения и условия завершения
в существующем checkpoint; отдельный исследовательский трекер не нужен.

### C–F. Полные сценарии и неизменная приёмка

- **C — code:** создание нового JS-узла и входа, доказанный G3 bridge,
  материализация, отдельный Execute, полный public read 6×4; затем Save и
  независимый cold reopen/Execute с точным source/settings/mapping (фазы 2–4).
- **D — declared:** тот же lifecycle и результат, отдельно заданные columns,
  порядок/типы/data_kind/usage с readback `DefaultUsageType`; собственный
  Save/cold (фазы 2–4). Успех code не доказывает declared.
- **E — остаток J01–J27:** existing/schema edits, changed/reordered freshness,
  типы/NULL/точность/0–1–N, limits/redaction/chunks, диагностика, recovery,
  context, module policy, budgets и соседние узлы. Переиспользовать evidence
  только при совпадающих пути, scope и незатронутом контракте; обязательную
  защиту очередного live-шага нельзя откладывать до E.
- **F — фазы 5–6:** один проход ревью и исправления, immutable standalone
  candidate, J01/J21 delivery и J27, затем две независимые последовательные
  CLI-попытки code/declared на Sol low по 30 минут. Обе — только
  `http://logi-test-plan.bg.local/app/`. Source/direct J01/J21 нужны до ревью,
  candidate-часть — после сборки; J18 не является gate разработки.

Текущий результат C (2026-09-30): isolated public run05/code `97098322a1`
подтвердил все 13 phases, новый Code узел, полные native mappings, две owned
completed execution identities и owned Views/full typed UI 6×4. Независимый
output-only audit подтвердил полный business oracle; исходный run целиком
не принят из-за ошибки JSON schema input mapping, пакет/сеанс закрыты отдельным
recovery. `e615f4df7f` исправил контракт и ordinary cleanup при отказе oracle;
`ed56268a6d` подключил существующий owner-bound Save после Code/source-read.
Свежий headed Code → Save прошёл полный независимый audit и cleanup3/3;
отдельный cold reader без source/oracle также подтвердил source/settings,
fresh Execute/read6×4 и cleanup3/3. Fixed C принят в isolated runtime; D/E/F и
product candidate/CLI открыты; receipts/status/hashes —
в checkpoint.

### Итерации, диагностика и автоматизация — P1/P2

Единица работы — законченная возможность или снятая неопределённость. В начале
итерации кратко назвать результат, связанные изменения, локальные tests/live-case
и затронутые evidence; не требовать полного стендового цикла после каждого helper.
После второго сходного FAIL пересмотреть гипотезу; повтор допустим лишь после
изменения проверяемого фактора. Unknown effect сначала разрешается inspect/recovery.

При дефекте ожидания проверить все ожидания того же класса **на пути сценария**
(например, disabled `x-mask` в editor/port/mapping), вынести совпадающий predicate
в runtime и покрыть одной адресной регрессией с вариантами состояний. Не игнорировать
все masks и не продлевать deadline. В имеющийся report/journal писать stage,
elapsed/remaining, owner, waiting/refused/ready, blocker и переходы; измерять
browser-call latency отдельно. Ограниченные samples вместо DOM/screenshot на poll;
причину отказа мастера читать сразу по lifecycle, не ждать остаток timeout.

`CLEANUP_UNCONFIRMED` разбирать как собственный класс дефектов. Сначала установить
состояние исходного процесса/context и native execution. Пока владелец жив или
операция pending, пользоваться его status/inspect/recovery; второй browser/context
и новый login того же аккаунта не запускать. Unsettled lease не освобождать
по одному завершению процесса; не форсировать завершение владельца ради recovery.
Лишь после подтверждённого отсутствия живого
browser/context и записи передачи ownership под `registry.lock` тонкая обёртка
может запустить отдельный read-only recovery на свежем профиле: только точный
account/package identity, без повтора неизвестного жеста, с отдельным report.
Logout/browser close выполнять только после подтверждённого безопасного
состояния своей recovery-сессии; отсутствие browser не доказывает завершения
серверного исполнения или закрытия пакета. При неопределённой передаче — отказ,
без автоматической второй попытки восстановления.
Если наблюдается открытый пакет, нужны применимый безопасный owned cleanup или
явная эскалация по lifecycle; не называть такую мутацию read-only и не закрывать
пакет по одному имени. Recovery не переписывает статус исходного прогона.
`package-cleanup.mjs` требует receipts/session/document текущего контекста;
его нельзя вызвать из нового профиля как доказательство cleanup старой сессии.

После первого полного public сценария допустимы две небольшие команды поверх
существующих инструментов: (1) выбранные tests → validator → pins → явный список
файлов commit/push; (2) fresh profile/lease → headed run → audit → recovery →
краткая сводка. **Это планируемые обёртки, готовых команд пока нет**. Они прекращают
работу при отказе шага, не повторяют мутации, не меняют семантику доказательств
и не добавляют новую систему автоматизации. До использования закрепить точные
invocations и проверить fault path. Автоматизация не блокирует B–D.

Полный client suite нужен при изменении общих контрактов/editor/journal перед
handoff связанной пачки; без нового изменения его не повторять после docs.
Независимые cold reopen, code/declared CLI и recovery остаются отдельными,
каждый browser process получает свежий профиль. Batch допустим только с
проверенными graph/input identities каждого case; ресурсы одного аккаунта
не параллелить. Счётчики перекрывающихся tests не складывать в уникальное покрытие.

Checkpoint обновлять на границе возможности/фазы, при решении, блокере,
неизвестном эффекте и остановке; факты отдельных runs хранятся в report+SHA.
В текущей сводке — уровень, evidence и остаток, затем неизменённая история.
Эффект оценивать по числу запросов модели на связанную итерацию, времени
подготовки/ожидания/проверки, повторам без новых данных и причинам cleanup.
Baseline раздела 12 обзора — ориентир, не обещание процента ускорения; новая
телеметрия и полный повторный аудит архива не требуются.

## Фаза 0. Документация, окружение и live discovery

Владелец — назначенный разработчик single-задачи. Перед кодом прочитать источники
ниже; файлы с точными номерами строк и хешами перечислены в
[research](research.md), [e2e](e2e-coverage.md), [sources.json](sources.json).

### 0A. Допуск к работе

Ниже исходный bootstrap нового worktree. Для уже допущенной кампании
`javascript-20260926-ubuntu` пользоваться её receipts из checkpoint и проверять
только изменившиеся предпосылки; не создавать повторную кампанию/worktree/Peer.

1. Сверить HEAD/base/незавершённые изменения. Исходный пользовательский
   [справочник](references/js_node_loginom_system_prompt.md) хранится в Git;
   его содержимое сохранять, runtime-редакцию готовить отдельно в фазе 1B. Подготовить
   отдельный постоянный worktree под `.worktrees/<короткая-ветка>` по регламенту.
   Не считать текущий checkout уже изолированной средой разработки.
   `product_base_sha` — полный `a8ad59766dbdb4f2da0b54367a755ce00891dd71`;
   `plan_source_sha` — отдельно закреплённый полный commit с согласованными
   документами этой ветки. На продуктовой базе этих документов ещё нет.
   Создать worktree от product base, пройти регистрацию памяти на этом HEAD,
   затем перенести перечисленные docs-only commits до `plan_source_sha`.
   До переноса проверить ancestry и отсутствие продуктовых изменений. Основная
   область — `docs/node-development/`; отдельно разрешены только актуальные
   `services/loginom-ai/tools/project-memory/CURRENT.md` и `ubuntu-adapter.md`,
   на которые ссылается регламент. Code-коммиты memory kit не переносить.
   После переноса — hashes плана/fixtures/справочника и новый HEAD. Не переносить
   незакоммиченные файлы автоматически и не подменять base SHA регистрации.
   Ubuntu-адаптация координаторских helpers может быть отдельным code-коммитом
   основного checkout: записать его SHA в checkpoint и не включать автоматически
   в набор docs-only commits. Проверять каждый выбранный commit, а не считать
   все изменения между product base и plan source документационными.
2. Подготовить локальную регистрацию памяти по
   [CURRENT.md](../../../../services/loginom-ai/tools/project-memory/CURRENT.md):
   build generation, preview/install hooks, отдельный bootstrap, реальные
   metadata/receipts, затем activation и actor health/find/read. Peer выводит
   механизм из cwd; не копировать macOS URI или авторизацию из исторической среды.
   После первого содержательного этапа проверить capture/extraction/read-back.
   На Ubuntu учитывать фактический plugin ID, доступный Codex executable и
   права файлов из актуального `CURRENT.md`; подтверждение прежней установки
   на macOS не закрывает этот gate. Ход исполнения — в [checkpoint](checkpoint.md).
3. Оформить минимальную single campaign по [шаблону](../../templates/campaign.json)
   и общий [журнал хоста](../../templates/host-resources.json). Назначить отдельный
   разрешённый аккаунт Loginom, profile/browser/storage/package, все owners/leases.
   Если используется системный clipboard, учитывать его как общий ресурс.
   Для каждого отдельного запуска discovery на Ubuntu назначать новый пустой
   browser profile с записью в assignment/host lease и receipt смены; старые
   профили сохранять. Повторный persistent profile воспроизводит native download
   crash (см. [checkpoint](checkpoint.md)); штатный managed runtime уже создаёт
   профиль под новым attempts/randomUUID. Один held context внутри запуска
   допускает несколько отдельно привязанных проб. Recovery прежнего сеанса
   выполняется отдельно, без повторения неопределённых скачиваний.
4. Подготовить pinned Node24.19.0, Bun1.3.14 с требуемым revision, Playwright/MCP,
   Chromium согласованной версии и платформенный action manifest. Исходная база
   закрепляла Chromium1243; выявленные на Ubuntu аварии и проверку кандидата1246
   учитывать по [checkpoint](checkpoint.md). Версии/hash брать из product pin,
   не shell PATH; проверенные Ubuntu toolchain и source bundle описаны в checkpoint.
   `verifyResources` проверяет целостность относительно собственного manifest;
   отдельно сравнить его поля с product release pin. В Ubuntu source bundle
   обнаружен прежний MCP endpoint при совпадающих остальных release fields:
   его нельзя принять как candidate только по успешному hash-check. Собрать
   новый candidate по актуальным pins; подробности в checkpoint.
5. Использовать назначенный `http://logi-test-plan.bg.local/app/`; до live
   проверить DNS/сеть, отдельный разрешённый аккаунт, редакцию Loginom, доступность
   JS в палитре, storage и графическую сессию. Отображаемый build стенда должен
   быть ровно 7.4.2; записать также ОС сервера Loginom, от которой зависят
   Atomics и поведение движка. Не занимать пользовательский
   браузер; только штатные Dock/runtime scripts в собственной среде.
   `loginBrowser` подтверждает account, но не готовность рабочего интерфейса.
   Перед навигацией дождаться видимой страницы «Начало», а после перехода —
   нужного native active tab. В 0A ранний переход «О программе» дал NodeIndex
   error; после ожидания страницы и проверки active About node переход прошёл.
   Не применять фиксированную задержку или повторять действия с неизвестным эффектом.
   Для прямых runtime-проб effective URL содержит `?testable=true`;
   managed Host добавляет его штатно. Исторические `test-2`/`test-4` не являются
   текущим назначением аккаунта. Нужен подтверждённый владелец ресурсов;
   имя `user` само по себе не доказывает ни занятость, ни изоляцию.
   **Отдельная предпосылка CLI — J27:** исходная база мигрировала exact URL
   стенда на `Product.connection.url` (`https://app.loginom.ai`). В текущем
   `node-javascript` уже есть fix `9d75933fac`: `urlSource: explicit` сохраняет
   явно заданный URL, прежние записи без provenance проходят legacy migration.
   Для текущего candidate использовать это решение. Альтернативный
   `1b8d100392` в `origin/preserve-loginom-url` убирает миграцию полностью;
   автоматически складывать оба исправления или брать тесты одного с кодом
   другого нельзя. До сборки сверить ancestry/diff итогового source, записать
   один выбранный контракт и выполнить owning Host regression/typecheck.
   Если база получила альтернативное решение, сначала явно обновить это решение
   и его тесты в плане. На собранном candidate доказать сохранение exact
   origin/path между setup/status и новым процессом. Миграция назначенного URL
   остаётся блокером подключения даже после успешных source tests.
   Не обходить проблему чужим адресом, скрытым URL alias или ослаблением проверки
   origin; до её решения direct source probes не засчитываются как CLI-приёмка.
6. Для приёмки понадобится самостоятельный CLI candidate и собственный OAuth
   profile; Desktop auth и shell proxy автоматически не засчитывать.
   Нужную модель проверить как `openai/gpt-6-sol`, variant `low`.

**Проверка выхода 0A:** заполненное assignment, действительные receipts
изолированных ресурсов/памяти, explicit base/source/pins, подтверждённый build
стенда 7.4.2 и записанная ОС сервера. Исторические пробелы CLI, кампании,
регистрации и shell Node/Bun не считать текущими без новой проверки: Ubuntu
допуск и source toolchain уже подтверждены в checkpoint. Immutable candidate
и его OAuth/target persistence проверяются отдельно в фазах 5–6.
Неизвестный аккаунт/доступ — уточнить у пользователя только если его нельзя
надёжно установить из разрешённого контекста.

### 0B. Предметное исследование в Loginom

Использовать заранее подготовленные маленькие snippets и данные, не модель
приёмки как отладчик. Записывать version/build, собственные identities и очищенные
observations. Источники: Help JS/API/output-tables/ports; e2e `js_helpers.ts`,
`js_general.ts`, `js_data_output.ts`; runtime `node-target-browser.mjs`.

Инструмент исследования — операторский
`packages/loginom-runtime/tools/loginom-acceptance/javascript-live.mjs`
уже существует в `node-javascript`; переиспользовать его: одна принадлежащая
задаче runtime/browser session, наблюдаемые UI-жесты, bounded snippets,
очищенные evidence и обязательный cleanup. Общий `dock_ui_action` запрещает
редакторы кода, JS handler ещё отсутствует. Не снимать этот запрет ради discovery.
В образцах заменить устаревшие macOS profile/browser paths на pinned Linux
ресурсы из 0A; не копировать raw dumps и зашитый build как доказательство версии.
Пробы не запускают сторонний чат-помощник или ещё одну LLM.

Таблица ниже задаёт полное требование gate, включая реализацию. Для выхода
именно из 0B применять отдельные колонки решения и остатка в [discovery](discovery.md);
public handler и CLI не являются условиями завершения исследования.

| Gate | Что установить | Условие окончательного закрытия в фазах 1–4 |
| --- | --- | --- |
| G1 identity/editor | Component/fulltype/icon/group, реальный wizard/editor, дополнительные settings, порядок страниц | Наблюдаемые owner paths и полный readback принадлежащего узла; исторические selectors сверены |
| G2 execution points | Выполняют ли код Next, Done, Preview/Test, Execute; когда доступны generated columns | Явная диаграмма переходов/эффектов для обоих режимов; нет скрытого повторного исполнения |
| G3 schema/mapping | CodeConfigurableColumns, declared columns, autosync/required, two-sided mappings, change schema | New и existing сохраняют намеренные связи; несовместимость обнаружена до потери настроек |
| G4 source identity | Полный CodeMirror документ, пределы/Unicode/LF, redaction/digest, immutable receipt | Сохранённый текст целиком совпадает с принятым canonical source; публичная очистка не меняет исполняемый текст |
| G5 type semantics | null/undefined/empty, named access/case, int64/Number, Date bridge и точное scalar read | Заранее фиксируемый typed oracle, никаких выводов по округлённому preview |
| G6 diagnostics/lifecycle | Parse error vs sync throw, ownership ошибки, Stop/Close/cancel, потерянные ответы | Классифицированный terminal/ambiguous outcome; сохранён прежний исходник и соседний граф |
| G7 persistence | Полный исходник/options/schema после save/new open, свежий execution | Независимое чтение без перенастройки expected; доказано сохранение последней редакции |

Накопленные доказательства G2/G3 сведены в [переходы и эффекты](execution-effects.md).
Документ отдельно отмечает подтверждённое исполнение Preview/Execute,
неустановленные эффекты Next/Done и native failure несовместимого manual mapping.
Он не закрывает gates и не заменяет последующую проверку реализации.
При проектировании G3 использовать подтверждённый declared editor:
видимый список `Назначение` записывает `DefaultUsageType` через
`fpDefaultUsageType`, а не `UsageType`. Отдельно проверять доступность вариантов
для выбранного типа колонки и фактическое сохранённое значение; список одного
пустого editor не доказывает все сочетания типов и назначений.

Наблюдение Ubuntu operator17: у JS с подключённым input0 мастер начинается
с JavaScriptColumnsWizard (index0, четыре индикатора); отдельной первой страницы
TuneDataSourceInputPortWizard, наблюдённой у несоединённого узла, нет. Admission
и переходы должны учитывать native page identity, а не фиксированные индексы.
При пропуске input page подтвердить полную входную schema/mapping отдельным
принадлежащим узлу port reader. Cleanup имеет собственный ограниченный срок
и не повторяет истёкший opening admission. Это наблюдение не закрывает G2/G3.

Отдельно проверить синтаксис `??`, `?.`, top-level await, async function,
lookbehind, BigInt, globalThis изолированными snippets: один parse error не
должен скрыть результаты остальных. Так ограничения справочника 7.4.2
проверяются на движке того же build; результаты записать вместе с build
и ОС сервера. Подтвердить минимум используемого subset,
не пытаться заявить полную ECMAScript conformance. Async probes характеризуют
среду, но не расширяют accepted scope v1.

На назначенном стенде 7.4.2 отдельно наблюдены native parse refusals для
`??` (`SyntaxError: Syntax error at code (:4:33)`), `?.`
(`SyntaxError: Syntax error at code (:4:48)`), regex lookbehind
(`SyntaxError: Unexpected quantifier at code (:4:36)`) и BigInt literal
(`SyntaxError: Unexpected identifier after numeric literal at code (:4:34)`).
Для `??` потребовался ручной клик и admin recovery; `?.`, lookbehind и BigInt
прочитаны собственным оператором со штатным cleanup. Отдельный
`typeof globalThis` дал строку `object` с проверенным typed UI oracle.
Объявление `async function` отдельно дало `typeof probe === "function"`;
сама функция не вызывалась. Top-level `await` в отдельной пробе отвергнут
native `SyntaxError: 'await' expression not allowed in this context at code
(:4:27)`.
Точные source SHA и различия доказательств — в
[engine profile](engine-profile.json) и [checkpoint](checkpoint.md).
Эти наблюдения не характеризуют остальной ES subset; J20 остаётся открытым.

Индексированная discovery-матрица `engine-profile.json` теперь имеет
наблюдения для всех 30/30 закреплённых snippets с точными source hashes:
14 успешных typed UI, 7 характеристик, 6 native отказов мастера и 3
принадлежащие native child failures. Один отказ (`??`) опирается на ручное
чтение и последующий admin recovery, а не на штатный operator cleanup.
Это не замена native G5 roundtrip, примеров будущей v1 knowledge, сведений об
ОС сервера или CLI J20-приёмки; подробная сверка — в
[checkpoint](checkpoint.md).

**Операторский барьер перед следующими syntax probes:** применить общий порядок
[чтения кнопки ошибки мастера](../../workflow/lifecycle.md#отказ-мастера-и-кнопка-ошибки)
в `javascript-live.mjs` и `javascript-stage-observer.mjs`. После единственного
жеста и завершения маски распознавать текущий отказ на той же странице, читать
ограниченную подсказку `btnError`, один раз открывать штатный диалог, если он
не открылся сам, читать точный текст, закрывать его OK и проверять прежний
мастер до cleanup. Отличать кнопку от прошлого отказа от результата ещё
идущего жеста; при неопределённости жест не повторять. Записывать owner,
source SHA, класс/позицию только из текста Loginom, обе строки и усечение.
Адресные тесты: тихий отказ, самопроизвольный диалог, старая кнопка после
исправления, незакрытый диалог. `engine-probe-06` не повторять. Барьер реализован
в дочерней ветке `node-javascript` (до интеграции в `javascript`): оператор
ревизии `180f1d5810` проверен на отдельных `engine-optional-chain` и
`engine-lookbehind` попытках с полным cleanup;
см. [checkpoint](checkpoint.md). Это не закрывает весь J20 или public handler.

Обязательный профиль движка охватывает предпосылки задания и runtime-справки:
`trim`, кириллические `toLowerCase`/`toUpperCase` (включая Ё/ё), strict-mode
diagnostics и все примеры будущей v1-редакции. Проверить отдельно литералы
и строки из наблюдённого входа. Отдельный [дизайн native G5](native-types-design.md) закрепляет независимую
аттестацию typed input до JS и границу переиспользования native reader;
его private real/NULL input-only admission и identity JS roundtrip подтверждены
source70/probe07 (12 native cells); source71 отдельно подтвердил boolean (9 cells)
и string (24 cells), включая NULL/empty/false/Unicode/multiline. Source72
подтвердил safe int64 identity (12 cells, NULL/0/±9007199254740991);
outside-safe probe отдельно показал 9007199254740993 →9007199254740992
при точных INPUT/upstream (9 cells), без общей гарантии int64. Source74
подтвердил Date identity:9native+9civil observations, NULL и обе canonical даты
с миллисекундами сохранены; epoch/timezone не установлены. Source75 подтвердил
кардинальности keep2: [1,2,3] →[2] (7 native cells) и duplicate:
[1,2,3] →[1,1,2,2,3,3] (12 native cells), с неизменным upstream. Source77
подтвердил odd: [1,2,3] →[1,3] (8 native cells), original upstream также точен.
Предыдущие odd01/02 отказы до JS source сохранены как отдельные неуспешные runs.
Source81/empty04 подтвердил UI declared-empty/nativezero: [1,2,3] →[] →[1,2,3],
6 native cells,655 refs,1245 pins; все4 private cardinality cases проверены
(см. [дизайн отдельных случаев](native-cardinality-design.md)).
Source82 подтвердил все [семь фиксированных Integer coercion случаев](native-integer-coercion-design.md)
в независимых headed runs: ±1.75 →±1, String «42» →42,
String «not-an-integer» и вычисленный NaN →native NULL,
вычисленные ±Infinity →−9223372036854775808. INPUT/upstream проверены отдельно;
21 native cells суммарно. Это bounded observations, не общий алгоритм conversion.
Весь G5 остаётся открытым, включая [named/index/case и J24](native-named-access-design.md);
точные доказательства и ограничения — в checkpoint. Exact integer oracle
от этого не меняется. Неудача сначала локализуется по коду/входу/native output;
ожидания не подгоняются и причина не объявляется «отсутствие ICU» без доказательства.

`Intl`, locale formatting/comparison, non-ISO Date.parse, расширенные regex/
ES2016–2022 — дополнительная диагностика, пока их нет в v1-примерах.
Для Date основным остаётся native/civil roundtrip. Его ограниченный
[дизайн и условия допуска](native-datetime-design.md) закрепляют отдельные
civil/native INPUT до JS и проверки OUTPUT/upstream. Не полагаться на сохранение
globals: несколько rerun не доказывают их сброс во всём пуле. Профиль хранит
source hash каждого snippet, build/ОС, observed/not_checked, результат и свой hash;
он не подтверждает свойства другого сервера или полную ECMAScript conformance.

В G1 наблюдать реальную версию/настройки редактора и наличие помощника либо
переключателя движка. Их существование пока не установлено. Если переключатель
есть и влияет на исполнение, закрепить выбранный режим в контракте/readback;
с помощником не взаимодействовать. В G3 отдельно проверить допустимость и
нормализацию кириллических/недопустимых Name, возвращать реальные technical names.

**Выход 0B:** актуальный [discovery.md](discovery.md) с наблюдениями, версией,
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

Контракт частично реализован (`168d4f88d0`, см. checkpoint). Сопоставлять
существующие schemas/preflight с решениями G1–G7 и дополнять остаток:

- Тип `programming.javascript`, mode `script`, input/output 0. Не добавлять
  возможность выбирать произвольный browser script или RPC.
- `parameters.source_text`: полный текст. Для new обязателен; для existing отсутствие
  означает сохранить старый код, пустая строка — явная замена на пустой.
  Уже существующий `parameters.source` — объект импорта `imports.text`;
  его форму не менять. JS schema привязать к своему type и проверить
  совместимость import/JS в compact и full envelopes.
  Для замены existing-кода требовать `parameters.expected_source_sha256`
  из полного source-read; несовпадение свежего observed digest отклоняется
  до замены. Новый узел и existing без изменения source этого поля не требуют.
- `parameters.schema_mode`: `declared|code`; для new обязателен.
  `parameters.columns` — полный упорядоченный declared-набор с name, label,
  scalar type, data_kind и usage. В code режиме структура создаётся программой;
  её нельзя угадывать парсингом текста или подменять ожидаемой таблицей.
- Existing `{}` сохраняет исходник и настройки, но возвращает наблюдённую
  конфигурацию; изменение режима не должно очищать несогласованные manual mappings.
- Входные/выходные mappings, finish/read и lifecycle — существующая оболочка.
  До эффекта проверить форму запроса, names/duplicates, declared types, режим
  и доступные input identities. Существование generated output fields
  проверять после owned materialization; ошибка не означает отсутствия уже
  выполненных эффектов. Зафиксировать их и выполнить предусмотренный cleanup.
- Предлагаемый v1 bound исходника: **32 KiB UTF-8, 1024 LF-строки**, без CR/NUL.
  Это выбранный инженерный предел, не предел ChakraCore. Public schema и
  локальная проверка байтов должны согласоваться. Source выше лимита — отказ
  до мутации, не обрезание. Изменять предел только явно по результату G4.

В ответе apply полный исходник не дублируется: вернуть наблюдённые SHA-256,
UTF-8 bytes, число строк, равенство принятому запросу и конфигурацию/выход.
32 KiB — предел входа, а не обещание размера JSON-ответа. Уменьшение до 16 KiB
не устраняет worst-case экранирование; бюджет доставки проверяется отдельно.

Для чтения existing-кода до исполнения использовать уже подключённую source-ветку
`dock_node_read` с `kind: "source"` (`0c513c445a`, headed proof в checkpoint);
прежний output-read без этого discriminator сохраняет контракт.
Source-запрос содержит operation ID,
prepared document/workflow и existing JS node ref, но не source/settings,
output options или разрешение Execute. Completed execution/source_operation_id
не требуется: существующий output-read заново выполняет узел и здесь непригоден.
Первая квитанция возвращает bounded text chunk, raw digest/общие bytes/lines,
owner identity и opaque cursor. Продолжение связано с тем же digest/owner и
отклоняется при изменении исходника. Границы chunks не разрывают Unicode.
G1/G2 должны подтвердить безопасные open/read/discard своего мастера, отсутствие
исполнения/commit и cleanup. Это UI-навигация, не автоматически readOnlyHint.
До первого chunk проверить redaction полного canonical source с тем же
known-secrets контекстом: проверка отдельных chunks может пропустить шаблон
на их границе. Если redactor изменяет исходник, сообщить отказ точного чтения;
очищенный текст не выдавать за полный оригинал и не использовать как основу
автоматической замены. Общие схемы/bridge/user-v1 обновить согласованно.

Проверять фактический путь структурированной очистки ответа, а не только
`redactor.text`: текущий `redactor.redact({source_text:"[ 1, 2 ]"})` меняет
строку на `[1,2]`, хотя `text` сохраняет пробелы. Даже допустимое JS-выражение
или отдельный chunk может выглядеть как JSON. До выдачи первого chunk проверить
полный исходник; дополнительно удостовериться, что очистка доставляемого ответа
не меняет каждый chunk. При изменении — явный отказ точного чтения, без выдачи
изменённого текста под исходным digest и без ослабления общего redactor.

Поддержанный module policy v1: статический импорт `builtIn/Data`.
Явные static imports/re-exports других модулей, direct `require(...)` и
`import(...)` отклонять до мутации. В фазе 1A подключить уже реализованный
и локально проверенный синтаксический preflight, различающий комментарии,
литералы, templates и декодированные module specifiers; regex-поиск слов
не является реализацией.
Если анализ не может классифицировать исходник, вернуть отдельный preflight
refusal, не угадывать разрешённость. Это ограничение preflight, а не
доказательство отсутствия косвенных побочных эффектов JS.
Нативные parse/runtime diagnostics проверить отдельно
операторскими probes, включая исходник, проходящий preflight, но не ChakraCore.
Preflight относится к effective source: переданному новому тексту либо полному
наблюдённому тексту existing-узла, включая `{}`/omitted source. Для existing
выполнить доказанное безопасное open/read/discard до изменений graph, mappings
и конфигурации; общий shell с input_mapping до configure этого ещё не обеспечивает.
Перед materialization/Execute сверить тот же source digest и policy, в том числе
на output-ветке `dock_node_read`, которая сама запускает код. Synthetic read request
не освобождается от проверки preserved source. При расхождении — отказ/явное
состояние уже выполненных эффектов, а не исполнение неизвестной новой редакции.

Оболочка и source-read существуют; весь apply lifecycle ещё не callable. Если discovery
покажет несовместимость, исправить спецификацию до объявления ready; не оставлять
исполнителю выбор двух несовместимых контрактов. Общие файлы закрепить за одним
owner этой single-задачи; согласовать перенос при наличии другой кампании.

### 1B. Knowledge

Подготовить одну версионированную редакцию справки для Loginom 7.4.2 с
provenance исходного пользовательского файла и официальных страниц. Исходный
файл относится к 7.4.2; онлайн-справка не закреплена за build и применяется
только после сверки с ним. Исправления перечислены в
[аудите](research.md#5-официальная-документация-и-особенности-chakracore).
Сам [исходный файл](references/js_node_loginom_system_prompt.md) сохраняется
неизменным; его перенос в документацию не подключает знания к runtime.
Knowledge manifest и ответ describe указывают `validated_for`: build 7.4.2,
SHA исходного файла и ОС сервера, на которой выполнены probes. При ином
наблюдённом build — отказ до мутации, согласованный с graph adapter; знания
7.4.2 не выдавать за проверенные для другой версии.

Доработать существующий `client/lib/javascript-knowledge.mjs`: версия,
`validated_for`, короткие правила и примеры. Asset и source-only describe уже
проверены (`1d2c0590ba`, `168d4f88d0`); выдача JS knowledge сейчас требует
установленного handler, поэтому delivery целого candidate остаётся открытой.
`.mjs` входит в вычисление clientRevision;
проверить также staged bundle/resource manifest и мутационный тест pin.
5–7 критичных правил поместить в `limitations` JS-карточки, доступные уже
через `dock_prepare`/compactKnowledgeBundle: область 7.4.2/v1, static Data,
проверенный синтаксис, Number precision, schema-before-Append, независимость
от globals и чтение фактического состояния. Подробный scalar Data API —
on-demand через `dock_action_describe`; полные материалы/будущие расширения
разделить по версиям и feature scope. Не вставлять весь 51-KiB документ во все
разговоры. Не считать remote SKILL или root Markdown автоматически прочитанным.
Новый knowledge asset должен входить в resource manifest и runtime pin;
отдельно фиксировать knowledge SHA, clientRevision и skillRevision.

Правила прежнего советника адаптировать к handler: состояние/код наблюдаются
инструментом; autosync только по фазе 3 с сохранением existing mappings.
Сохранение пакета остаётся обязательным v1; внешние модули/FS/Fetch/Calc и
настольные пути не включаются в v1-примеры. Все исполняемые примеры новой
редакции проверить на назначенном 7.4.2 и связать с профилем в `discovery.md`.

Бюджеты: `previewWireSize` считает двойное JSON-экранирование, 46 000 bytes —
цель сокращения preview, не универсальный hard cap. Exact-table признаки
обходят это сокращение, но не лимит Agent. Его defaults — 50 KiB/2000 строк,
возможен override конфигурацией; зафиксировать эффективные значения candidate.
Для JS describe принять внутренний бюджет 20 000 wire bytes, для всего ответа
(включая multi-type describe, envelope, diagnostics и rows) — одновременно
46 000 wire bytes и эффективные Agent bytes/lines. Это проектные пределы,
не измеренная гарантия для будущего handler. Проверять худшие допустимые
quotes/backslashes/control characters/Unicode и максимальное число строк.
Входной source cap, размер каждого source chunk и describe budgets независимы.
Сокращение карточки/ответа не теряет обязательную схему и правила; если набор
describe не помещается, вернуть явную bounded ошибку с предложением меньшего
набора типов. Нельзя полагаться на сохранённый backend dump как доставку модели.
В actual CLI J01/J18/J21 требуют `metadata.truncated=false`, отсутствие
`readback_summary` и полный заявленный маленький результат.

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

В v1 нет автоматического cross-process resume. Новый process не восстанавливает
operation ID только из digest или snapshot: текущие owners/jobs живут в памяти.
После рестарта — явный отказ старого resume, проверка сохранённых evidence/
состояния и новое назначение после разрешения неизвестного эффекта. Snapshot
0600 сам по себе не восстанавливает owner, checkpoints и исходный deadline.
Redactor cases: URL, `Basic <слово>`, `токен: …`, `PRIMARY_KEY = …` и password-like
строки. Имя `source_text` предотвращает конфликт с import-параметром `source`;
его нельзя обосновывать общим запретом ключа `code`: remote action-definition
scanner не проверяет локальную node parameter schema.

**Проверка фазы:** новые pure parameter tests, согласованность compact/full
schemas/handler, factual model-visible describe, digest/pin mutation test,
redactor regression на несекретных литералах. Отрицательные inputs не вызывают
graph/editor. Запрет generic browser JS остаётся действующим.

## Фаза 2. Узкий редактор и конфигурация

Пример чтения CodeMirror и keyboard-only записи:
`workspace-ui.mjs:2536–2597,3482–3501`; pure readback:
`calculator-readback.mjs`; компактный handler: `reform-node.mjs:25–46`.
Копировать принципы ownership/полного чтения, не selectors калькулятора.

Исходная проба G4 сравнивала `keyboard.type`, `insertText` и, если нужен, native paste
под host clipboard lease на фактическом редакторе. CodeMirror 5 stand-in
показал изменения autoindent/electric chars даже у части insertText-вводов;
это не доказательство настроек Loginom. Не выбирать способ только по названию API
и не отключать editor options вслепую. Проверочный source содержит вложенные
блоки, tabs, начальные/конечные пробелы, длинные строки, кавычки/backslashes,
кириллицу, пустые строки и завершающую `}`. Замерить максимум 32 KiB/1024 строки
относительно configure budget. Если точного ввода нет, G4 не закрыт.

Наблюдение operator16 на 7.4.2/CodeMirror4.11.1: для реализации выбран
`keyboard.insertText` с обязательным полным readback. `keyboard.type` изменил
проверочный sample; insertText сохранил sample и документ ровно 32768 байт/
1024 строки, затем точно восстановил baseline. Clipboard не понадобился,
editor options не менялись. Это частичное доказательство G4; cold persistence,
execution и остальные сценарии остаются обязательными. Подробности и hashes —
[checkpoint](checkpoint.md), private evidence `g1-operator-16/report.json`.

Переиспользовать `javascript-parameters.mjs`, managed source adapter/write,
Code Next/Done; добавить недостающую композицию handler/context/readback
по результату B. Имена `javascript-context.mjs`, `javascript-node.mjs`,
`javascript-readback.mjs` остаются предложением, не требованием создать дубли.
Узкий managed writer уже реализован (`66027dc9c3`) и проверен headed вместе с
discard (`1e0da9265a`); повторить только затронутые и непроверенные границы.
До/после жеста проверить тот же
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
| Отказ мастера (кнопка ошибки) | После одного жеста прочитать подсказку и принадлежащий ему диалог по [lifecycle](../../workflow/lifecycle.md#отказ-мастера-и-кнопка-ошибки), закрыть OK до cleanup; старую кнопку и неизвестный исход не считать новым отказом |
| Sync runtime throw | Свежий native failed execution, bounded diagnostic, результат не refreshed; можно исправить тот же узел |
| Lost reply после ввода/Done/Execute | Сначала inspect того же owner/operation; неизвестный эффект не повторять |
| Same operation ID, другой source/settings | Конфликт; не новый запуск |
| Local cancel / server stop | Разные операции; Stop только identified execution, дождаться фактического terminal/cleanup |
| Timeout | Оригинальный deadline не продлевать; wait timeout не доказывает завершения |
| Async rejection / console.error | Не объявлять корректность по статусу; вне accepted v1, результаты probes сохранить отдельно |

Автоматическое «исправление» пользовательского алгоритма или бизнес-формулы
не является техническим recovery. После ошибки исправляется только установленная
причина при сохранении согласованного намерения. Чужие пакеты/связи не меняются.

Диагностика модели: наблюдённые класс и текст ошибки, позиция только если дана
Loginom, source digest и owner/execution. Применять redactor и явный признак
усечения/очистки; не выдумывать позицию или переводить текст под шаблоны V8.
Краткие примеры ChakraCore-сообщений в знаниях подтверждать своим 7.4.2,
исторические английские строки e2e не делать обязательным exact matcher.

**Проверка фазы:** fixed/code schema, 0/1/N rows, both Close/Done/Execute,
изменённый upstream, разрешённая смена схемы, known failure, lost reply,
ограниченный long-running stop и успешный последующий rerun. Настройка и эффект
исполнения отражены отдельно, нет второго Execute при неизвестном исходе.

## Фаза 4. Независимый oracle и сохранение

Наблюдённое source105 состояние после Done уточняет порядок G7:
[настроенные выходные поля до materialization](pending-output-mapping-design.md)
проверяются отдельно от полного source mapping. Полная проверка связей обязательна
после нового Execute до save2 и после cold Execute; отсутствие source cache не
выдаётся за проверенное сопоставление. Private writer/cold пары обоих режимов и
отдельное чтение точных байтов `.lgp` подтверждены; их пределы приведены в
[checkpoint](checkpoint.md). Private dirty-state обоих режимов теперь подтверждён
отдельными post-save native ответами для этих же сохранённых пакетов; публичный
handler и автономная CLI-приёмка остаются открытыми.

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

Digest source считать по UTF-8 декодированного текста в принятой LF-форме;
hash всего `.lgp` хранить отдельно. ZIP/XML escaping не является изменением
программы. На стенде проверить roundtrip перевода строк и XML entities;
не применять trim, форматирование, схлопывание пробелов или произвольную
CRLF-нормализацию ради совпадения. Если UI сохраняет другую форму, до реализации
явно пересмотреть контракт канонизации и его отрицательные тесты, а не oracle
после неуспешной приёмки.

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

Внешний e2e/TestCafe suite из [каталога](e2e-coverage.md) **не запускать как
обязательный этап обучения**. По [регламенту](../../workflow/new-node-plan.md#2-исследовать-до-проектирования)
Help/E2E служат источниками для сопоставления с UI и кодом. Нужные сценарии,
включая skipped в историческом suite, покрыть адресной матрицей нового handler
и live-проверками фаз 2–4. Устанавливать или чинить внешний TestCafe для
готовности JS handler не требуется; отсутствие его запуска фиксировать как
`not_run`, не PASS и не блокер разработки или CLI-приёмки. Отдельный запуск
возможен только как обоснованная дополнительная диагностика с подготовкой
среды по каталогу; он не заменяет обязательные проверки этого подплана.

После завершения разработки — один отдельный проход ревью на Astra/medium
в той же задаче, затем один раунд исправлений подтверждённых live-дефектов
и адресная перепроверка. Это не независимое контекстное ревью.

**ready_for_first_review / завершение development Goal:** 0B и фазы 1–4
выполнены, G1–G7 подтверждены реализацией, source/direct-runtime часть J01/J21,
J02–J17/J19/J20/J23–J26 проходят, J22 проверен или доказанно неприменим.
Адресные тесты зелёные; `discovery.md`, fixtures, evidence и commit SHA сохранены.
`not_checked` не закрывает обязательную проверку. J01/J21 на immutable candidate
выполняются после ревью/сборки, J18 — в фазе 6: не создавать циклический gate.

Из зафиксированного source собрать отдельный immutable standalone candidate
по [runbook](../../../testing/loginom-ai-agent/standalone-cli.md) и
`packages/loginom-host/script/build-cli.ts` из owning package. Нужны новые
absolute output directory, `LOGINOM_AI_AGENT_NODE_SOURCE`,
`LOGINOM_AI_AGENT_BROWSER_SOURCE`, exact Bun revision, manifest и hashes.
Не смешивать source handler со старым installed bundle; не заменять рабочую
пользовательскую установку. Candidate включает knowledge asset и его pin.

**ready_for_acceptance:** G1–G7 закрыты; code/source tests и live matrix имеют
успешные результаты; candidate-часть J01/J21 и target persistence J27 пройдены;
ревью/исправления завершены;
exact auditor invocation, fixtures (включая отдельное declared-задание),
oracle и candidate зафиксированы; собственный OAuth/profile готов; есть слот.

## Фаза 6. Автономный CLI и критерий завершения

Выполнять по [CLI-регламенту](../../workflow/acceptance-cli.md), не копировать
старые Hermes launchers из исторических аудиторов. Модель:
**`openai/gpt-6-sol`, `low`**, существующая ChatGPT OAuth-подписка.
Использовать один общий host acceptance slot и атомарный `acceptance.lock`;
локальная single campaign не создаёт второй слот.

Две независимые последовательные попытки — code и declared schema — получают
назначенный `http://logi-test-plan.bg.local/app/` как единственную цель и
только бизнес-задачу/входы/уникальный save path. Условия model workspace и
вариант задания описаны в [fixtures README](fixtures/README.md).
Модель сама генерирует код и собирает сценарий; подача готового JS/графа/
ожидаемых чисел превращает прогон в DEBUG_ONLY. Если задача решена другими
узлами без проверяемого JS handler, это не его приёмка.

На каждую попытку отводится **30 минут** от отправки задания; контроллер
предела, остановка, очистка evidence и cleanup — по CLI-регламенту.
Длительности прямых probes записываются для планирования; они не доказывают,
что модель уложится в тот же срок. Отдельный прямой полный прогон исключительно
ради подтверждения стандартных 30 минут не требуется. Изменение лимита
обосновать до попытки по регламенту.

После каждого прогона независимый аудитор проверяет:

1. Input hashes, фактические model/variant/source/candidate/knowledge SHA и build стенда 7.4.2.
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

Срез 2026-09-29 по code `7b8e19bee0` и каноническому checkpoint. Уровни:
**не проверено**, **приватная проба**, **runtime** (source/unit либо live —
уточнено в строке), **публичный handler**, **candidate**, **CLI**. Уровень
показывает путь доказательства, а не процент или принятие всей строки.
Публичный source-read отмечен отдельно: он не доказывает apply handler.
Частичные proofs сохраняются; обязательные непроверенные части остаются открытыми.
SHA/отчёты и пределы — в [текущей сводке checkpoint](checkpoint.md#текущее-состояние)
и связанных с ней исторических записях. В этой правке tests/live не повторялись.

| ID / требование | Проверка | Ожидаемый результат | Evidence | Уровень и остаток |
| --- | --- | --- | --- | --- |
| J01 knowledge | Actual describe/prepare в candidate | Версия/hash, validated_for=7.4.2 и Data API доступны модели; нет ложного editor context; при ином build — отказ | Очищённый tool response + knowledge manifest | runtime/source: `168d4f88d0`, `1d2c0590ba`; test handler + staged asset. Actual candidate/CLI delivery открыта |
| J02 input/schema | Imported sales, technical names/types | 6×5, пробелы и порядок сохранены до JS | Input receipt + hash | приватная проба: operator17, полный typed input 6×5; новый business/public input ещё проверить |
| J03 code output | Sales task, code mode | expected.json 6×4 exact | Native execution + полный typed output | private code/base и isolated public C full6×4/Save/independent cold приняты; product candidate/CLI открыты |
| J04 declared output | Те же данные, declared mode | Тот же бизнес-результат, другое проверенное setting | Configuration + typed output | private declared/base6×4 и isolated public D writer/Save/independent private cold6×4 приняты; product candidate/CLI открыты |
| J05 source | Empty/Unicode/LF/URL/long/cap+1 | Полное равенство в bound, сверх bound отказ до записи | Source digests + editor receipt | private operator16; public existing `88ddfc958e`: Code32768bytes/1024lines/8chunks и declared-empty0bytes приняты; local cap+1/line+1/redaction/import preflight; candidate/CLI и остальные limits открыты |
| J06 null/types | Нативные typed-cases | null/empty/0/false различимы; Date/real по заданному правилу | Typed values/native bytes | приватные native scalar/Date probes и fixed isolated public Code output5/5 на `bccc8a0a08` приняты; fixed public declared output5/5 на `d4898cac03` также принят; public native real2/2 на `a679a63595`, Boolean2/2 на `14965ef148` и String2/2 на `800381592a` input bytes/identity-copy Code/declared приняты; public native civil Date2/2 на `7d43cea036` input bytes/civil attestation/identity-copy Code/declared принят без UTC/epoch claims; полная матрица/candidate/CLI открыты |
| J07 safe integer | Decimal-string/native inputs | Exact safe-range; вне него нет ложной гарантии | Input/output precision evidence | приватные safe/unsafe int64 identity/coercion и fixed public Code safe-range exact output на `bccc8a0a08` приняты; fixed public declared safe-range exact output на `d4898cac03` также принят; public native safe-int64 input bytes/identity-copy2/2 Code/declared на `0be6a698c1` принят; public native outside-safe Code/declared2/2 на `81b4bfef74` characterized: 9007199254740993→9007199254740992, exact_pass/общая гарантия false; candidate/CLI delivery открыты |
| J08 empty/cardinality | Empty и 0/1/N rows | Полная схема и верное число/порядок | row_count + complete read | приватные keep2/odd/duplicate/declared-empty; fixed public Code output0/1/N и empty input приняты на `bccc8a0a08`/`2eef052e7a`/`64221b01c8` с full schema/read и cleanup; fixed declared counterparts9/9 на `d4898cac03` также приняты; public native input/full typed cardinality keep2/odd/duplicate Code + canonical declared-empty4/4 на `3bfbd9968b` приняты с whole baseline/ordered output/cleanup; candidate/CLI открыты |
| J09 schema edits | declared↔code, manual required fields | Нет silent reset; допустимое изменение или явный отказ | Before/after mapping | private manual mapping/mismatch; public existing `b17c5b7719` code↔declared explicitly refused2/2 с retained source/native settings/graph и no editor/Execute; Required=true/edit и candidate/CLI открыты |
| J10 same node | Изменить исходник, сохранить другие свойства | Один узел, точный новый код, нет дублей | Node identity + configuration | fixed isolated public existing comment edit/Execute/read code и declared на `467da5ab9a` приняты с full settings/mappings/graph и cleanup; остальные edits/product candidate/CLI открыты |
| J11 freshness | Changed/reordered source | 2700/2850 в changed; reordered равен baseline | Новый execution + all-cell oracle | private code changed/reordered6×4 и fixed isolated public existing freshness4/4 Code/declared × changed/reordered на `e1fd122320` приняты с full6×5/6×4 и cleanup; product candidate/CLI открыты |
| J12 validation | Invalid code/parameter/unknown field | Раздельные ошибки, нет false success | Owned diagnostic + cleanup | private parse/throw и runtime preflight; fixed public Code Next SyntaxError/NEW same-node repair для code/declared приняты на cf78f5b61a; fixed public sync throw/NEW same-node repair code/declared приняты на 5e55e53f8a: actual explicit materialization Execute, source applied, native child message, 2 fresh repair executions; live Done refusal и прочие invalid paths открыты |
| J13 recovery | Lost reply/same-ID/cancel/stop | Нет повторного неизвестного эффекта | Журнал фаз/operation/native execution | runtime/unit lost reply/ACK и private finite Stop/local cancel/rerun приняты; public finite Stop/repair на 69c1f3d60c, audit/negative62/62; public local cancel/SAME-ID read continuation того же native execution на 56f8df0250, один Raw Execute, cancelled13,976s/NEW repair6×4 и audit/negative87/87/cleanup/process absence; public lost reply и CLI открыты |
| J14 Done/Close | Configure и discard | Нет ложного fresh output; предыдущие настройки сохранены | Config/dirty-state receipts | private configure/discard, B public configure и C public Done/source-read приняты; оставшиеся edit/discard/error cases и CLI открыты |
| J15 persistence | Save/new open/execute | Последний source/options/schema и те же результаты | Saved artifact + cold audit | private code/declared/usage writer–cold–bytes6×2; isolated public C/D writer+Save/independent private cold6×4 приняты; candidate/CLI открыты |
| J16 oracle integrity | Преднамеренные подмены | Каждая подмена отклоняется | Oracle negative report | runtime/source: частные persistence oracle negatives и actual independent public Code scalar auditor12/12 и declared scalar auditor18/18 mutation refusals; полный business/candidate/CLI auditor открыт |
| J17 UI regression | Общий deny и соседний calculator | Generic code запрещён, прежние узлы работают | Адресные source tests | runtime/source: guards и смежные regression tests; итоговая проверка с JS handler открыта |
| J18 autonomy | Две Sol low попытки | Без технических подсказок, полный заявленный scope | Sessions/events/completion | не проверено: две независимые CLI-попытки только в фазе 6 |
| J19 context | Изменённые поля/старый код, label/comment с текстом инструкции | Используется текущее наблюдение; содержимое данных не меняет задачу | Context/source identities + tool evidence | не проверено: фактический public context/instruction-in-data сценарий |
| J20 engine profile | Business/API primitives и все v1 knowledge examples на 7.4.2 | Нужные возможности подтверждены; дополнительные features явно not_checked | Build/ОС, snippet hashes, профиль | приватные 30/30 observations и отдельные knowledge examples; required subset/полная редакция ещё не закрыты |
| J21 response budgets | Prepare/describe (включая multi-type), apply/output/source chunks с worst-case source | Соблюдены оба бюджета; нет backend truncation, readback summary или потери полного результата | Source/direct проверка до ревью, candidate/CLI delivery после сборки | runtime/source budget + MCP test с подставленным browser adapter; worst-case/full batch/candidate/CLI открыты |
| J22 assistant isolation | Наблюдение мастера и действия своего handler | Встроенный помощник не вызывается; отсутствие отмечено наблюдением | UI profile + журнал действий | не проверено: наличие assistant/engine selector не установлено; нельзя объявить неприменимым |
| J23 editor fidelity | Вложенные блоки/tabs/пробелы/Unicode, saved Code | Совпадает декодированный canonical source и cold readback | Source/artifact hashes + live receipts | private editor/cold + public writer; public existing `88ddfc958e` Unicode/LF/URL/tabs/trailing spaces/32KiB whole digest/chunks принят; candidate/CLI и cold именно long source открыты |
| J24 column names | Кириллица/недопустимые Name в code mode | Фактические имена/ошибки установлены без догадок | Native schema + knowledge rule | приватные двухколоночные T-пробы source96; D cases/source→physical и knowledge delivery открыты |
| J25 diagnostics | Preflight refusal, native parse error и sync throw | Доставлены наблюдённые класс/текст/позиция либо явное отсутствие, digest и owner | Очищённые diagnostics + delivery | private parse/throw/calibration и runtime/source knowledge; fixed public Code Next native SyntaxError для обоих modes, bounded user-v1 и baseline-preserving recovery подтверждены на cf78f5b61a; fixed public sync throw/repair обоих modes на 5e55e53f8a передаёт native failed JS child text при explicit Execute, stack position не атрибутирована; live Done refusal/technical details при недостаточном тексте открыты |
| J26 import policy | Data import, явные unsupported declarations/calls и похожий текст в comments/strings/templates | Preflight различает синтаксис, неподдержанное отклонено до мутации; не заявлена sandbox-гарантия | Pure parser tests + журнал без editor effects | runtime/source parser/preflight/admission; интеграция effective source на всех apply/Execute/read путях открыта |
| J27 target persistence | Exact назначенный URL в новом CLI profile и после restart | Origin/path остаются назначенными; legacy migration не уводит приёмку на другой сервер | Host regression + actual CLI status; gate перед приёмкой | runtime/source Host `9d75933fac`; сверка альтернативы `1b8d100392` и actual candidate restart открыты |

Для J24 внешние `js_data_output.ts:307–400` на E2E SHA
`7a41b5adbb9c45dca8d756a8220615554301c2e0` содержат гипотезы
`РусскиеБуквы`→`RusskieBukvy`, `124`→`_124` и генерации имени для пустого
аргумента. Оба теста помечены `test.skip` (TODO2332), не запускались;
это не подтверждение поведения текущего стенда. Проверять фактическую native
schema и различать `Name`/`DisplayName`; результат `AddColumn` не переносить
на `AssignColumns` без отдельного доказательства. SHA256 прочитанного файла:
`f1bd7c9c72e4621b756020b3b794cdca9de1b7259bb08039dbf7e0e25645fde0`.

На текущем стенде source96 отдельно выполнил пять двухколоночных T-проб
`AssignColumns`; [наблюдения и hashes](schema-telemetry-observations.md)
подтверждают конкретные преобразования `Сумма → Summa`, `Value Total → Value_Total`,
`1Value → _1Value` и сохранение Unicode DisplayName `Сумма ё`. API before/after
и физическая Preview-схема совпали. Для handler требуется фактический readback
имён; общий алгоритм нормализации не выводится. Старые одноколоночные D cases,
knowledge delivery и весь G5 не объявляются закрытыми этими пробами.


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

Начать с [текущей сводки и указаний](checkpoint.md), сверить docs/code HEAD,
затем выполнить **B — публичный configure existing code-table** по разделу
порядка продолжения. Последнее подтверждение — managed write → Code Next →
Done → новый публичный source-read (`managed-code-next-01`); оно не является
текущим FAIL и не требует ещё одного повторного source-read ради прогресса.
Нужны продуктовые settlement после Next/Done и композиция apply lifecycle.

До фиксации Execute/read провести ранние private 6×4 и bounded Stop/cancel
пробы. G1/G3/G5/G6 имеют конкретный остаток в discovery; G4/G7 feasibility
переиспользуется. `ready_for_development` выставляется по решениям 0B,
`ready_for_first_review` — по реализации фаз 1–4, G1–G7 и source/direct J,
`ready_for_acceptance` — после ревью/сборки и candidate gates. Непроверенные
обязательные требования не закрываются документальной правкой.

Канонический checkpoint — ветка `javascript`, продуктовый worktree —
`node-javascript`; fixtures/oracle, продуктовая база, стенд, Linux x64,
headed и правила памяти/изоляции сохранены. Внешний TestCafe остаётся `not_run`
и не блокирует обучение. Модели, бюджеты и scope менять не требуется.

В основной задаче исполнение уже назначено. Эта доработка плана не создаёт
новую Goal и не возобновляет/не меняет состояние другой задачи. При продолжении
владелец существующей Goal использует обновлённый план до первого ревью, без
самоназначенного token_budget. Обычные правки и проверки в согласованном scope
не требуют повторного разрешения. На границе результата/фазы, при блокере,
неизвестном эффекте и остановке обновить краткую сводку; при реальном блокере
указать недостающее условие, owner и безопасный следующий шаг.
