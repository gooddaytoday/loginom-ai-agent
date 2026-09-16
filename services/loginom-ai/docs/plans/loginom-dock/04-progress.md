# 04 — контрольная точка, 9 сентября 2026

Статус: **implemented / live_verified (source runtime)**. Подплан завершён;
Hermes `20260909-145157-ee05c9e3`,45/45 PASS. [Итоговая матрица](04-completion-audit.md).
Ниже сохранена хронология, включая промежуточные незавершённые состояния.
Production, серверные модели и установленный клиент не менялись.

## Реализовано в исходниках

- Кандидат `calculator-node.mjs`, параметры expression-only, patch существующих
  выражений с сохранением незапрошенных свойств, упорядочивание по полному списку.
- Привязанное к узлу чтение локальных Ext records и выбранного CodeMirror editor.
  Выбранный текст до переключения строки ещё не записан в Expression record;
  getTotalCount у этих локальных stores может отставать от getCount.
- Общий node procedure поддерживает точный модальный редактор выражения и его
  picker portal. Ошибка Next читается из собственного btnError/data-qtip.
- Кандидат соединяет промежуточное Done, отдельный выходной порт, графовое
  выполнение и точное чтение таблицы. Bridge пока использует прежний handler. Добавлен calculator configuration readback
  и отдельная ветка публичной result schema.

## Проверено

Реальный Loginom 7.4.2, `logi-test-plan.bg.local`, явно выбранный тестовый аккаунт
`user` и хранилище `/user/dock-p3` из принятой диагностики03. Вход аккаунта `test`
не прошёл. Видимые source browsers: start-maximized, viewport null, геометрия
проверена. Help/E2E получены через Dock; локальные диагностические источники —
`.dock/calculator-v3/sources/`.

В `.dock/text-import-v3/execute-1788942658614` вручную проверены несколько
выражений, одинаковые метки, зависимость Adjusted от Revenue, замена Amount,
ошибка `Amount *`, отдельный порт и выход 3×5 с дробями, отрицательным числом,
пустой строкой и Null. Ошибочный Next остался на выражениях; кнопку
«Всё равно далее» не использовали. Это диагностика, а не автономная приёмка.
Программная настройка существующего узла сохранила соседние формулы, добавила
строковое Note. Seed: `/user/dock-p3/packages/Calculator04-diagnostic-seed.lgp`.

56 focused source tests PASS: calculator context/parameters, node API/procedure.
Полная клиентская регрессия на следующем исходном снимке: 1040 PASS / 1 SKIP.
После этого добавлены readback и обобщение открытия входных портов: 75 port/context/procedure
и 56 calculator/readback/node-apply тестов PASS; полная регрессия новой ревизии ещё нужна.
Независимый новый audit ещё не выполнен.

Первый публичный MCP проход `.dock/calculator-v3/live-1788943996260` остановился
в open до жеста: уведомление Loginom и пакет «только чтение». Inspect сохранил
AMBIGUOUS, повторное изменение runtime отказал. Save As вручную создал собственную
копию `/user/dock-p3/packages/Calculator04-working-1788944404327.lgp`; новая
редактируемая идентичность проверена, пакет явно закрыт через меню.
Это обход диагностического окружения, не проверка продуктового recovery.

## Продолжение

Текущий public source diagnostic: `.dock/calculator-v3/live-1788944448000`,
runtime pin `683fa1909320ce4781fad54a993f36d4300d3b65f4f8de00a75625325665c0a2`.
`tools/loginom-acceptance/calculator-live.mjs` принимает operator scripts через
stdin; их вмешательство исключает классификацию запуска как Hermes acceptance.

Публичный existing-node проход `calculator-existing-1788944469069` SUCCEEDED:
11 фаз, выполнено с графа без переоткрытия мастера, свежий выход 3×7,
execution `1788944450138-1tzg0d7vetz:174:1`. Пять выражений: Revenue,
Adjusted, заменяемый Amount, строковый Note с Null и Moment=2024-02-29.
Readback проекция новых исходников на этом журнале прошла; это replay evidence,
а не новый live test readback. Сохранён следующий диагностический пакет
`/user/dock-p3/packages/Calculator04-node-applied-1788945130039.lgp`.

Входной порт реально исследован: после подтверждения деактивации открывается
TuneDataSourceMappingWizard, таблица с парными ConnectedRecord, EditTuneColumnDefForm.
WizardModelComponentForm удерживает FModelSocket (proxy сравнивается только по identity),
дерево ModelInputPortsTreeNode. Редактор отменён, порт закрыт Done без правок.
Общий opener/context расширен на направление input; живое открытие нового узла и native input mapping readback подтверждены
в `live-1788945172563/input-opener-new.json` и `input-read-fresh.json`.
Механизм input mapping добавлен в кандидат, его полный node.apply ещё проверяется.

Следующий source diagnostic `.dock/calculator-v3/live-1788945172563`, runtime pin
`b70f2eb2eae2f8bbdee3ae34a23248e002099d909360b9762dc4cce49714d50d`:
создание Calculator04New от исходного Import03Done.
`calculator-new-1788945209449` выполнил все11 фаз: node
`6284cf1c-7f0a-4597-86d7-f7628d7fe68d`, 3×5, execution
`1788945174656-h4hix240pfa:174:1`. Первая доставка была отвергнута MCP output schema
из-за readback только для импорта. Исправлена schema union, сохранённый результат
доставлен повторно с тем же ID: `redelivery-schema.json`, browser calls373→373.
Это source diagnostic recovery ответа без повторного исполнения, не итоговый
замороженный acceptance. Публичный readback содержит2 выражения и5 выходных полей.
Входной mapping дополнительно проверялся свежими модулями: Id→Quantity с меткой
Количество был применён, но старый output-only postcondition вернул AMBIGUOUS.
Исправлена проверка того же исходного input_mapping stage. Отдельным новым
операторским действием восстановлены Id/Id, подтверждены полная native schema,
неизменные соседние поля и связи; `input-configure-restored.json`. Loginom
после ручного редактирования переводит OriginType выбранного поля0→1; учтено
только для изменяемого входного поля. Done через общий channel SUCCEEDED.
265 workspace-ui/native mapping tests PASS; полный прогон до последней поправки
postcondition:1045 PASS/1 SKIP. После новых правок нужна свежая полная регрессия.
Пакет с обоими Калькуляторами сохранён как
`/user/dock-p3/packages/Calculator04-node-applied-1788945952627.lgp`, явно закрыт.
Следующий тест — `full-input-existing.mjs`: input Id→Quantity, autosync=false,
Value=Quantity*Amount, Execute. Все такие скрипты — Codex diagnosis, не Hermes.

1. Закончить полный node.apply существующего и нового узла, Done/Close/Execute.
2. Исследовать реальный входной порт, реализовать общий input mapping с актуальной
   schema identity; кандидат принимает полную таблицу входных полей через тот же configured_field
   self-reference текущего источника порта; исключения входных полей пока отвергает.
3. Добавить configuration readback и continuation/recovery; текущий
   verifyContinuation возвращает false. Проверить cancel/stop и lost replies.
4. Доработать независимые fixtures/verifier: все требования04, пустой вход,
   переименованный вход, исключение/порядок выхода, Null/string/datetime,
   сохранение/reopen/reexecute, отсутствие дублей и сохранность свойств.
5. Полная регрессия, registry/card/skill/bridge, frozen source evidence, затем
   единственный финальный goal-only Hermes через существующую подписку
   openai-codex / gpt-5.6-sol / low. При неуспехе — обратно к Codex диагнозу.
6. Итоговый аудит каждого требования, точные pins, время/calls/tokens, обновление
   статусов только после принятого независимого полного результата.


## Дополнение: полный входной mapping

Снимок `live-1788946005475`, pin
`3ce4c3e5a2563bc07b3fea1b1fa6b8c6c5b4b6b774ed25b6e2cd8f5dd281adc0`:
полный вызов `calculator-input-1788946038865` остановился после открытия
input port, до редактирования. Ошибка наблюдения вызвана ранним доступом
к отсутствующему breadcrumb node.ref при ещё не готовой навигации.
Исправлено ожидание наблюдаемого input_port_context перед формированием Done.
Живой read-only диагноз после стабилизации подтвердил все9 crumbs, иконки,
идентичность узла и input port receipt. Порт закрыт без изменения настроек.
Не считать этот запуск принятым full input mapping; нужен следующий current-pin run.

Исходники common output-columns теперь также читают выходные столбцы входного
порта; направление мастера остаётся input_mapping. Native EditTuneColumnDefForm
обязательно связан с одной выбранной Ext записью. Настройки не вычисляются в клиенте.

## Продолжение: оба порта, Done и независимый readback

`live-1788946278760`, pin47d1dbde75cd5788a0614fa4d791e62a47706ab5dd2104ba4e0cb78318867c43:
`calculator-input-1788946313309` SUCCEEDED; Quantity вместо Id, autosyncfalse,
Value=Quantity*Amount, свежий выход3×5. Следующий output-exclusion-done остановился
на reorder: исключение заменяет native record, поэтому нельзя использовать старый
record_id. Исправлено повторное разрешение source→target после field edits, полный
список reorder с отдельной группой исключённых записей и проверка полной rendered
schema. Свежие диагностические модули подтвердили порядок Quantity,Value,Text,Amount
и исключённый Title; Done выполнен, копия сохранена1788946768449.

`live-1788946829442` остановился на input Done, потому что повторно открытый исходный
пакет стал readonly. Создана собственная копия1788946986509, явно закрыта.
`live-1788947006762`, pinf3aad278da5e017a900e69ce8533035473e79166b79c34ff6eabe053b2003deb:
input mapping, выражение и output reorder/exclusion применены, но перед Done
не запрашивалась полная definition page, необходимая guard для unmapped excluded
row. Исправлен явный outputColumnPage для завершения обоих портов. Диагностический
Done прошёл. Копия1788947206110 сохранена и явно закрыта.

`live-1788947253692`, pineea3cf8bfc4aab2f336b0aa4b11076092248af8f76f191cef5aa6c97528b0e12:
`calculator-ports-done-1788947263747` SUCCEEDED: оба mappings, settings applied,
execution=not_requested и output=not_refreshed, исключённый Title сохранён в readback.
Независимый `calculator_configuration_evidence.py` подтвердил raw config, ownership,
syntax Next, промежуточное Done и final Done, сохранность незапрошенных свойств.
Аудит не доказывает auth/persistence/вычисления. Такой же аудит прошёл для раннего
нового узла `calculator-new-1788945209449` (его original pin и journal).

Добавлены bridge composition, typed parameter card, TypeScript types и инструкции
обоих skill. Runtime всё ещё candidate; production не обновлялся. Полная регрессия
1045PASS/1FAIL/1SKIP выявила устаревшее ожидание bridge: калькулятор теперь доступен
как candidate. Ожидание исправлено; focused bridge/calculator/port24PASS. Новые
independent binding/configuration tests9PASS и исходные procedure18PASS.
После последних правок требуется полная регрессия.

Continuation больше не пустой: поддержан строгий accepted finish/execute checkpoint
через общий verifier неизменного графа/процесса. Эта ветка и native stop ещё требуют
живого QA. Configure/port partial effects не возобновляются автоматически.

Новый matrix-call `calculator-new-1788947320707` остановился в target после создания
единственного узлаb2aa1402-788e-4862-ae54-502ed7ee7797 (ещё «Калькулятор», без связи).
Причина: до жеста readGraph показал outputs[] у прежнего Calculator04New после
output-port Done; после добавления output0 снова появился. Graph guard счёл это
посторонним изменением и вернул AMBIGUOUS. Нельзя повторять добавление. Codex
проверяет реальный port-rendering после Done (`graph-ports-after-done.mjs`).
Полный matrix, пустой вход, Close/cancel/stop, freeze и итоговый Hermes ещё впереди.

## Matrix, Close и точный выход

Диагноз graph-ports-after-done показал видимый FCell выходного порта без SVG tid;
щелчок по собственному узлу восстановил shape. Добавлен этот штатный выбор в
calculator.finishGraph. readGraph больше не выдаёт complete, если visible native
port не отрисован (скрытые service ports остаются вне табличного инвентаря).
Новый unit test проверяет отказ в таком состоянии и поддержку hidden service.

`live-1788947535660`, pin14a041c4f8a05427a799f8904c0e2ad0fa2cd5005401c1a2a5084591529dfc26:
уже созданный единственный matrix node b2aa1402-788e-4862-ae54-502ed7ee7797 настроен
вызовом `calculator-new-1788947547219` (target existing, имя вызова историческое).
Revenue,Adjusted,Amount replacement,Note,Moment; оба порта; execute3×6 SUCCESS.
Independent raw configuration audit PASS. `calculator_output_evidence.py` сравнил
все18 ячеек с независимым ожидаемым выходом, графовым запуском и полной историей
процесса205:1. Close-вызов calculator-close-1788947627167 временно заменил Revenue
на999 и подтвердил draft_discarded. Повторное выполнение
calculator-reexecute-1788947672392 с expressions[] вернуло исходные формулы и
значения; отдельный execution205:3 и independent output PASS. Шесть подмен
typed value,execution ID,date,raw pages,launch proof,return receipt отвергнуты.
Публичный save_checkpoint сохранил
`/user/dock-p3/packages/Calculator04-node-applied-1788947814652.lgp`; явно закрыт.
Публичный diagnostic catalog использует save revision1; итоговый Hermes должен
идти через закреплённый серверный manifest с save revision2, как03.

Полная клиентская регрессия после graph fix:1046PASS/1SKIP; Python390PASS до
расширения graph execution verifier, затем11 execution testsPASS. После новой
поправки overflow и добавленных тестов требуется финальная регрессия.

Первый reopen `live-1788947944830` того же pin14a остановился на port Done: в
окне1508px последний breadcrumb «Настройка» скрыт Loginom (width0,height0),
но cached prepared node/port context и полная schema подтверждены. Исправлено
чтение только конечного hidden wizard crumb при native prepared port binding;
без такой binding прежние отказы остаются. Свежие диагностические модули
выполнили Done (`output-finish-overflow.json`). Это не успешный reopen call:
нужен новый current-source проход, independent audit и zero-input QA.

## Повторное открытие и пустой вход: текущая проверка

`live-1788948222877`, pin
`c8da37e9a086a60728ffe94d3f35c17fa85bafac83877721f4c0ef2c0ec77a7d`:
повторное открытие сохранённого пакета и `calculator-reopened-1788948234761`
прошли; независимая проверка полного выхода 3×6 PASS, execution174:1.
Загружен CSV только с заголовками, импорт дал 0 строк с тремя полями.
Первый калькулятор остановился после настройки входа: hidden последняя
хлебная крошка имела пустой видимый текст. Native port binding оставалась
верной. Исправлен исключительно фиксированный caption «Настройка» для
этого скрытого элемента при подтверждённом native input port; 250 UI-тестов
PASS, включая bound/unbound/wrong caption/missing icon.
Оператор завершил этот мастер и сохранил отдельную диагностическую копию
`/user/dock-p3/packages/Calculator04-working-1788948951156.lgp`.

`live-1788948971356`, pin
`f4f7374ad00cfccd761acf464be8167d446d1f80fcc35768a6dbf8f1cb104cb5`:
`calculator-new-1788949016080` настроил существующий пустой узел
`e52b1c8e-315d-450b-b75c-d2edf65eb7ae` (первый Expr1 изменён, ещё четыре
выражения добавлены), оба порта и полный Execute. Выход 0×6, execution195:1;
независимые configuration/output audits PASS (`empty-audit.json`).
Текущая независимая проверка дополнительно сравнивает новые выражения с
запросом, source identity/order/settings/autosync каждого заданного mapping
и входную схему с фактически открытым Калькулятором. Старый matrix journal
и unchanged reexecute прошли усиленную configuration-проверку.

Для числового Null доставлен 60-байтный CSV
`/user/dock-p3/Calculator04-null-1788949106408.csv`, SHA256
`f6499742c647958be248b07e64b62cd43ca7194f8cc14e8628d6e94364db6948`.
Дальнейшие import/calculator проверки пока не отмечены выполненными.
Подготовлены goal-only `calculator-node-complete.txt` и независимый полный
аудитор; Python396PASS. Hermes пока не запускался. Общий статус04 остаётся
in_progress; требуется оставшаяся QA-матрица, полная source-регрессия и
самостоятельная финальная приёмка Sol/low на замороженных исходниках.

## Завершённая дополнительная Codex QA перед Hermes

На pin f4f7374ad00cfccd761acf464be8167d446d1f80fcc35768a6dbf8f1cb104cb5
новый Calculator04Null (`ef210954-b1ae-499a-8ee3-bcec2ccf4caa`) успешно выполнил
пять выражений на числовом Null, отрицательном и точном дробном значении:
`calculator-new-1788949190457`, output195:5, полный3×6 и independent audits PASS.
Перестановка Moment,Note,Revenue,Adjusted,Amount (`calculator-order-1788949283119`;
точный ID см. reorder-calculator-request.json) сохранила формулы и выход,
independent configuration/output PASS, execution195:7.
Неверное Quantity* вернуло принадлежащую узлу WIZARD_CALCULATOR_VALIDATION_FAILED.
Повтор ID дал идентичный ответ при browser calls2222→2222; мастер отменён.
Отмена после accepted finish дала cleanup_complete=true; повтор без нового
Execute. Resume отказал при изменившемся DOM epoch169796→169850, остальные
проверенные поверхности совпали. Это отрицательная проверка строгой continuity,
не успешное продолжение и не разрешение обходить guard. Общий native stop
использует принятую основу03; отдельная отмена длительного расчёта04 не заявлена.

При попытке добавить выражение в узел с выключенной output autosync наблюдена
условная страница DerivedDataSourceMappingEngineOutputPortWizard. Операторская
однократная синхронизация добавила только новое поле, сохранив прежние значения,
порядок и исключение; native records переиздаются, ID исключённого поля меняется.
Handler теперь допускает для Calculator Next ровно два наблюдаемых назначения,
проверяет условную страницу, синхронизирует только отсутствующие новые выражения
и проверяет сохранность всех прежних полей. Остальные переходы остаются точными.

`live-1788950061765`, runtime pin
`b12133bd83fb2b702e800827f80b4be13f2b41e65825588abb6662fc8aadd461`:
`calculator-extend-1788950095653` добавил AuditTemp=1 в существующий узел,
прошёл условную страницу, порт и Execute. Independent configuration/output
PASS3×7, execution174:1. Четыре подмены formula/label/type/replace отвергнуты.
На том же pin намеренно потерян ответ после подтверждённого добавления LostTemp
(`calculator-lost-expression-1788950162451`): effect unknown, повтор результата
без браузерных вызовов533→533; live readback подтвердил ровно один LostTemp.
Отмена изменения имени в редакторе сохранила все семь записей; последующее Close
отменило весь draft с LostTemp. Диагностическая копия сохранена отдельно:
`/user/dock-p3/packages/Calculator04-working-1788950250305.lgp`.

Перед самостоятельным Hermes: полная client suite1051PASS/1SKIP; Python396PASS;
diff check PASS. Новые проверки условной страницы и mapping пройдены.
Финальная автономная приёмка ещё не запускалась на момент этой записи;
результат04 остаётся in_progress до независимого аудита полного goal.

## Первый финальный Hermes: отказ до сценария из-за другого стенда

`20260909-133841-b5d8ae73`, тот же b12133 runtime, существующий Sol/low:
независимый аудит13/15, FAIL efficiency/four_node_operations. Общая локальная
конфигурация указывала dev-test/staging с7.5.0-alpha+build.49644, а закреплённый
каталог требует7.4.2. dock_prepare вернул INCOMPATIBLE/UI_BUILD_MISMATCH до
входа и создания черновика; Hermes корректно остановился после diagnostics.
Выполнения и сохранения не было. Отчёт сохранён неизменным в hermes-runs.

Создана отдельная приватная acceptance-config.json с ранее проверенным
`http://logi-test-plan.bg.local/app/?testable=true`; общая конфигурация не менялась,
подключение и модели сохранены. Перед следующей попыткой Codex проверяет эту
конфигурацию через настоящий bridge в remote-correct-stand; это проверка без
Hermes, не зачёт автономной приёмки. Исходники runtime/harness не менялись.


## Уточнение автономной приёмки — 9 сентября, 14:02 МСК

Второй Hermes `20260909-134316-9420b0a5` выполнил все четыре node.apply,
сохранил и переоткрыл пакет на Loginom7.4.2. Независимые проверки исходных
и восстановленных настроек обоих узлов и полного выхода Калькулятора6×8 PASS.
Полный frozen audit FAIL: задание не уточняло сохранение без закрытия и порядок
входов, агент изменил выходной mapping импорта и использовал промежуточный
save_as. Неоднозначная native инструкция привела к отказам валидации до UI,
а повторный запуск калькулятора передал order вместо пустого patch; дополнительный
переход в Файлы также вышел за проверяемую полную локальную цепочку.
Этот прогон не засчитан; исторические отчёты не переписаны.

До следующего запуска уточнены native skills: свойства выражения находятся
рядом с target; target выбирает запись выражения, а не входное поле; replacement
в новом узле тоже target=new. Reexecute калькулятора использует expressions=[],
без order/mappings/inputs. Квитанция save_as уже проверяет путь и переоткрытие.
Goal-only задание явно сохраняет исходный порядок полей, не меняет порт импорта
и требует промежуточного сохранения без закрытия. Проверяющие условия не ослаблены.
Python396 PASS; новый прогон `20260909-140208-0490e617` начат Sol/low,
через приватную task-конфигурацию согласованного стенда7.4.2. Общая установленная
конфигурация другого стенда сохранена. Runtime и harness заморожены до экспорта.


## Readback входного порта

Hermes `20260909-140208-0490e617`: frozen audit43/45 PASS, общий verdict FAIL.
Обе настройки, оба выхода, доставка, связь, checkpoint/save_as/reopen и отсутствие
перенастройки после открытия прошли. Два отказа относятся к дополнительным
внешним UI-вызовам: Hermes открыл/закрыл меню входного порта после готовой цепочки.
Обнаружен предметный пробел: input_fields показывали итоговую схему, но публичный
readback не возвращал входные autosync/source→target, нужные для полного сравнения.

Обработчик теперь читает входной порт в фазе input_mapping даже при пустом patch,
до открытия мастера выражений, без изменения полей/autosync. Результат включает
пятый связанный receipt и полный input_mapping; independent verifier реконструирует
его из raw native observations. После выполнения мастер не переоткрывается.
Дополнительная инструкция не заменяет эту наблюдаемую конфигурацию.
Client1052 PASS/1 SKIP, Python396 PASS. Codex live-проверка новой проекции выполняется
в отдельной копии; прежний неуспешный frozen отчёт не изменялся.

Codex `live-1788952474138`, операция `calculator-input-readback-1788952498539`,
runtime `2b59361937b8587d21f0939a0cfa9ef679c3669c1efefb2bdc36473f94fca579`:
полные configuration/output3×7 PASS, execution470:1; все пять подмен входной
autosync, source, label, receipt и отсутствующего raw observation отвергнуты.
Копия `/user/dock-p3/packages/Calculator04-input-readback-20260909-1420.lgp`.

После явного закрытия диагностического пакета и браузера начат Hermes
`20260909-141816-a3048d4a`, Sol/low, runtime90 с тем же полным pin2b5936.
Source и harness заморожены; итог до полного независимого аудита не засчитывается.

Hermes `20260909-141816-a3048d4a`:43/45 PASS, общий frozen verdict FAIL.
На runtime90 прошли все настройки обоих портов, полные выходы, обе сохранённые
конфигурации, новый запуск и вся связь evidence. Отказы tool_scope и
no_intervening_operation относятся только к дополнительным переходам в Файлы
для размера пакета: фразу goal «размер результата» агент истолковал как размер
файла. Уточнено «число строк и столбцов вычисленной таблицы». Исходники handler
и проверяющие условия не изменены; новый goal получает новый frozen hash.

`20260909-143055-b70a0fa0` остановлен оператором до завершения приёмки:
при финальной сверке найдено отсутствие input_mapping в TypeScript-декларации
CalculatorConfigurationReadback. Model group завершена SIGTERM, экспорт сохранён,
прогон не засчитан. Декларация дополнена после завершения экспорта; исполняемые
модули и проверяющие условия не менялись. Новый полный pin включает эту декларацию.

`20260909-143403-4b7c080a`: исходный frozen audit43/45 PASS, общий FAIL.
Все предметные проверки прошли; единственный отклонённый запрос содержал
неизвестное поле nitz и был отвергнут request.validate до UI: operation_id=null,
request_rejected=true, effect_possible=false, idle/cleanup_confirmed, trace=[].
Агент исправил запрос и выполнил четыре нужных узла. Чтение dock_operation_inspect
также ошибочно отсутствовало в allowlist сценарного аудитора.

Verifier исправлен до следующей приёмки. Только для Калькулятора включена
проверка доказанных отказов валидации: парный публичный ответ, точный canonical
REQUEST_REJECTED без эффекта/операции и полное отсутствие запрошенного ID
в execution journal. Иные ошибки, следы действий, running/unknown или чужой
ответ остаются отказом. Прежний strict default общего verifier сохранён для03.
Readonly inspect разрешён; дополнительные внешние изменения не разрешены.
Python397 PASS, включая отрицательные подмены. Дополнительная проверка прежнего
журнала новым кодом дала43/43 component PASS и явно перечислила один отказ;
она записана отдельно и не переписала исторический frozen verdict.

Новый frozen прогон `20260909-144549-a28c2825`: тот же runtime90
36d41764abaa9cf224469c53cf6aab6c057616561bdb84dca82ee3693001ed0a,
уточнённый аудитор и goal; до полного экспорта и аудита статус in_progress.

`20260909-144549-a28c2825` остановлен после диагностированного source refusal:
вместо `deliver-csv-a28c2825:upload` агент передал `deliver-csv-a28c2825`.
Драйвер отверг непроверенную загрузку до target/UI: node=null, phases=[],
NOT_APPLIED, effect_possible=false; source verification не обходили. Журнал
и неуспешный audit сохранены. В native инструкции обоих клиентов явно разделены
корневой delivery operation_id и возвращённый upload_operation_id; значение
должно копироваться из подтверждённого ответа, а не конструироваться.
Исполняемый код и аудит не менялись.

## Итог

Hermes `20260909-145157-ee05c9e3` выполнил задачу самостоятельно; все45
проверок frozen аудита PASS. Runtime90 `b9e08599288a4a2463241bfd35c6973c57f77a63e354d3c28a836c1e50ab042f`,
audit SHA256 `a7af79db2e9487dfcdc7aad13b53185b12ffef52bfd7452eb0bb61b783f5d7f5`.19 public calls/19 model API, без отказов валидации
и внешних UI-жестов. Полный6×8 до/после открытия; оба mapping и все выражения
сохранены. Все146 harness sources скопированы в frozen-harness и сверены по SHA.
Работы по подплану04 не осталось; production/release V5 не обновлялись.
