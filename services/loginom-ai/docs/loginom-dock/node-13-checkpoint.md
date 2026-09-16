# Узел 13: checkpoint разработки

## Текущее состояние — candidate preparation завершена

[Комплект полной приёмки](node-13-acceptance-candidate-preparation-1.md) подготовлен на source 5a4c46fc / runtime 2488fdaa. Review1 и fix1 completed; повторный review не назначен. R1/manual/R2/R3 приняты в границах evidence map. Полный 10-row goal ещё не принят.

Новый catalog version предложен только для test-3; точный source archive и manifest готовы для VPS координатора. Модель/браузер не запускались, слот свободен. Остались candidate stage/readback, current native/direct-open/regression gates и отдельный admission/слот.

## История предыдущих фаз

Все OPEN/не применялся ниже относятся к состоянию соответствующей прошлой фазы; текущие решения указаны выше. Старые FAIL не переобозначены.

## R2 integration — целевой live gate завершён

По отдельному разрешению применён точный patch47830abe… из a63586fe…:
11 файлов/18 hunks, повторные blob/SHA/dry-check и post-apply payload PASS.
Live aa03cb93-8df3-4b1c-808e-6a13e835caf4, runtime
2488fdaa08e4d6da9b7a31fb7598f675a8ad972efd65640b34cbc851feb16e2b:
реальная ошибка отдельного CSV → FAILED/local_node_failed/cleanup:true,
полная свежая группа5/root457/record1343, native source failed и target parent_failed.
Независимый terminal audit PASS,15/15 negatives. Repeat/resume1057→1057→1057,
inspect resolved, pending released. CSV восстановлен, новый запрос SUCCEEDED,
свежие4×8/config/raw/values PASS; прежняя manual configuration сохранена.
Диагностическая копия закрыта без сохранения, .held отсутствует, harness exit0.
Focused135 PASS, клиент1477 PASS/1 SKIP, Python533 PASS.
[Отчёт](node-13-r2-integration-1.md), [доказательства](node-13-r2-integration-evidence.json).

R2_terminal_live закрыт в этом scope. Full autonomous10rowgoal, новый admission
и Hermes остаются OPEN и требуют dispatch координатора; слот Hermes не занимался.
Новых чужих hunks, main/push/deploy/plugin/routing изменений нет.

## Manual output follow-up — целевая проверка завершена

Назначение `node13:manual-output-followup:1:b01f2e83ca6253087bba71150f078b9d9083f612`.
Исправлено точечное добавление quarter/hour существующего Date/time при
manual output/autosync=false с сохранением старых имён, связей и Amount excluded.
Live bafafea6: public SUCCEEDED, config/raw/values/manual-schema PASS, **4×8**;
7/7 подмен доказательств отклонены, repeat/resume991→991→991.
Один save checkpoint `/test-3/N13-bafafea6.lgp`, отдельный exact reopen df361bf1:
parameters={} / mappings=[], тот же GUID, свежие4×8, persistence PASS.
Runtime `25706c0215637218f61d5c89cc47ded2dd2636e635e66ac79843152b154513cc`.
Оба успешных сеанса и предыдущие диагностические сеансы закрыты exit0.
Client1472 PASS/1 SKIP; Python533 PASS. Исходные FAIL сохранены в
[отчёте](node-13-manual-output-followup-1.md),
[доказательства](node-13-manual-output-evidence.json).

Исходный коммит исправления `7d7f0bc2a23c8db5d57fbeb9ceb57d3a8ca29907`.
R2 не применялся: [transfer packet](transfers/node13-r2/README.md) выбранных18
hunks/11 файлов источника a63586fe закреплён на этом source-коммите.
Финальный git apply --check PASS, payload и хэши проверены; перенос не разрешён. Интеграция, R2 live gate, новая общая приёмка
и Hermes требуют отдельного dispatch координатора. accepted10rowgoal/R3 не менялись.

## Configure recovery — целевая проверка завершена 13 сентября 2026

Реализовано Date/time-specific восстановление исходной configure после потерянного
ответа flag click. Live 1de08440: тот же ID/session/runtime, полные 2×29 матрицы,
без повторных флагов, remaining hour/Next/mapping/execute/read, **4×8**.
Независимые recovery/config/raw/values PASS, 8/8 evidence negatives; реальный отказ
при чужом выбранном поле. Client1449 PASS/1 SKIP, focused164, Python533.
[Отчёт](node-13-configure-recovery-1.md), [план R2](node-13-r2-integration-plan.md).

Ограничение: добавление новых выходов existing узла с autosync=false остановилось
на 9 sources / 7 targets; это не успешный end-to-end случай. R2 не интегрирован,
его live gate OPEN. Полная новая приёмка, final pins/catalog и Hermes не запускались.
R3 и accepted10rowgoal не менялись. Следующий шаг требует dispatch координатора;
не продолжать автоматически расширение scope, интеграцию или следующую приёмку.

## Исправление лимита входа — завершено

По команде `node13:acceptance-input-limit-fix:1:881793e1f1d5b61f149112f3d6a29f72eb441b4e`
комплект сокращён до10 строк без потери семантических cases. Public schema:
8/8 результатов +8/8 чтений PASS, 11/12-строчные подмены отклонены4/4.
Python533 PASS; новая frozen сумма407; все12 операций по двум датам сохранены.
[Актуальный отчёт и pins](node-13-acceptance-input-limit-fix-1.md).
881793e1/12строк — исторический несовместимый комплект, не основание для admission.
R1/R2, direct-open end-to-end и Hermes остаются OPEN/NOT RUN.

## Подготовка входов приёмки — завершена 13 сентября 2026

Команда `node13:acceptance-input-preparation:1:ed53b0189fa92dfc879015ee08580dcadf2c3cd2`.
Подготовлены естественное ТЗ месячных/квартальных продаж, CSV 10×4, независимые
frozen таблицы 10×27 / 0×27 / 8×3 / 6×3, полный auditor и отдельный guarded launcher.
[Отчёт подготовки](node-13-acceptance-input-preparation-1.md) содержит хэши,
рабочие команды, точный configure contract и матрицу admission.
Shared R1/R2 остаются OPEN; final runtime/archive/catalog и слот не назначены.
Модель, браузер, stage/build/merge/push/deploy и повторный review не запускались.
Следующее действие — только разрешённая интеграция общей части и целевые live
проверки, затем новый candidate и отдельный dispatch приёмки. Текущая подготовка
не принимает узел и не запускает следующий. Исторические результаты ниже относятся
к своим ревизиям и fixture, а не к новому declared goal.

## Fix round 1 — текущая точка

По команде `node13:fix:1:4d6f632e61b7a183fb63bb090e93ab3e29bf52a5:N13-R3`
завершён единственный fix round: **N13-R3 закрыто**. Live dcb8e87c подтвердил
исходный порт, новые RowId/SalesAmount/SavedYearA и метки: audit PASS, 89/89 negatives.
Сохранён `/test-3/N13-dcb8e87c.lgp`. Свежая cef3cdde выполнила отдельную копию:
**4×27**, все 12 операций по двум датам, raw/config/values и strict persistence PASS,
8/8 negatives. Python 519 PASS; strict SDK schema 180 ответов без ошибок.
Обе live-сессии fix round закрыты, exit 0; сохранённый baseline оставлен без изменений.
Runtime dd0979bf… неизменен; изменены Python-аудитор/тесты и документы.
[Отчёт fix round](node-13-fix-1.md) содержит pins, evidence и configure extension contract.
R1/R2 остаются зависимостями общей части владельца 14; R2 — source/model finding,
новое live-падение Date/time не подтверждено. Общий код не интегрирован.
Следующие review/Hermes/admission — только по отдельной команде координатора.

## Состояние по завершении development — 13 сентября 2026

**Development и прямые проверки завершены; готов к отдельному ревью.**
Ветка `codex/node-13-date-time`. [Итоговый отчёт](node-13-development-report.md)
содержит актуальные результаты и ограничения. Ревью/Hermes/публикация не запускались.
Последний source runtime `dd0979bf175bd4164ab0d0647daecd69782b1c8ab0d10b2e690d313b9704b6d0`.
Последний сохранённый baseline `/test-3/N13-f7cf52c5.lgp`; fresh session
`6e3aa7ff-33ff-4fd6-893e-2cffdb0ee11a` выполнила его отдельную копию: public
SUCCEEDED, **0×7**, raw/config/values audit PASS, 9/9 negatives, strict persistence
PASS с input/output autosync=false. Все собственные live-сессии закрыты, exit0.
Клиент 1415 PASS / 1 SKIP, Python 511 PASS. Чужие `.gitignore`/`AGENTS.md` сохранены отдельно.
Следующее действие — только новый dispatch review; Hermes выдаёт координатор.

## История разработки

Ниже сохранены последовательные наблюдения, неудачные попытки и старые точки
возобновления. Указания «выполняется», номера PTY и незавершённые проверки ниже
относятся к моменту записи; текущее состояние приведено выше.

## Изоляция и источники

- Loginom 7.4.2, `http://logi-test-plan.bg.local/app/?testable=true`, test-3,
  подтверждённое хранилище `/test-3`.
- Node 24.19.0 из установленного release
  `0.1.0-dev.20260910.3-80ca61417ec7`; зависимости основной ветки только читались.
- Собственный `.dock/stream-runtime`, visible Chromium 153.0.8010.12,
  `--start-maximized`, viewport null, inner 1508×862, outer 1508×949.
- Source bridge / `dock_prepare`, новая фиксация исходников на каждом запуске.
  В metadata каждой диагностической сессии `archiveActive=false`.
  Отсутствие всех глобальных hook-процессов не проверялось.
- Использован проверенный immutable диагностический каталог
  `2026.09.11-parallel-pilot.1-candidate`, manifest SHA-256
  `4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`.
  Это не финальный candidate узла 13. Публикация не выполнялась.
- Прочитаны Help trans-datatime и E2E datetimereform.ts через Dock.
  OpenViking health был healthy; отсутствие отдельного worktree resource
  не интерпретировалось как недоступность памяти.

## Реализация и наблюдения

Добавлены тип `transform.date_time`, режим `calendar`, 12 преобразований,
native readback выбранной матрицы, процедура выбора полей/флагов и настройка
выходного соответствия. Поля адресуются по точному имени и native record ID.
Выходы связываются по исходному имени, native суффиксу, метке и типу;
позиция строки не устанавливает происхождение столбца.

Мастер хранит 29 строк матрицы: 19 обычных и 10 ISO. Список доступных полей
штатно фильтрует исходный store по DataType=2. Объект Functions — remote proxy;
он не вызывается. Для другого поля применяется обычный UI selection.

На сохранённом диагностическом примере счётчик Count=11 при 12 флагах.
Переключение поля не устраняет расхождение; снятие флага даты даёт Count=10
при 11 флагах. Счётчик сохраняется как наблюдение, отдельно вычисляется число
флагов. Свежая проверка 13 сентября дополнительно показала неизменившийся Count
при успешно включённом числовом Годе (7 флагов, Count=6). После мутации теперь
проверяется точное изменение всей матрицы только в целевой ячейке; итоговый
readback требует равенства числа generated outputs полному числу флагов матриц.
Точная временная семантика концов периодов ещё требует независимой проверки.

Две общие проблемы воспроизведены и исправлены:

- Скрытый overflow пункт входного порта при длинной метке: допускается только
  точная штатная подпись при независимо проверенной native привязке порта.
- Сокращённая многоточием метка после Done: допускается только её правильный
  префикс при точном native GUID/body и полном ключе метки в data-tid.

## Проверки и продолжение

До последних дополнений прошло 271 проверка workspace/node API/contracts.
Затем отдельно прошли расширенная проверка возврата из input-port wizard
(включая отказ на чужом body и неверном тексте) и 11 проверок date-time
contract/context/procedure. Это локальные проверки, не автономная приёмка.

Позднее выполнен полный клиентский набор (1396 тестов). Sandbox запретил
локальные сокеты: 9 failures и 1 cancellation. Все затронутые файлы отдельно
повторены с доступом к localhost, 14/14 прошли. После добавления проверок
штатного фильтра полей и effective input mapping прошло 13/13 date-time тестов.
Независимый Python oracle прошёл 3 теста с отрицательными вариантами вывода.

Сессия `9a0620d2-ed69-45b8-86b0-34e83ed256cb`, runtime
`e37cb2be312b6e9aae93831b6e5e23ac89981dd5440e1b1fcfb5368c8964b85e`,
прошла source/workflow/target/input_mapping/open/configure/node_finish/
output_mapping/finish/execute. `read` не завершён: его десятиминутный бюджет
истёк при восстановлении исходных форматов таблицы. Настройки/выполнение
подтверждены, успешный node.apply и аудит этой операции не заявляются.
Диалог закрыт через UI, диагностическая копия закрыта. Для дальнейшего
многостолбцового read установлен максимальный диагностический бюджет 30 минут.

Следующий исходный код также исправляет Close: входной mapping не открывается
и не применяется, draft не редактируется только ради его удаления. Существующий
effective input mapping теперь проверяется до Done; новый узел требует хотя бы
одно преобразование. Следующая проверка — 24 преобразования на двух полях с
одинаковой меткой, явным выходным порядком и исключением DateB, finish=done.

Текущая сессия разработки: `1dd124e1-ed41-4fe4-93e0-82620ad6d1c4`, runtime
`3b583af3cf55afa66cb4e48e18c17e99e57cc2abdc988c79ece7b90793bde055`.
Скопирован `/test-3/N13-1dd124e1.lgp`. До запуска нового узла Loginom
показал «Обнаружен разрыв связи»; выполнено штатное «Восстановить» и новый
prepare. Workflow ID изменился с `1789246038001-dsjstdk5dc-2` на
`1789246038001-dsjstdk5dc-3`; graph refs считаны заново.
Источник активирован вручную как подготовка фикстуры, его active schema
независимо проверяется beforeTarget. Это не заявляется как node.apply импорта.
Новый `node13-new-24` проходит обычный public node API.

`node13-new-24` остановился до первого флага: нетегированные
`img.x-grid-checkcolumn` отсутствовали в candidates наблюдателя. Добавлен
ограниченный селектор изображений только внутри DateReformWizard с прежней
проверкой native record/flag. Отдельный тест покрывает правильную строку,
подмену record ID, расхождение флага, дубликат изображения и чужой store.
После исправления весь workspace-ui набор прошёл 262/262.
Следующий live-запуск пока не прошёл preflight: повторный connect timeout
`loginom.duckdns.org:443`. Последняя версия флагов ещё не проверена вживую;
никакого успешного полного node.apply или принятого аудита пока нет.

## Блокировка продолжения — 13 сентября 2026, МСК

Исходники и проверяющие модули сохранены локальным WIP-коммитом `13884b5c`.
Два последовательных свежих preflight завершились `UND_ERR_CONNECT_TIMEOUT`
к `loginom.duckdns.org:443`. Независимый curl подтвердил TCP-соединение с
`82.22.23.10` за 0.020 секунды, затем TLS handshake timeout через 10 секунд
(HTTP 000). HTTPS Dock нужен для настоящего prepare и remote pinning;
кеш вместо него не подставлялся. Диагностика передана координатору.

Последние harness завершены. Продолжить после восстановления HTTPS:
запустить свежий `date-time-live.mjs` с теми же config/state/pins, дождаться
READY, затем `.dock/start-case.mjs`, `.dock/graph.mjs`,
`.dock/activate-source.mjs`, `.dock/apply-new.mjs`. При диалоге восстановления
сессии сначала штатно восстановить соединение, заново prepare и graph refs;
не повторять запуск вслепую. Новый запрос сейчас использует Done, все 24
преобразования, одинаковые входные метки, выходной порядок и исключение DateB.
После успешного Done нужен execute/read с достаточным бюджетом и независимый
аудит, затем оставшиеся случаи и persistence. Hermes по-прежнему не запускать
без отдельной выдачи координатора.

Fresh source harness: `tools/loginom-acceptance/date-time-live.mjs`.
Приватные команды и результаты находятся в `.dock/`; каждый запуск сохраняет
session metadata, remote pins, browser receipts и public node API evidence.
Фикстура `/test-3/Node13-20260912-diagnostic.lgp` с
`/test-3/Node13-dates.csv` копируется в уникальный `N13-<session>.lgp`.
При работе с копией проверяется отсутствие режима «только чтение».

Остаётся: полный успешный node.apply, все 12 преобразований на двух полях,
точные значения и null/empty, добавление/снятие, порядок/исключение,
done/close/recovery, независимое сохранение/reopen/reexecute, аудит и
финальные pins. Готовность и package persistence пока не заявляются.
VPS, установленный плагин, push, merge и ревью не изменялись/не запускались.

## Возобновление — 13 сентября 2026, МСК

OpenViking health healthy, настоящий Dock prepare/remote pinning снова прошёл.
Ветка продолжена с 3fd205cf. Сессия 55f13a4c-d3fa-4bbd-bb86-9a168abf9a7d,
runtime 90dfc6821ffc87808a1f5d303578fc5676201b7acbe23761cca208fbb37b0273,
Loginom 7.4.2/test-3, собственная копия /test-3/N13-55f13a4c.lgp.
Viewport null, inner 1508×862, outer 1508×949; archiveActive=false не доказывает
полную изоляцию глобальных hooks. Координатору отправлено подтверждение среды.

Новый node13-new-24 прошёл создание, input mapping и первые семь флагов.
Предыдущее исправление checkbox candidates подтверждено вживую. Configure
остановился на ожидании Count+1: числовой Год включён, но Count остался 6.
Повторного клика не было. Отдельное чтение primitive native cache подтвердило
это состояние. В новой реализации сравнивается полная ожидаемая матрица после
одного изменения, включая отсутствие побочных изменений и identity поля.
15/15 date-time тестов прошли, включая stale Count и collateral flag rejection.
Черновик закрыт через UI, неподтверждённые изменения собственной копии отброшены
через штатное «Не сохранять»; диалог исчез. Начат новый fresh source harness.
Полного успешного node.apply ещё нет.

Сессия 896e6ef3-e725-43e5-8c0a-cbeffedff213, runtime
`a1cc540c34c08fd9143dda207b65fdd375eec33264cc12d545df33fbc2ac4748`:
все 24 флага на двух полях прошли, configure/node_finish verified.
Output mapping остановлен после правильного исключения DateB: Loginom создал
служебную запись name=DateB/label=DateB при сохранённом exclusion_source
name=DateB/label=Дата. Общий драйвер раньше ошибочно требовал равенство меток.
Проверка уточнена по живому состоянию; полный source/owner/остальные записи
по-прежнему проверяются. В Date/time excluded запись сравнивается по сохранённому
source label, поскольку она не является выходным столбцом. Явное переименование
исключаемого источника запрещено. 38/38 профильных тестов прошли; после последней
проверки запрета переименования повторены 6/6 контрактных тестов.

При закрытии обнаружен новый разрыв Loginom WebSocket-сессии. Штатное
восстановление прошло, prepare вернул NOT_READY, поскольку остался открыт
выходной мастер. Сначала заново прочитан текущий UI, затем мастер закрыт с
подтверждением. Собственная копия закрыта через «Не сохранять»; диалог исчез.
Старые refs не использовались для продолжения операции. Запущен новый harness.
Это не автономная проверка recovery и не успешный node.apply.

Текущий fresh source harness: 6c827c79-cff8-4176-b2ba-e33aba775a12,
runtime `d2fcaea53e7474b14db50e9d942a28ba3f9359ea5b6e9836c62d0b1ebfe1cef6`,
копия `/test-3/N13-6c827c79.lgp`; source prepare/pins/build/geometry проверены.
Полный клиентский набор после исправлений: **1401 PASS / 1 SKIP / 0 FAIL**,
1402 теста, запуск с доступом к localhost, concurrency=1.
Лог: `.dock/client-tests-resume.log`. Полный node13-new-24 выполняется.

В 6c827c79 весь node13-new-24 дошёл до SUCCEEDED checkpoint: 24 флага,
28 записей mapping, 27 включённых выходов с заданным порядком, DateB исключён,
все фазы по finish verified. Независимый `date_time_audit.py` подтвердил raw
configuration (PASS). Однако MCP-клиент отверг финальный ответ: в
node-result-schema отсутствовала ветка date_time readback. Поэтому полный
публичный вызов не считается успешным. Ветка схемы добавлена; 7/7 schema tests
прошли, фактический сохранённый checkpoint валиден по исправленной схеме.

Чтобы сохранить уже настроенную диагностическую работу, после свежего графа
выполнен публичный package.save_checkpoint с replace только собственной копии
`/test-3/N13-6c827c79.lgp`: SUCCEEDED, save_completed=true,
persisted_content_verified=false. Затем пакет закрыт, диалогов нет, harness
закрыт. Новый fresh source harness должен открыть этот сохранённый пакет,
сделать новую собственную копию (`.dock/start-configured-case.mjs`), заново
прочитать граф, активировать fixture-source и выполнить
`.dock/execute-configured.mjs` (existing Календарь, parameters={}, полный exact
read до 30 минут). Это проверка сохранённых настроек, ещё не доказанная
package persistence. Исходная fixture сохранена отдельно и не изменялась.

Текущая сессия исполнения: `5f9483cd-5975-4ce1-97f3-68897afc3132`, runtime
`86ec04cdbbebefa50970059b5a29fd5adab8b37bfb1f568a20934173ba8eaba5`,
сохранённая конфигурация скопирована в `/test-3/N13-5f9483cd.lgp`.
Узел Календарь GUID `b95ac3b5-12ea-4f63-8537-a25f0ebff7a3` обнаружен в новом
графе с исходной связью. `node13-execute-24` (parameters={}, mappings=[])
прошёл configure/finish/execute и читает точный выход. Результат ещё ожидается.
Повторные API/schema tests: 13/13 PASS, `.dock/node-api-schema-resume.log`.
После завершения read запустить independent audit и negative checks для этой
операции; при успехе сопоставить readback с предыдущим сохранённым конфигом.
Нельзя заявлять успешный публичный вызов до получения его финального ответа.

`node13-execute-24` завершился публичным **SUCCEEDED**, cleanup_complete=true,
полный read 4×27, все 15 пустых стандартных форматов дат восстановлены,
возврат в сценарий подтверждён. Независимый audit PASS (configuration/raw_output/
values), **8/8 negative PASS**. CSV-адаптация независимого oracle исправлена:
его общий CSV parser принимает пробел, а не T между датой/временем; typed ISO
проверяется отдельно и правила сравнения значений не ослаблены. Все значения
12 преобразований на обоих полях и null подтверждены, конец периода — последний
календарный день в 00:00:00.000. Hermes не запускался.

Однако после reopening/Next исходные поля Id/DateA/Amount переместились после
вычисленных при autosync=true. Порядок исходного запроса **не сохранился**;
этот прогон не доказывает полную persistence. Добавлена защита: явный выходной
layout отключает autosync; fields+autosync=true отвергаются до изменений.
35/35 профильных тестов прошли, live-проверка новой защиты ещё нужна.
Собственная копия закрыта через штатное «Не сохранять» после завершения read,
диалог исчез, harness закрыт. Сохранённый базовый результат
`/test-3/N13-6c827c79.lgp` остаётся источником следующей копии.
Новый harness: start-configured-case → graph → activate-source → fix-layout.
После успешного node13-layout-fixed: независимый audit, save, отдельное reopening
и проверка сохранённого порядка вместе с точным read. Далее остальные случаи.

Сессия `fcccbde6-d697-465d-8b2c-603d7d51d037`, runtime
`f19e8e833228c9443cf50432523b0ea515de2b8cd6bb192d825140e0aa8d1bd7`:
node13-layout-fixed публично SUCCEEDED, independent configuration audit PASS,
порядок Id/Amount/24 преобразования/DateA восстановлен, DateB исключён,
autosync=false. Публичный node13-layout-save SUCCEEDED для
`/test-3/N13-fcccbde6.lgp`, пакет закрыт без диалогов.

Новое независимое открытие: сессия `a52fd065-7187-41e1-abe2-aeea4ff6f74f`,
тот же source runtime f19e8e..., `.dock/start-layout-case.mjs` открыла точный
сохранённый пакет и создала копию `/test-3/N13-a52fd065.lgp`. Граф считан заново,
GUID Календарь остался b95ac3b5-12ea-4f63-8537-a25f0ebff7a3. Выполняется
node13-execute-24 (parameters={}, mappings=[], полный exact read).
После успешного результата: date_time_audit.py, date_time_negative.py и новый
`date_time_persistence.py <fcccbde6-session> node13-layout-fixed <a52fd065-session>
node13-execute-24`. Последний сравнивает семантическую конфигурацию, публичные
ответы, save receipt и отдельное точное открытие исходного пакета.
На прежней паре 6c827c79→5f9483cd он уже отказал: saved_configuration_changed.

По отдельному запросу координатора выполнен MEMORY_ACCESS_CHECK: один адресный
find в общем root памяти (all только на этот запрос, limit=3, read_content=false),
затем read post_acceptance_fixes.md от 2026-09-10 внутри разрешённого root.
Доступ успешен. Локальный resolver подтвердил собственный workspace-derived
Peer -Users-kartamyshev-Git-loginom-dock--worktrees-node-13-date-time,
explicitPeerConfigured=false, workspacePeer=true. Настройки не менялись.
Координатору отправлен один запрошенный итог. Исторические инструкции о
промежуточных save/review не заменяют текущих. Изменение AGENTS.md координатором
о разрешённом чтении общей памяти сохранено как внешняя правка.

После независимого reopening в a52fd065 phase output_mapping подтвердил
сохранение autosync=false и порядка Id, Amount, A_date, A_month_end…;
execute прошёл, полный read продолжается. Полный клиентский набор на текущем
коде: **1403 PASS / 1 SKIP / 0 FAIL** (1404 теста),
`.dock/client-tests-layout.log`. Python oracle: 3/3 PASS.
Для пустого входа аудитор дополнен явным fixture=empty; стандартная fixture
boundaries остаётся неизменной. Новые приватные сценарии empty-fixture и
empty-date-new пока только подготовлены, не запускались.

В a52fd065 node13-execute-24 завершился публичным SUCCEEDED, все 15 форматов
восстановлены, возврат в сценарий подтверждён. Independent configuration/raw
output/values audit PASS (4×27); date_time_persistence.py fcccbde6→a52fd065 PASS:
реальное save/reopen/execute сохранило матрицы, имена, метки, типы, включение
и порядок полей, autosync=false. Это прямая source-диагностика, не Hermes.
Начата пустая fixture node13-empty-fixture в той же собственной копии; далее
empty-date-new, small-remove, small-add-reorder, small-close, small-preserve,
wrong-type и occupied-upstream. Скрипты подготовлены в .dock, ещё не проверены.

Отрицательные проверки node13-execute-24 в a52fd065: **8/8 PASS**;
лог .dock/layout-negative.log, базовые audit/persistence PASS сохранены в сессии.

В a52fd065 публичный node13-empty-fixture SUCCEEDED (0/4 строк), затем
публичный node13-empty-new SUCCEEDED: новый Пустой календарь, две даты с метками
Дата, year(DateA) и month_end(DateB), точный выход **0×6**. Independent
configuration/raw_output/values audit с --fixture empty: PASS. Начат small-remove.

Пустой прогон прошёл 9/9 отрицательных проверок. При node13-small-remove
выявлен дефект удаления: флаг DateA year снят, в inline mapping остаётся
переименованный SmallYear без source. Публичный результат AMBIGUOUS/configure,
output source missing. Native UI подтвердил orphan и штатное удаление его
colTargetDelete; ручная проба удалила только эту запись. Черновик закрыт без
применения, новое открытие показало исходные Count=1/1. Это не успех node.apply.

Исследование cached FWizardItems подтвердило: до изменения флагов source/target
stores выходной страницы пусты даже после Next→Done→Prev; скрытый cache не
даёт исходной связи. Исправление добавляет адресный preconfiguration-read
выходного порта только для существующего узла с fields: читает исходную биекцию,
закрывает порт через Close без применения; затем обычная настройка. Перед
переключением флагов план удаления связывает старую матрицу с native source и
устойчивым target field_id; удаляются лишь соответствующие orphan в inline
странице, остальные записи/источники проверяются целиком. Чтение нужно для
принадлежности будущего удаления, не для повторной проверки готовых настроек.
Пустые parameters и Close не получают этот дополнительный read.
Новый код ещё не проверен live; 21/21 профильных тестов прошли.

Во время закрытия была штатно восстановлена оборвавшаяся WebSocket-сессия;
после закрытия мастера заново prepare READY, workflow сменился -2→-3. Публичный
save был корректно заблокирован старым pending node13-small-remove. Для
сохранения диагностической fixture выполнен операторский UI SaveAs в отдельный
/test-3/N13-removal-fixture-a52fd065.lgp; это не public/persistence acceptance.
Пакет закрыт, диалогов нет, harness a52fd065 закрыт. Следующий fresh source
harness: start-removal-case → graph → small-preserve (baseline 6 полей) →
small-remove (новый код) → independent audit → small-add-reorder → Close cases.

Новая сессия 7b102cd5-d88f-45d8-9157-a9b24cfdbec8 (PTY 57475), runtime
dba4865ebebe0919850f6a1018faa928da4a37d6099dc71c1ee9eb3f7b3de676,
копия /test-3/N13-7b102cd5.lgp открыта из removal-fixture-a52fd065. Геометрия
1508×862/viewport=null, Loginom7.4.2/test-3, remote pins сверены fresh prepare.
small-baseline (parameters={}, Done) выполняется. Последующий порядок: audit →
small-remove → audit → small-add-reorder → audit → small-close → small-preserve
→ date_time_close.py → wrong-type (предварительно активировать fixture import)
→ occupied-upstream → loss-of-reply. Новый harness уже содержит armDateFlagReplyLoss.
Общий клиент: **1409 PASS / 1 SKIP / 0 FAIL** (1410 тестов),
.dock/client-tests-removal.log. Python oracle 3/3 PASS; старый полный 4×27
после дополнения независимого verifier по-прежнему PASS.
Закрытые harness оставляли Node-процессы без работы; принадлежность шести
процессов подтверждена по cwd, они завершены TERM после закрытия пакетов.

В 7b102cd5 small-baseline остановлен AMBIGUOUS/input_mapping до нового
preconfiguration-read: исходные import/filter после reopening не активированы.
Входной wizard видел неполную схему и на Done спросил об удалении потерянных
связей. Запрос отменён (Отмена), входной мастер закрыт с подтверждением,
пакет закрыт без диалогов, harness закрывается. Никакая связь не удалялась.
Следующая новая сессия обязана выполнить start-removal-case → graph →
activate-import-guarded → activate-empty-guarded → small-baseline. Это
исправление подготовки fixture, не успешная проверка новой логики удаления.

Текущая сессия f234b66c-d3d0-4d78-8b42-3d35cc923187 (PTY 90746),
runtime dba4865e… тот же; start-removal-case выполняется. Новый harness
после операторского close завершает процесс только после awaited bridge cleanup.
Профильные тесты дополнены preflight-before-any-flag и отказом без изменения
матрицы: **23/23 PASS**; общая проверка до этих двух тестов 1409 PASS/1 SKIP.

В f234b66c после ручной контролируемой активации import и filter исходный
node13-small-baseline публично SUCCEEDED; independent audit PASS. Обе
матрицы (year DateA/month_end DateB), все 6 связанных выходов сохранены.
Тем самым проблема прошлого запуска локализована в неактивной fixture.
Запущен node13-small-remove на исправленном runtime dba4865e; результат ожидается.

### Возобновление после перезапуска, 2026-09-13

Команда координатора node13-development-resume-shared-memory-20260913.3:
только development/direct UI; review, Hermes и публикация не запускались.
Зарегистрированный MCP подтвердил healthy и общий actor Peer основного проекта;
выполнены один targeted find и read, результат однократно передан координатору.
Маршрутизация и capture cursor не изменялись этой задачей.

f234b66c small-remove завершился AMBIGUOUS/open: `A prepared wizard is required
for cancellation` при Close предварительно прочитанного OUTPUT-порта, до правки
флагов. После перезапуска старый процесс отсутствовал; отдельный операторский
запуск его browser profile показал экран входа. Браузер закрыт, неоднозначный
receipt сохранён; восстановление прежнего draft не утверждается.

Добавлена проверяемая привязка Close выходного порта к native opening receipt,
точному port_context и исходному узлу. Возврат использует тот же breadcrumb path,
что существующий output-port Done. Независимый Python verifier расширен отдельно.
Профильные JS проверки: **271/271 PASS**, Python close evidence: **3/3 PASS**.
Полный клиент: **1413 PASS / 1 SKIP / 0 FAIL** (1414 тестов),
`.dock/client-tests-output-close-unrestricted.log`. Первая sandbox-попытка получила
listen EPERM в тестах локальных clipboard sockets; повтор с доступом прошёл.

Текущая live-сессия d2bde39d-f454-4857-ad3b-b696acfac089, runtime
`a8b38a21816d9dc42d52722b9ee49ac9b4998ff415683c84066c975d7041eecf`,
копия `/test-3/N13-d2bde39d.lgp`, Loginom 7.4.2 / test-3, viewport=null,
1508×862. Базовая fixture открыта, import и empty-filter активированы отдельно;
small-baseline выполняется. Успех live Close/output removal пока не установлен.

d2bde39d small-baseline: public SUCCEEDED, independent configuration audit PASS
(`.dock/d2-baseline-audit.log`). small-remove прошёл open, включая настоящий Close
исходного выходного порта без применения. Configure остановился AMBIGUOUS до
нажатия удаления: `Initial bound observation is no longer current or ready`.
Raw observation страницы содержал exact orphan delete cell, но node_mapping
отсутствовал: paging helper читает UI без native mappings. Исправление добавляет
fresh combined output page + native mapping и сравнение полных связей до жеста;
perform сохраняет этот режим для повторной проверки. Тест проверяет успех и
отказы при изменении чужого источника до/после удаления: **6/6 PASS**.
Мастер d2bde39d закрыт оператором с подтверждением без применения, собственная
копия закрывается без сохранения. Это не успешное завершение small-remove.
Следующий fresh runtime: start-removal-case → graph → guarded import/filter
activation → small-remove. Дополнительный baseline без параметров уже проверен
на неизменной fixture; перед новым удалением baseline вновь читается самим handler.

Fresh сессия 91422da2-86b3-443f-96cc-a88986eb4668 (PTY 72138), runtime
`f9af04091f4d30ed18dca9638ade7f1c0401195505db76ae93d47ecb66911f0d`;
копия `/test-3/N13-91422da2.lgp`, документ 1789262485623-hqfoz5xdphe,
workflow -2 / MF;TF-3. Подготовка guarded activation выполняется.
Предыдущий harness 14354 завершился exit 0 после закрытия пакета и bridge;
новый операторский shutdown больше не оставил idle process.
Полный клиент после paging fix: **1414 PASS / 1 SKIP / 0 FAIL** (1415 тестов),
`.dock/client-tests-orphan-paging.log`.

91422da2 small-remove (без baseline) остановился AMBIGUOUS/open:
`Fetching grouping sources changed the output definition`. Native Get source
columns изменил 5 исходных targets на 6, добавив Amount при autosync=true.
Имена/field IDs остальных пяти совпали. Строгий общий verifier не ослаблялся;
это отдельная граница неполной сохранённой fixture, ещё до изменения флагов.
Оператор отменяет OUTPUT wizard без применения и закрывает копию без сохранения.
Следующая сессия обязательно baseline → audit → public save отдельной копии →
small-remove; эту нормализованную копию затем использовать для повторов.
Пропуск baseline выше признан неверным для данной fixture, хотя input/filter
были активированы. Предыдущая d2bde39d всё ещё подтверждает live output Close;
новый paging fix пока не достигнут live.

Сессия e6677b8e-9b20-49d8-9278-d194767dba09 (PTY 80785), тот же runtime f9af0409…:
prepare-small-fixture → small-baseline public SUCCEEDED → independent audit PASS
`.dock/e6-baseline-audit.log` → реальный public package.save_checkpoint
`node13-small-fixture-save` SUCCEEDED в `/test-3/N13-e6677b8e.lgp`.
Сохранение без reopening, persisted_content_verified=false. Это новая полная
baseline fixture для дальнейших повторов; `.dock/start-stable-case.mjs` открывает
её и создаёт отдельную копию. В текущей сессии small-remove запущен после save.
Все 509 Python acceptance unit tests прошли (`.dock/python-acceptance-output-close.log`);
модели/Hermes не запускались.

e6677b8e small-remove дошёл до реального однократного удаления orphan SmallYear.
После удаления полное сравнение native mappings подтвердило: удалён только
SmallYear, остальные поля/источники неизменны с перенумерацией index/group_index;
единственный дополнительный эффект — autosync true→false. Поэтому прежняя
проверка корректно остановила configure AMBIGUOUS. Мастер отменён, пакет закрыт
без диалогов/сохранения, harness завершился exit0; сохранённая baseline e6677b8e
осталась исходной, дальнейшие удаления не сохранялись.

Исправление учитывает ровно штатный autosync=false непосредственно после delete,
сохраняя полное сравнение остальных свойств; configureDateTimeOutput затем
восстанавливает исходный autosync, если пользователь не задал иной output layout.
Независимый verifier проверяет и точный transition, и восстановление autosync.
Python отдельный тест: исходный transition и 7 отрицательных подмен проходят;
JS orphan suite 6/6 PASS. Live результата нового исправления пока нет.
Следующий fresh harness: prepare-stable-fixture (base `/test-3/N13-e6677b8e.lgp`)
→ small-remove → audit → small-add-reorder → Close/preserve → refusals → fault.

Текущая сессия 32e30eb6-620f-4d33-b3d6-1118774f8f02 (PTY 79697), runtime
`78b5938fd8d46d71f2030340c076a2f905929a55053a336a77f44d2f4a8889d4`;
prepare-stable-fixture завершился READY: `/test-3/N13-32e30eb6.lgp` создана из
сохранённой baseline e6677b8e, import/filter активированы, окно1508×862/viewportnull.
Документ1789263363009-ynvk8w85wx, workflow -2 / MF;TF-3. small-remove выполняется.
После последнего runtime fix: клиент **1414 PASS / 1 SKIP**, Python **510 PASS**,
`.dock/client-tests-removal-autosync.log`, `.dock/python-acceptance-removal-autosync.log`.

32e30eb6 small-remove остановился AMBIGUOUS/open на source fetch 5→6 даже после
public save baseline. Поэтому гипотеза о достаточности сохранения/нормализации
отозвана: baseline в той же сессии заполнял runtime cache, а не устранял условие
первого открытия. Отдельная операторская диагностика после close/reopen той же
копии (workflow сменился -2→-3, prefix MF;TF-5) подтвердила до Get source columns:
store.getCount=5, getTotalCount=5, loading=false, complete=true, limit=25,
pendingOperations={}, поля SmallYear/SmallMonthEnd/Id/DateA/DateB. Это не
обрезка журнала и не частично загруженный cache. Raw browser-68 также имел5,
после Get source columns browser-78 имел6 с добавленным Amount.

Добавлен Date/time-specific verifier источников: при исходном autosync=true
допускается только добавление точных сквозных копий native sources в конец при
полной неизменности прежних targets. Генерируемый/переименованный/унаследованный
новый столбец, изменение старого либо расширение autosync=false отклоняются.
Общий grouping verifier остался строгим; ensureGroupingOutputSources принимает
optional verifier, только Date/time baseline передаёт свой. До/после source fetch
сохраняются отдельным proof; Python независимо проверяет этот transition и
полную исходную bijection. JS focused10/10 PASS, Python2/2 (с отрицательными
подменами) PASS. Live нового verifier ещё не было.
Операторские open отказали без жеста при скрытом порте и reuse старого operationID
после переоткрытия; после fresh selection и нового ID exact port открылся.
Это отдельные диагностические действия, не успешный retry node.apply.

32e30eb6 operator cache wizard закрыт с подтверждением, пакет закрыт без диалогов,
harness exit0. Текущая новая сессия 1e796919-a7f3-4966-8339-b93a0f309734
(PTY59153), runtime `dd0979bf175bd4164ab0d0647daecd69782b1c8ab0d10b2e690d313b9704b6d0`.
prepare-stable-fixture выполняется. Полный клиент **1415 PASS / 1 SKIP**,
Python **511 PASS**; после добавления обязательных baseline verified/inventory/
source_identity flags отдельный Python removal suite2/2 PASS.
Дополнен date_time_negative.py для Done без output read (5 общих подмен), а для
existing parameters.fields — подмены исходных source bindings/Close application.
Persistence verifier получил --fixture empty для будущего восстановления после
контролируемой потери ответа; старый default boundaries сохранён. Live такого
восстановления и проверки fault ещё не было.

1e796919 `node13-small-remove`: **public SUCCEEDED**, независимый config/removal
аудит **PASS**, 7/7 negative mutations обнаружены (`.dock/1e-removal-audit.log`,
`.dock/1e-removal-negative.log`). Удалён SmallYear; сохранены SmallMonthEnd ←
DateB/month_end и Id/DateA/DateB/Amount, итоговые5 полей, autosync=true.
Проверены raw source fetch5→6 с точным append Amount, исходный OUTPUT Close без
применения, снятие только year DateA, exact orphan deletion и восстановление
autosync. Незапрошенная матрица DateB и StringFmt сохранены. Пакет после удаления
ещё не сохранялся; это не persistence/Hermes acceptance.
В той же сессии `node13-small-add-reorder` запущен: DateA year+month_start,
входной порядок Id/Amount/DateB/DateA, DateB не запрошен.

1e796919 `node13-small-add-reorder`: **public SUCCEEDED**, независимый аудит PASS,
9/9 negative checks (`.dock/1e-add-reorder-audit.log`, `...-negative.log`). Добавлены
DateA/year SmallYear и DateA/month_start SmallMonthStart; DateB/month_end сохранён,
выход7 полей. Входной порядок Id/Amount/DateB/DateA подтверждён raw mapping и
запросом. В independent verifier добавлена проверка входных names/labels/order и
явного autosync (а также явного output autosync); negative request-only order и
label mutations обнаружены. Ранее empty-new audit прошёл, теперь11/11 negatives.

Для Close → preserve выбран фиксированный output autosync=false, поскольку
штатная пересортировка generated/passthrough при autosync=true уже подтверждена
на большом кейсе и не должна смешиваться с доказательством отмены черновика.
`node13-small-freeze-output` (parameters={}, output autosync=false) выполняется.
Затем audit → small-close → small-preserve → date_time_close.py с before_id
node13-small-freeze-output → wrong-type → occupied-upstream → public save → fault.

1e796919 freeze-output public SUCCEEDED и audit PASS (`.dock/1e-freeze-audit.log`):
output autosync=false, семь полей и обе матрицы сохранены. `node13-small-close`
public SUCCEEDED с configuration.discarded, cleanup=true, без input/output mapping
и без выполнения. `node13-small-preserve` (parameters={}, mappings=[], Done)
выполняется; Close audit ещё ожидает этот результат.
Подготовлен независимый `date_time_refusals.py` для wrong-type/occupied-input:
требует public NOT_APPLIED, cleanup=true, effect=false и неизменный граф;
дополнительно проверяет реально наблюдённый integer-вход или чужую занятую связь.
Эти refusal cases пока не запускались live.

1e796919 small-preserve public SUCCEEDED. **Close audit PASS**, до/после полностью
совпали обе матрицы, input mapping/order и output mapping/order при autosync=false;
6/6 отрицательных подмен обнаружены (`.dock/1e-close-audit.log`, session
`date-time-close-negative.json`, script `.dock/check-close-negatives.py`).
`node13-wrong-type`: public NOT_APPLIED, cleanup=true/effect=false, native preview
подтвердил Id integer, новый узел не создан, граф неизменен; refusal audit PASS.
`node13-occupied-upstream`: public NOT_APPLIED, cleanup=true/effect=false,
исходная связь import→Календарь сохранена, filter→Календарь не создана; refusal
audit PASS. Замена занятого upstream этим контрактом не поддерживается.
Public save перед fault (`node13-small-fixture-save`) выполняется; будущая
recovery база — собственная `/test-3/N13-1e796919.lgp`, состояние7 полей.

1e796919 public save-before-fault SUCCEEDED в `/test-3/N13-1e796919.lgp`.
`node13-lost-flag` воспроизвёл запланированную потерю ответа: реальный click
DateB / func5 / DoNumber SUCCEEDED (internal `node13-lost-flag:n44`, raw
browser-968.json), но драйвер получил injected exception и public AMBIGUOUS/configure.
Матрица до/после повторов независимо прочитана: только quarter false→true,
month_end и остальные28 строк сохранены. Повтор SAME request вернул AMBIGUOUS,
resume отклонён `Resume requires the original inspected node checkpoint without
an unresolved phase`; browser sequence **969→969→969**, ни одного вызова UI.
`date_time_reply_loss.py` audit PASS. Это доказательство безопасного отказа от
повтора, **не automatic recovery**. Черновик ещё открыт; далее оператор Close
без применения → закрытие копии без сохранения → fresh prepare-fault-recovery
(base `/test-3/N13-1e796919.lgp`) → small-reopen-execute → empty audit + persistence
от `node13-small-preserve` этой сессии. Чужие/старые неоднозначные операции не
возобновлять. Текущая active PTY59153, source runtime dd0979bf… без новых client edits.

Fault audit дополнительно обнаружил6/6 подмен (`date-time-reply-loss-negative.json`).
Черновик отменён с native confirmation, пакет закрыт без диалогов; harness1e796919
завершился exit0. Fresh recovery сессия f7cf52c5-9dc4-41dd-a405-f4df805b9526
(PTY8174), тот же source runtime dd0979bf…; exact base-open сохранённого
`/test-3/N13-1e796919.lgp`, отдельная копия `/test-3/N13-f7cf52c5.lgp`,
prepare READY, import/filter активированы. Документ1789266042473-y75nouzh2ha,
workflow -2 / MF;TF-3. `node13-small-reopen-execute` (parameters={}, mappings=[],
execute/read port0 exact) выполняется. Последний незакрытый live-check — audit
пустого результата7 столбцов и independent persistence1e→f7. После него закрыть
копию/браузер, финализировать docs и локальный commit, один phase outcome
координатору. Review/Hermes/публикация остаются отдельным dispatch.

### Уточнение persistence после fault — 13 сентября 2026

f7cf52c5 `node13-small-reopen-execute` public SUCCEEDED, точный выход **0×7**;
raw/config/value audit PASS, 9/9 negatives. Сохранённые преобразования и весь
output mapping совпали, quarter из отменённого fault draft отсутствует. Строгий
persistence audit **FAIL: saved_configuration_changed**: только порядок входа
при input autosync=true изменился с Id/Amount/DateB/DateA на Id/DateB/DateA/Amount.
Это не полный persistence PASS. Проверяется явно фиксированный input autosync=false
(`node13-small-freeze-input`), затем отдельный save/reopen/execute без настройки.
Логи `.dock/f7-reopen-audit.log`, `.dock/f7-reopen-negative.log`; строгий отказ
сохранён в f7 session `date-time-persistence.json`. Финальные Python unit tests
511 PASS (`.dock/python-acceptance-date-final.log`).

f7cf52c5 `node13-small-freeze-input` public SUCCEEDED/config audit PASS,
input autosync=false; public save `node13-small-fixture-save` SUCCEEDED в
`/test-3/N13-f7cf52c5.lgp`. Пакет закрыт без диалогов, harness exit0.
Свежая сессия `6e3aa7ff-33ff-4fd6-893e-2cffdb0ee11a`, source runtime dd0979bf…
не менялся; READY, viewport=null/1508×862. Base-open f7, собственная копия
`/test-3/N13-6e3aa7ff.lgp`. Persistence сравнивать с f7 `node13-small-freeze-input`,
не со старым baseline с input autosync=true.

### Завершение development-фазы — 13 сентября 2026

6e3aa7ff `node13-small-reopen-execute` public SUCCEEDED, 0×7; независимые
raw/config/value audit и 9/9 negatives PASS. Strict persistence f7
`node13-small-freeze-input` → 6e `node13-small-reopen-execute` PASS: совпали
матрицы, input/output mappings и порядок с autosync=false. Исходный FAIL
1e→f7 при input autosync=true не удалён и не переобозначен как успех.
Копия закрыта без сохранения диагностических изменений, диалогов не осталось,
harness exit0. Runtime не менялся после полного клиентского прогона.
Финальная передача: локальный коммит этой фазы; отдельный review по запросу,
затем coordinator-owned Hermes acceptance/candidate admission. Push/merge,
VPS/build/deploy и глобальные плагины не затрагивались.
