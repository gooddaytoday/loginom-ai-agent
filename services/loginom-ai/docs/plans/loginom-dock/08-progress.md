> Текущее состояние: подплан08 принят, [аудит56/56](08-completion-audit.md).
> Последующий естественный пользовательский опыт и закрытие замечаний —
> [48/48 и локальная поставка для Mac](../../loginom-dock/sales-followups-2026-09-10.md).
> Ниже сохранён хронологический журнал, включая первоначальный in_progress.

> Дополнение после исходной приёмки 10 сентября 2026: короткий пользовательский
> промпт с другим sales.csv выявил ошибку чтения перенесённой подписи графа.
> Исправление принято отдельным run `20260910-125653` на runtime `d023c3ab…`;
> вычисления и сохранённый сценарий — 44/44 PASS исправленного аудитора.
> Это отдельные данные и границы проверки; исторические результаты этого
> подплана ниже относятся к своим исходным pins.
> [Полный разбор](../../loginom-dock/rename-recovery-fix-2026-09-10.md).

# Подплан 08: ход реализации

10 сентября 2026. Статус: **in_progress**, не live_verified и не released.

Личный OpenViking healthy, рабочее дерево перед началом чистое. Прочитаны
подплан08, README, действующий цикл node.apply, архитектура и итог07.

Живая диагностика: отдельная копия
`/user/dock-p3/packages/Dock-sorting-diagnostic-20260910.lgp` на Loginom7.4.2,
`logi-test-plan.bg.local`, выбранный ранее оператором account `user`.
Сессия `.dock/calculator-v3/live-1789021537858`, Node24.19.0,
viewport null, развёрнутое окно2044×1035; исходный runtime102 закреплён как
`5641f29244f3c3b77bbddc947b09539f7cfc2c544ca9c49b121f48dba7915c01`.
После исходного запуска код менялся; этот pin не является pin новой приёмки.

Проверенные наблюдения:

- `transform.sorting / keys`; мастер SortingWizard/SortingColumnCollection.
- Доступные поля — ChainedStore, его source содержит полную схему. Ключи —
  отдельный локальный Store. Их приоритет задаётся порядком items; Index=0 у всех,
  getTotalCount остаётся0 после добавления трёх записей.
- После переноса поле остаётся в selection исходного списка, хотя скрыто фильтром.
  Такая ссылка допустима только на запись полного source; это не доступная строка.
- data-tid содержит имя поля, а не метку. Два поля с меткой «Сумма» различены.
- SortDirection0/1 соответствует ASC/DESC. CaseSensitive отображён для string;
  для чисел флаг в записи есть, но UI-действие недоступно.
- LocaleAware=true, BufferWhole=false, MaxThreadCount=0 (Автоопределение),
  переменные переключатели выключены. Next ведёт на Done; порт настраивается отдельно.
- Браузер ru-RU не доказывает локаль серверного пользователя. В readback остаётся
  `locale=null, locale_verified=false`; проверка реальной локали ещё требуется.
- Двойной клик по выбранному SVG-body перехватывается NodesControls. Точная кнопка
  Setting открывает мастер; общий product opener уже использует этот путь.

Добавлен первый source-кандидат: полное чтение конфигурации, валидация keys,
ранняя проверка схемы, локальные действия, общий lifecycle, input/output mappings
и readback. `procedure3.json` подтвердил замену ключей Revenue/Id/Note на
Note DESC(case=true)/Adjusted ASC/Id DESC и locale=true, сохранение входной схемы,
кэша и потоков. Это внутренняя Codex-проверка, не полный node.apply и не Hermes.

Проверено:30 адресных тестов sorting/grouping и305 тестов общего UI/процедуры/API.
Остались полный node.apply, независимые проверки данных/порядка/мультимножества,
QA-матрица, locale/variant/Null, новая sales fixture и две ветви, save/reopen,
восстановление, замороженная автономная Sol/low приёмка и аудит всей цели08.
Production, установленный клиент и модели не обновлялись.

## Полный цикл и независимый аудит

- `sort-full-1789022525244`: existing node.apply SUCCEEDED, выход6×8,
  execution`1789021540838-cyekczobkk9:573:2`.
- `sort-full-1789022689056`: new node.apply SUCCEEDED, выход6×8,
  execution`1789021540838-cyekczobkk9:573:4`. Аудит raw configuration и полного
  порядка/мультимножества — PASS (`sort-full-1789022689056-audit.json`).
  Источник ожиданий — прежняя закреплённая calculator fixture и её независимые
  формулы; проверка не доказывает новую доставку исходного файла или persistence.
- Первоначальный full остановился на пустой native source schema выходного порта.
  Подключён существующий механизм Get source columns/возврата к Table,
  с проверкой сохранности полного output definition.
- Диагностический повтор с теми же меткой и позицией создал второй узел с native
  suffix`@0-0`; открытие осталось AMBIGUOUS. Сохранены исходные failure receipts,
  мастер отменён явно. Повтор с уникальной меткой прошёл. Это не доказательство
  исправления общего случая одинаковых меток.
- `sorting-save-1789022803781`: штатный save_checkpoint в точный диагностический
  пакет, save_completed=true. Reopen/persisted content ещё не проверены.
- `sorting-close-1789022851228`: Close отменил новые ключи/локаль, output
  not_refreshed, execution not_requested. Последующий
  `sorting-done-1789022858591` прочитал прежние Revenue DESC/Id ASC, locale=false,
  сохранил без запуска; оба результата SUCCEEDED.
- Client1124 PASS/1 SKIP; Python414 PASS. Отдельный preflight output внутри
  Python-тестов относится к мокам, не к реальному Hermes preflight.

Подготовлена новая sales-sorting-v1 fixture10 строк и Decimal oracle:
SHA`44880a6c4a442226889c06d9703f8ba77316b42b35bd82da14a43dc25c039a6b`.
Товарные лидеры Alpha/Beta по50.00, регион East68.000, общий итог182.75.
Сквозной Codex проход начат в отдельном new_draft `MF;TF-4`; при первой доставке
Files control не был найден до загрузки (NOT_APPLIED, upload не начался).
Codex открыл Files и начал отдельную доставку того же admitted artifact.

### Продолжение: импорт продаж и восстановление

- Импорт `sales-import-1789023025045` SUCCEEDED: 10 строк × 5 полей,
  свежий execution `1789021540838-cyekczobkk9:573:6`.
- Пакет `/user/dock-p3/packages/Dock-sales08-diagnostic-20260910.lgp`
  сохранён после импорта и перед восстановлением частичной операции.
- Калькулятор `sales-node-1789023349125` остановился AMBIGUOUS на открытии
  input mapping: два DOM пункта `mn;mniConfigurePort`, один скрытый.
  Узел `4bd6bd54-c0a1-45e9-bd99-202bef338352` уже создан, повторное создание
  запрещено; продолжение — по его точной ссылке после наблюдения состояния.
- Исправлен общий `node-port-open.mjs`: выбирается единственное видимое меню,
  сохраняется проверка native owner/порта. 14 тестов PASS, включая hidden-menu
  regression для input/output и отказ двум видимым меню. Live повтор ещё впереди.
- После закрытия пакета осталась активна вкладка файлов; два read-only prepare
  завершились NOT_READY/workspace_entry_ready. Диагностика перевела UI на прежнюю
  вкладку сценария, третье открытие находится в работе. Это не PASS восстановления.

### Продолжение: две ветви и общие UI-переходы

- Обе ветви созданы и исполнены. Независимый конфигурационный и полный выходной
  аудит сортировок `sales-node-1789023675965` (Product) и
  `sales-node-1789023746422` (Region) — PASS. Проверены все четыре строки каждой
  ветви и полное мультимножество. Ожидания: Alpha/Beta 50, Gamma 42.75, Delta40;
  East68, North51.75, West35, South28.
- У восстановленного Калькулятора операторский запрос добавил Revenue к старому
  пустому Expr1. Первичный независимый аудит отклонил лишнее поле. Через живой UI
  Expr1 удалён в диагностическом пакете; попытка исключения output port была
  корректно отклонена (computed field required). Никакие failed receipts не
  объявлены успешными. Source runtime в операторском процессе обновлялся после
  наблюдения графа; это не автоматическое восстановление pending operation.
- `sales-calc-output-1789024263447` SUCCEEDED и независимый полный аудит PASS:
  десять строк, ровно Id/Product/Region/Quantity/UnitPrice/Revenue, корректная
  точная числовая выборка. Execution `1789021540838-cyekczobkk9:573:18`.
- При завершении input wizard всплывающее `toast` первоначально вызвало
  WIZARD_CONTEXT_CHANGED. Добавлено bounded ожидание его исчезновения только
  после finish/execute с сохранением всех остальных ownership checks. Тесты
  подтверждают один жест, отказ чужому диалогу и постоянному toast.
- Обнаружена гонка package.save_as при наличии другого открытого пакета:
  старый граф проверялся до загрузки целевого. Сохранение не было ложно принято.
  Ожидание теперь исключает прежнюю активную вкладку после close, затем прежний
  verifier проверяет точный путь и граф. Regression test воспроизводит задержку;
  тесты save success / wrong path / old tab PASS. Live повтор находится в работе.
- Готовятся `sales-sorting-complete` goal, immutable upload descriptor и независимый
  сценарный auditor. Их наличие не означает готовность или автономный PASS.

### Подтверждённый save/reopen и длительная история процессов

- `sales-final-save-1789024579615` SUCCEEDED: сохранён и переоткрыт
  `/user/dock-p3/packages/Dock-sales08-accepted-local-20260910.lgp`, exact path и
  graph PASS (6 узлов/5 связей). Новый workflow `...-7`, prefix MF;TF-9.
- После reopen запуск `...:573:20` выполнил импорт/Калькулятор/Группировку/Сортировку
  без ошибок; проверка остановилась на offscreen строке process console.
  Исправлен `revealExecutionControl`: отсутствующий `process_tid` не должен
  сопоставляться с безымянными UI-элементами. Regression test добавил два таких
  отвлекающих элемента, проверил единственную прокрутку и точный record.
- Следующий запуск `...:573:21` completed/error=false, node owner совпал,
  но verifier отклонил автоматическое удаление старейшей записи истории.
  Подтверждено наблюдениями: root573, до запуска1–20, после2–21, оставшиеся
  record IDs неизменны. Это не скрывает failed receipt и не означает replay PASS.
- Runtime и независимый Python auditor допускают только удаление завершённого
  старейшего префикса при последовательных новых ID и неизменных оставшихся
  записях/root, без повторного запуска. Исчезновение активной записи, смена ID,
  reset и неоднозначные новые группы по-прежнему отклоняются. Проверки добавлены.
- Последний полный прогон до изменения retention: client1134 PASS/1 SKIP,
  Python419 OK. После retention требуется обновлённый прогон и live readback.

### Повторные результаты продаж — независимый PASS

После исправления проверок истории обе операции существующих узлов без параметров,
связей и mappings (`parameters={}`, `inputs=[]`, `mappings=[]`) SUCCEEDED:

- Product: `sales-reexecute-Product-1789025032943`, execution `...:573:22`;
- Region: `sales-reexecute-Region-1789025059353`, execution `...:573:24`.

Конфигурационный и полный выходной аудит обоих — PASS в
`.../live-1789021537858/sales-diagnostic-audit.json`. Сохранение и граф проверены
отдельно выше. Это операторская проверка; Hermes ещё не запускался.

Дополнительные независимые audits NumericAsc08 (26), DateDesc08 (28),
StringCase08 (30) — PASS: смешанные направления, отрицательные/дробные числа,
даты, строки и сохранение Null в поле, не входящем в ключ. В текущем fixture
все даты одинаковы; разнообразие дат и Null именно в ключе ещё требуют проверки.
MapAlias08: configuration и полный output audit PASS (execution32), включая aliases, одинаковые метки, порядок и исключение поля.

Уточнение источников: актуальная Help `userguide/workflow/local-settings.html`
отличает локаль браузера от локали узла/пакета, предлагает смотреть локаль узла
в Инспекторе свойств. Фактическая локаль пока не подтверждена; `locale_verified`
остаётся false. Значение ru-RU браузера не подставляется в этот контракт.


### Эталон типов и дополнения 10 сентября, 07:52 UTC

- Последний полный прогон: client1135 PASS/1 SKIP, Python421 OK. После новых
  исправлений preflight/renumber нужны итоговые прогоны; targeted preflight36,
  process navigation/stop и sorting context — PASS.
- E2E Sorting.lgp/AllTypesSorting.lgd локально совпали с закреплёнными SHA.
  На стенде `/user/testdata/wizards/sorting/Sorting.lgp` отсутствует. Отдельная
  копия открыта в `/user/dock-p3/Sorting08-reference-1789025689231.lgp`,
  workflow `...-8`, MF;TF-11. Исходные пакеты сохранены.
- Автоматический delivery LGP отправил файл, но verification ограничен CSV/TSV:
  его receipt остался AMBIGUOUS. LGP подтверждён отдельным exact open, LGD
  загружен оператором через документированный MCP file-upload; повторная попытка
  вызвала conflict и была пропущена. Это не autonomous delivery PASS.
- Fresh-open выявил отсутствие native graph binding перед schema preflight.
  Executor теперь читает и проверяет полный граф перед beforeTarget; это не
  мутация Loginom. Тесты fresh reopen / foreign graph добавлены.
- `sort-fixture-date-1789026139469` (execution35) — configuration/output PASS:
  6 разных дат с точностью до миллисекунд. VAR исключён явным output mapping;
  доказательство относится к пяти оставшимся столбцам.
- `sort-fixture-string-1789026300428` (37) — настройки подтверждены. Начальная
  oracle ошибочно применяла Unicode lower в binary mode; её расхождение не
  скрывается. Help уточняет: case_sensitive=false без locale игнорирует регистр
  только латиницы. Корректировка oracle основана на Help, не подгонке обработчика.
  `comparison.case_insensitivity` и skill теперь явно сообщают это ограничение.
- Inspector нового Dates08 подтвердил Russian (Russia), binding по точной метке
  и graph image: `dates08-locale-inspector.json`. Это отдельная UI-проверка;
  runtime locale_verified остаётся false и не подменяется локалью браузера.
- Locale attempt `1789026385071` исчерпал ровно2 разрешённых UI_EPOCH_CHANGED
  refresh; runtime сохранил ambiguity. Следующий existing-node attempt
  `1789026510207` завершил execution40, но read потерял обновлённый DOM tid
  при сохранённом process_id/record_id: Root-20 переименован в Root-19 после
  вытеснения старой записи. Теперь reveal/act для child/expander повторно
  разрешают tid по native process identity. Повторная диагностика в работе.
- Автономный Hermes ещё не запущен. Готовность подплана не объявлена.

### Подтверждения locale/Null и дополнительная гонка каталога

- Locale existing-node `sort-fixture-locale-1789026688732`, execution41:
  configuration + полный независимый output PASS. Binary Cyrillic case=false
  также PASS после исправления oracle по явному примечанию Help.
- Полный client прогон после preflight/renumber/case semantics:1139 PASS/1 SKIP.
- Delivery навигация в каталог могла вернуть старый breadcrumb до завершения
  загрузки. Теперь ожидание проверяет ожидаемый путь после единственного жеста;
  delayed root/folder regression PASS. Live edge CSV ранее доставлен после
  операторской проверки завершившейся навигации; это отдельно от нового fix.
- `sorting-edges-import-...` создал Edges08:8 строк,3 поля. `sort-edges-null-
  1789026941899`, execution45:configuration/full output+multiset PASS. Две
  полностью одинаковые строки сохранены. На профиле7.4.2 наблюдено Null перед
  ненулевыми при ASC; SQL-параметр Null-политики не добавлялся.
- `sort-missing-field-1789027028275` отклонён NOT_APPLIED/effect_possible=false,
  cleanup_complete=true,node=null. Отдельная DOM-проверка `sorting-refused-node-
  count.json` подтвердила count0. В первоначальном операторском скрипте проверки
  count отсутствовал await; ошибочный boolean не используется как evidence.
- Текущий operator batch проверяет DESC Null и Latin case=false на том же узле.
  Затем остаются empty/upstream continuation, сохранение QA и финальный Hermes.

- Обратная сортировка Null `sort-edges-descending-1789027065422` (47) и Latin
  case=false `sort-edges-latin-1789027099592` (49): независимые configuration,
  полный порядок и мультимножество — PASS. Один existing-node ID, ключи заменены
  целиком, дубли не исчезли. Null при DESC оказался в конце на этом профиле.
- Preflight новой sales-sorting-complete цели PASS, модель не запускалась:
  Hermes0.21.0, openai-codex/gpt-5.6-sol/low. Это предварительная проверка,
  окончательные pins будут сняты после завершения диагностики.

- Итоговый source suite перед empty/variant live: client1141 PASS/1 SKIP,
  Python423 PASS. Лог test runner содержит synthetic preflight с `aaaa...`;
  это fixture теста, не реальный runtime pin.
- На длинной файловой сессии после directory wait fix остаётся безопасный
  navigation timeout при переходе к уже открытой файловой вкладке. Отправки не
  было (`upload_submitted_or_unknown=false`). Оператор проверил фактический
  путь, перешёл `/user/dock-p3` двумя UI double_click, затем отдельный delivery
  `sorting-empty-deliver-ready-1789027302900` подтвердил12 bytes/SHA и cleanup.
  Это ограничение диагностики multiple-files-tabs, не autonomous PASS fix.
- `sorting-empty-import-1789027350384` SUCCEEDED: тот же Edges08 GUID
  `258b30fd-4c87-491d-a582-b1e8fc7e2ac4` теперь получает пустой input. Старый
  CSV не менялся. Тот же sorting node проверяется через пустые parameters/inputs/
  mappings, без изменения конфигурации, с новым выполнением.

### Финальный автономный run

- Codex diagnosis завершена для declared sales goal; исходный browser harness
  закрыт перед Hermes. Самостоятельный `20260910-110705-9136285d` прошёл tool
  precheck и начал модель openai-codex/gpt-5.6-sol/low, без fallback.
- Runtime `1edc7ad9defe28975de1b0795e71436f4158a71a4405226a3a2cf75e2d0eaa1c`;
  native skill `317ea2027516b73a132cdbb61ba4446b14b0bfa6ab248c79808681b765297826`;
  goal `517fca059e4f65fddae3199c9cacd9edd80fb025aaf3b23ec64d1063eb7f8d12`.
- Run-dir `.dock/sorting-v3/runs/20260910-110705-9136285d`; итоговый путь
  `/user/dock-p3/packages/Dock-acceptance-20260910-110705-9136285d.lgp`.
  Это целевой путь, наличие ещё не подтверждено. Runtime/auditors не менять
  до завершения и независимого `sales_sorting_acceptance.py`.
- Empty existing sort `sort-edges-empty-1789027428803` (execution53) — config/
  output PASS, row_count0, та же schema и sorting GUID, без reconfiguration.
- Variant `sort-variant-1789027473652` (55) — configuration PASS,6строк и
  мультимножество первых5 типизированных полей сохранены. VAR возвращён только
  `formatted_display / precision=unverified`, limitation `variant_display_precision`.
  Общий порядок произвольных смешанных variant и точность их внутренних значений
  не объявлены проверенными; это явная граница typed output, не native failure.
- QA package checkpoints SUCCEEDED: `sorting-fixture-save-1789027533068`
  (исходный путь reference-копии), `sorting-original-qa-save-1789027534804`
  (`/user/dock-p3/packages/Dock-sorting-diagnostic-20260910.lgp`). Checkpoint
  подтверждает save completion, не persisted_content; продажи ранее отдельно
  прошли real reopen/reexecute, финальный Hermes повторит это автономно.


### Исправление адреса финальной приёмки

Первый run `20260910-110705-9136285d` завершился без node operations: текущая
пользовательская конфигурация направила prepare на dev-test staging 7.5 alpha,
вместо проверенного logi-test-plan 7.4.2. Независимый аудит FAIL (`efficiency`,
`eight_node_operations`); пакет не создан. Исходные receipts сохранены.

Codex повторно открыл реальный целевой UI: `live-1789027970769/preparation.json`
подтверждает actual build 7.4.2, авторизацию и точный сохранённый sales package;
geometry: viewport null, окно2044×1035. Пакет открылся read-only, harness
закрылся до каких-либо настроек/копирования; для проверки target этого достаточно.

Новая отдельная private конфигурация `.dock/sorting-v3/acceptance-config.json`
отличается от текущей только `loginom_url=http://logi-test-plan.bg.local/app/?testable=true`.
Основной config и credentials не изменялись. Повторный автономный run
`20260910-111339-6b48145f` начал Sol/low; source runtime/native skill/goal pins
сохранены. Итоговый audit пока не получен. Не менять frozen source/auditors.


### Второй run: диагностика независимого аудитора

`20260910-111339-6b48145f` выполнил все8 node operations, четыре save и повторное
выполнение обеих ветвей после reopen. Исходный замороженный audit: **47/49**, FAIL
`saves` и зависимый `all_components_ran`. Сортировки и все расчёты до/после открытия
прошли, но сохранения ожидали display labels вместо native graph IDs и запрещали
повторное сохранение собственного draft по прежней политике двух save.

Codex вновь открыл именно финальный пакет в реальном UI, read-only:
`live-1789028770986/accepted-graph-raw.json`. Подписи `По товарам` и
`Рейтинг товаров` отображаются с пробелами, graph tids содержат подчёркивания.
Trace промежуточных save независимо показывает exact path conflict → overwrite
confirmation → completed в нужном порядке. Основной runtime не менялся.

Исправлен только auditor: sales graph ожидает нормализованные native identifiers;
замена допускается исключительно для непосредственно предыдущего доказанного
собственного draft, при declared replace и однозначной ordered conflict trace.
Первый save, другой файл, пропущенная/двойная/переставленная confirmation и fail
policy отклоняются. Полный Python suite **425 PASS** (два новых regression tests).

Диагностическая переоценка старого evidence —54/54, но **не final acceptance**:
`.../sales-sorting-diagnostic-reassessment.json` помечен diagnostic_only. Старый
`sales-sorting-audit.json` FAIL и frozen-source275files сохранены неизменными.
Новый самостоятельный run запускается с заново замороженным auditor; модель
остаётся existing openai-codex/gpt-5.6-sol/low. Codex browser закрыт.


### Третий run: выбор старой загрузки вместо delivery

`20260910-112850-7aa2b6bf` Codex остановил до node operations после legacy
`artifact.upload=AMBIGUOUS/UPLOAD_SERVER_VERIFICATION_REQUIRED`. Модель выполнила
раздельные Files UI шаги и не подтвердила серверные байты; такой путь не проходит
declared delivery gate. Export сохранён; audit FAIL model/efficiency/tool_scope/
eight_node_operations. Это операторская остановка, не естественное завершение.

Возврат Codex в реальный Files UI: `live-1789029202988` /
`delivery-ui-incomplete-upload.json` подтвердил наличие нового CSV с точным именем
и отображаемым размером250 bytes в выбранном `/user/dock-p3`. Это **не SHA proof**.
Неизвестная операция не повторялась, файл не удалён/перезаписан. Граф не создавался.

Native Hermes skill теперь явно предписывает доступный `dock_artifact_deliver`
вместо сборки полного пути из устаревших отдельных загрузок. Подготовленная goal
остаётся пользовательской задачей без UI/tool последовательности. Browser Codex
закрыт; следующий самостоятельный Sol/low run использует новый skill/runtime pin.


Текущий run `20260910-113507-53ef2ba4` прошёл полную delivery SUCCEEDED.
Runtime `96f8b5db7901c29ab5c631d57ad85f6e0f8b9181ed471b311c238732733e081e`,
native skill `0c5236396c477d5424acc74f8fb693ac59539d840ff91169053131bf3bcad140`,
goal прежний `517fca059e4f65fddae3199c9cacd9edd80fb025aaf3b23ec64d1063eb7f8d12`.
Сохранена byte-verified frozen-source копия275files; исходники не менять до audit.


## Завершение подплана08 и V3

`20260910-113507-53ef2ba4` естественно завершился: process0, completed=true,
failed=false, timeout=false. Независимый final audit **56/56 PASS**; повтор из
275-файловой frozen-source копии побайтно совпал. Реальный пакет
`/user/dock-p3/packages/Dock-acceptance-20260910-113507-53ef2ba4.lgp` принят:
доставка, шесть узлов/пять связей, все вычисленные строки и оба рейтинга,
четыре save, reopen и два новых выполнения без перенастройки/дублей.

Подплан08 — implemented/live_verified; этап V3 завершён в source runtime.
[Полная матрица, pins, измерения и ограничения](08-completion-audit.md).
Production build/deploy/release и обновление установленного клиента не выполнялись.
Остальные типы05/06/09/10 и V4/V5 остаются в плане.
