# Общий runtime и стандартные узлы в node-javascript: заключение

Дата исследования: 2026-10-15. Проверенный HEAD: `a00e00eb72ba901adcef47bb1c520b7674a4f2da`.
База изменений: `origin/loginom`, `38ee045e79720d363a35666484f17804162b55a1`.

## Главный вывод

**Массовый откат общего кода не обоснован.** Большая часть доработок устраняет
конкретные отказы портов, мастеров, таблиц и исполнения. Некоторые находятся в
«чужом» файле, но нужны JavaScript: общая фабрика в `calculator-node.mjs` и
предварительное чтение JS перед стандартными Group/Sort — именно такие случаи.

Доказанных новых ошибок настройки чужого узла в рассмотренной дельте не найдено.
Однако обещать «никак не ухудшит агента» для всех условий нельзя. В частности,
новое обязательное закрытие сохранённого пакета защищает данные, но после отказа
может оставить CLI с заблокированным профилем без повторного штатного close.
Новые лимиты ответа иногда уменьшают число preview-строк либо явно отказывают
в доставке. Это существенные изменения доступности, а не ошибки вычислений.

Две доработки нужны только внутренним проверкам (`onTableRead`,
`onContextCreated`), ещё одна (`urlSource`) сейчас является необязательной
метаданной. Их не следует представлять как обязательные исправления аналитики.

## Как исследовалось

- Выполнен успешный `git fetch origin --prune`; обновлений сервер не сообщил.
  Исследованы **132 origin refs**, без символического `origin/HEAD`.
- Для **55 изменённых файлов** общего production-кода построен полный реестр
  origin-версий: blob, ветки, коммиты данной ветки и независимая история origin.
  См. [снимок origin](shared-runtime-origin-snapshot-2026-10-15.json).
  В него входят runtime lib/src, Host src, standalone-run и специальное
  исключение `javascript-output-preview.mjs`, обслуживающее стандартные узлы.
- Проверены все hunks этих файлов относительно базы. Варианты других веток
  сопоставлялись по конкретной функции/условию, а не по возрасту branch tip.
  В реестре 331 коммит, достижимый из origin, но не из HEAD/базы, затрагивает
  выбранные пути. Это **не 331 независимое улучшение**: есть повторные переносы,
  экспериментальные private capture и изменения иных участков тех же файлов.
- Отдельно проверены изменённые pins, зависимости и пути сборки. Внутренности
  собственных `javascript-*` обработчиков, кроме downstream preview, не являются
  предметом этого отчёта. Их интеграционные границы проверены в общем коде.
  Eval-аудитор, UI приложения и планы выбора узлов также не являются доработками
  настройки портов/узлов и здесь повторно не рецензировались.
- Три независимых прохода охватывали порты/UI, стандартные обработчики и
  исполнение/выдачу; отдельно проверены API, Host и сквозное закрытие пакета.
- Выполнен новый source-level прогон **25 адресных test-файлов** под закреплённым
  Node 24.19.0: exit 0, 1183 успешных отметки dot-reporter, без ошибок.
  Это tests реализации и сериализованных UI-fixtures, **не live Loginom**.
  Команда и точная область приведены ниже.
- Production-код не менялся. Runtime/Host совпадают с `4ca0a4b07f`; более новые
  коммиты переносили документацию/fixtures. Прежние 363 Host PASS / 7 SKIP и
  typecheck относятся к проверенному ранее этому же production-коду; они не
  выдаются за новый запуск в рамках исследования.

### История, которую важно не перепутать

После rebase фактическая база — `38ee045e79`. `faaf775315` сохраняет исправления
совместимости с новой базой; [rebase checkpoint](rebase-checkpoint.md) описывает
315 перенесённых коммитов. Author date сентября и commit date октября — следствие
rebase, а не два разных появления одного исправления.

`d445c8ea65` временно откатил часть стандартных обработчиков и общий UI;
`d3cd4e46f9` восстановил разрешённые изменения из среза `15e2f43c5d`.
Сам `15e2f43c5d` — документационный коммит. Восстановление не означает новую
реализацию. `variant-native-read.mjs` остался базовым и не входит в новую дельту.

`origin/javascript@399bb8b589` содержит большой исторический архив, но активные
migrated runtime-файлы там во многих местах старее базы. Это не независимая
вторая реализация нынешних JS-исправлений. `origin/node-javascript@ed9e7be083`
содержит те же production blob, что проверенный HEAD; это также не независимое
подтверждение. Полные SHA всех refs зафиксированы в JSON.

### Как читать оценки

«Безопасна» означает: в проверенных ветках исполнения не найден механизм порчи
чужих настроек, потери данных или ложного подтверждения успеха. Это не гарантия
от всех будущих изменений private UI Loginom. Высокая уверенность опирается на
код, отрицательные тесты и, где доступно, привязанный live evidence. Средняя
означает неполный живой охват либо значимое ограничение доступности.

Проверочные задания собраны отдельно: [сценарии агента](shared-runtime-agent-scenarios-2026-10-15.md).
Их наличие не означает, что они выполнены. Условия воспроизведения принципиальны:
успешный экспорт с видимым портом не проверяет исправление перекрытого порта.

## Порты, mapping и мастера

### C01. Ожидание disabled-маски `colTargetDelete`

Код: `node-port-open.mjs:73`, `node-mapping-context.mjs:37`.
История: `9cf987d2ae`, `cbabbd5f32`; исторические source117/118.

- **Нужна:** да. Ext оставляет пустую маску над отключённой колонкой удаления;
  прежнее ожидание её исчезновения не завершалось. Исправлены оба независимых
  чтения: открытие порта и чтение самого mapping.
- **Безопасность:** высокая. Игнорируется только точная пустая `.x-mask`,
  native-owned disabled control, единственный нужный wizard/FView. Загрузочная,
  чужая, дублирующаяся маска или диалог по-прежнему блокируют действие.
- **Другие ветки:** альтернативного исправления этих функций нет; отличаются
  преимущественно старые версии. Отсутствие исправления не делает старую логику
  предпочтительной.
- **Уверенность:** высокая. В архивном checkpoint строки 10542–10609 сохранены
  фактические до/после отказы reader. Тесты: `node-port-open`, `node-mapping-context`.
- **Проверять:** S04; обязательна фактическая именно disabled-маска. Отдельно
  повторять старый live на неизменном runtime ради количества прогонов не нужно.

### C02. Пустой выход и configured-only схема

Код: `node-mapping-context.mjs:169,249`. Коммиты `710231dd2d`, `cce6586b90`.

- **Нужна:** да. До первого выполнения JS обе схемы могут быть пустыми; после
  настройки target-поля уже существуют, а materialized source ещё отсутствует.
- **Безопасность:** высокая. Пустота допустима только для нужного DataSet с
  одновременно пустыми source/target stores. Настроенные поля без source дают
  `verified:false`, `configured_inventory_verified:true`; взаимное соответствие
  и выполненный результат из этого не выводятся.
- **Другие ветки:** другого решения этого состояния не обнаружено.
- **Уверенность:** высокая по разграничению доказательств; изменения private
  caches в иной версии Loginom могут дать безопасный отказ.
- **Проверять:** S04. Положительное чтение configured schema не заменяет Execute.

### C03. DataSet output wizard в общей процедуре mapping

Код: `port-mapping-procedure.mjs:6,143`, `workspace-ui.mjs:282`.
Коммиты `d55473634e`, `c23027a18e`.

- **Нужна:** да. Native reader уже знал DataSet, но общая настройка не умела
  применять его autosync/reorder; открытый editor portal также терял stage owner.
- **Безопасность:** высокая. Добавлена известная форма, сохранены уникальность
  control, wizard root, native record identity, membership и readback после
  действия. Независимый stage guard не разрешает произвольный editor.
- **Другие ветки:** свежей альтернативы нет. Старые release blobs не содержат
  поддержку этого wizard.
- **Уверенность:** высокая; `port-mapping-procedure.test.mjs` проверяет reorder,
  autosync, заменённый control, foreign graph и неожиданный schema drift.
- **Проверять:** S04, включая Save/reopen и фактический порядок полей.

### C04. Чтение input mapping за своим редактором колонки

Код: `node-mapping-context.mjs:3,45`, `node-procedure.mjs:281,473,584,641`.
Коммит `5664b6bf04`.

- **Нужна:** да для узкого J19 исправления technical Name входного поля JS.
- **Безопасность:** высокая. Binding содержит original opening, port GUID и
  record ID; проверяется единственный modal native editor input0, selected
  record/store/view. Перед действием сравнивается полный mapping.
- **Другие ветки:** альтернативы именно такого чтения нет.
- **Уверенность:** высокая в узкой области. Это не общее разрешение читать и
  менять mapping за любым открытым editor.
- **Проверять:** S05 с операторской подготовкой; обычный output rename сюда не
  относится. Отрицательные owner/record/selection guards покрываются fixtures.

### C05. Ожидание порта/мастера в пределах исходного deadline

Код: `node-procedure.mjs:250,575`, `workspace-ui.mjs:64,95,3884,4191`.
Коммиты `93284cfe24`, `33ee6cfcea`, `570ecf0d04`.

- **Нужна:** да. Открытие мастера может занять больше локальных 15/20/45 секунд.
  Уже отправленное открытие нужно дождаться, а не повторять.
- **Безопасность:** высокая для данных; медленный отказ теперь может ждать
  дольше. Общий deadline не продлевается, жест не повторяется. Маски допустимы
  только у исходного wizard; Import preview имеет точный root/tid/stage.
- **Другие ветки:** `12a123aedf` (Calculator), `340f3ca2e6` (Grouping),
  `ad86a0db37` (Sorting), `f0acefc333` (cleanup-binding-fix) решают другую часть
  тех же opening checks — изменение пути после Save As. `7400936417` на
  `origin/agent/agent/ff4d542985bc` применяет remaining budget к Table filter.
  Эти решения не опровергают ожидание, но выявляют непокрытые соседние случаи.
- **Уверенность:** высокая в необходимости; средняя в охвате всех вариантов UI.
- **Проверять:** S10. Отдельно фиксировать медленное открытие и Save As/rekey.

### C06. SVG redraw при соединении узлов

Код: `node-target-browser.mjs:286,438`; `samePlacementGraph` в `node-placement.mjs`.
Коммиты `7e2b49c701`, `93bab97d92`, `cd63d125fe`.

- **Нужна:** да. Loginom заменяет SVG, не меняя сам граф; полное JSON equality
  ошибочно принимало это за изменение узла.
- **Безопасность:** высокая. Comparator исключает только `node.dom_epoch`,
  сохраняет остальные поля nodes/ports/links. До link жеста повторно читаются
  native endpoints и проверяется граф, включая состояние после hover.
- **Другие ветки:** независимые changes target-browser относятся к navigation,
  сохранённым пакетам и private captures; другого ослабления этого сравнения нет.
- **Уверенность:** высокая.
- **Проверять:** S02/S03, точные GUID концов связей. Отрицательный graph drift
  нужно подтверждать тестом, а не одним успешным построением.

### C07. Скрытые breadcrumbs выходного порта, Join и Export

Код: `workspace-ui.mjs:657,766`. Коммиты `c2c898aca5`, `05b645eec9`, `41101ae0b2`.

- **Нужна:** да. В overflow скрываются DataSet output caption, Join input0
  «Главная таблица»/input1 «Присоединяемая таблица» и Export «Источник данных».
- **Безопасность:** высокая. Нужен ранее native-bound port opening, точный
  index/caption и ancestry. Для Join требуется его native icon. Разрешено
  прочитать известную подпись, а не нажать скрытый control.
- **Другие ветки:** Sorting (`e3a06b9753`, `ab5baaf1c7`) и replacement-admission
  (`6f1cdacf70`) разрешают также hidden folder «Входные порты» — другой crumb.
  `union-recheck` (`4efff8c96a`, `6616c271ca`) умеет Close/Done вообще без
  breadcrumb, по original opening и verified native context. `39a4cc5de7`
  Join отдельно доказывает cancel owner. Их подход шире в своих условиях,
  но не заменяет роли Join/Export и не доказывает ошибку текущей реализации.
- **Уверенность:** высокая в узких captions; общий overflow покрыт не полностью.
  Прямых изменений `join-*.mjs` нет. Ordinary Join live не доказывает hidden DOM:
  его result честно говорит `no new hidden DOM capture`.
- **Проверять:** S02/S03/S04; actual hidden caption обязателен для такого вывода.

### C08. Перекрытый вход Export после Link

Код: `text-export-node.mjs:51–90`. Коммиты `a8db3e0f4c`, `c5930ed689`.

- **Нужна:** да. После Link вход оказывался ниже viewport; после прокрутки мог
  остаться перекрывающий tooltip. Выбор своей видимой label снимает перекрытие.
- **Безопасность:** высокая для воспроизведённой геометрии. Только свой graph,
  один input, `bottom>viewport.height`, один scroll до 1000 и, при необходимости,
  hit-tested label своего узла. Затем работает прежний строгий opener.
- **Другие ветки:** аналога post-Link reveal/own-label шага не найдено.
- **Уверенность:** высокая в этом случае, не универсальная для любой геометрии.
  Canvas-only clipping, верхнее/горизонтальное clipping, отсутствие безопасного
  anchor или оставшийся cover дадут отказ. На runtime `659588af…` есть настоящий
  локальный no-model PASS с bottom804>800, scroll0→82, CSV27B, Save/logout.
- **Проверять:** S03. Уже существующий итоговый live достаточен для его исходного
  runtime; без нового изменения повтор не нужен.

## Таблицы и стандартные обработчики

### C09. Ожидание появления Table card после одного Add

Код: `node-output-context.mjs:53`, `node-output-procedure.mjs:87`,
`node-procedure.mjs:492`. Коммиты `00a73b060d`, `a5f126e30d`.

- **Нужна:** да. Native descriptor появляется раньше DOM card; старый reader
  преждевременно объявлял binding неверным.
- **Безопасность:** высокая. Pending — не verified. Ожидается только один свой
  descriptor/port под своей Views mask, без второго Add. Foreign card/owner либо
  deadline дают отказ.
- **Другие ветки:** альтернативы такого settlement нет. Offscreen scroll в
  row-filter-sdk — соседняя проблема, см. L01 ниже.
- **Уверенность:** высокая. Исторический source `ba46d2ecda`/rebased `a5f126e30d`
  наблюдал четыре pending samples→card, один Add; это архивный live, не новый HEAD.
- **Проверять:** S04/S06. Нужен trace Add и descriptor/card, не только CSV.

### C10. Внутренний `openViews` hook

Код: `node-output-procedure.mjs:51–80`. Коммиты `ea04e1b26f`, `625a151946`.

- **Нужна:** да. Generic UI запрещает JS controls; собственный JS driver
  открывает Views своей capability и затем использует общую Table procedure.
- **Безопасность:** высокая при нынешних callers. Hook не является public
  параметром; до/после него обязательны active output и точный native owner/panel.
- **Другие ветки:** иной реализации этого hook нет; scroll-патч row-filter-sdk
  не решает admission JS graph.
- **Уверенность:** высокая в интеграционной границе, с зависимостью от private UI.
- **Проверять:** S04/S06. Несколько JS outputs не поддержаны публичным контрактом;
  не следует придумывать для данного smoke неподдерживаемую многопортовую задачу.

### C11. Group/Sort после JS и `javascript-output-preview.mjs`

Код: `grouping-preflight.mjs:18`, `sorting-preflight.mjs:28`,
`node-procedure.mjs:185`, `javascript-output-preview.mjs`.
Коммиты `dd8d480706`, `3a33edcae8`, отмена/восстановление выше.

- **Нужна:** да. Это чтение upstream перед **стандартными Group/Sort**, а не
  настройка собственного JS. Generic script deny иначе запрещал preflight.
- **Безопасность:** высокая, но реализация сложная. Нужен latest succeeded
  managed JS, те же document/workflow/node/GUID/output0/execution. Retained schema
  служит эталоном, читается полная схема заново открытого native preview;
  строки результата здесь не читаются и Execute не выполняется.
  Source/schema/socket не меняются.
  Select/F3 журналируются отдельно; unknown ACK не повторяется. Допустим лишь
  один доказанный detached redraw после своего успешного select.
- **Другие ветки:** конкурирующего managed JS preview нет; большинство preflight
  blobs базовые. Удаление helper действительно ломало эту композицию.
- **Уверенность:** высокая для Group/Sort/output0. Calculator/Union, foreign JS
  и JS без managed history этим helper не поддержаны.
- **Проверять:** S06. Реальный локальный no-model PASS есть на `21fcca85…`;
  это не новая функциональная аттестация всей итоговой модельной серии.

### C12. «Изменение Calculator» — capability общей фабрики full UI output

Код: `calculator-node.mjs:48,312`, `node-apply.mjs:70`. Коммит `6853b39769`.

- **Нужна:** да для полного ограниченного UI-чтения JS. Файл содержит общую
  фабрику; собственная аналитическая логика Calculator не расширялась.
- **Безопасность:** высокая. Требуются type JS, установленная `fullUiOutput`,
  output0, Execute, 100 sample rows и exact numbers. Реальная неполнота даёт отказ.
  Native full reader Collapse/CrossTable сохранён, обычный Calculator capability
  не получает. UI-full не выдаётся за доказательство native bytes.
- **Другие ветки:** recheck-calculator/calculator-check сохраняют native-only
  путь. Private FP draft capture `8136bada1b` в том же factory — иной режим, не
  альтернативное fullUI-решение. Старые release blobs также не эталон.
- **Уверенность:** высокая.
- **Проверять:** S07 с 100/101 строкой. Не повторять аналитический prompt лишь
  ради внутренней capability, если детерминированный boundary test уже достаточен.

### C13. Refresh формата Import только после точного no-effect refusal

Код: `text-import-procedure.mjs:291–309,447`. Коммит `8d5a2fbb13`.

- **Нужна:** да. Preview/parse mask меняет UI epoch между наблюдением и записью;
  старый ref уже нельзя применять.
- **Безопасность:** высокая. Refresh допускается после NOT_APPLIED/no-effect/
  cleanup-complete, с теми же node/root/field owner/tid/value и settings.
  Неизвестный эффект не повторяется; число refresh ограничено двумя.
- **Другие ветки:** helper отсутствует; там прежний прямой set. Другого алгоритма
  безопасного исправления той же гонки не найдено.
- **Уверенность:** высокая по адресности, средняя по охвату естественных UI-гонок.
- **Проверять:** S01; без фактического epoch refusal это только smoke Import.
  Owner/settings drift лучше проверять имеющимися отрицательными тестами.

### C14. Native picker для `date_format` Import

Код: `text-import-procedure.mjs:427–447`. Коммит `263df96201`.

- **Нужна:** да. Validator разрешал параметр, но writer трактовал combo как
  текстовое поле. Теперь выбирается точная native option.
- **Безопасность:** высокая. Существующий bound picker механизм, exact value,
  owner/root/input и readback; нет fallback в чужое поле.
- **Другие ветки:** обычно picker есть для `date_separator`/NULL, но не для
  `date_format`. Это неполнота прежнего writer, не другая успешная реализация.
- **Уверенность:** высокая. Локальный `date-format-native-2` проверил
  `yyyy/mm/dd`, slash, две ненулевые даты и Save/logout.
- **Проверять:** S01. Этот тест не доказывает сохранение миллисекунд/timezone.

### C15. `onTableRead` в Import

Код: `text-import-node.mjs:101,252`. Коммит `443559b532`.

- **Нужна:** внутренней приёмке civil DateTime, **не ordinary Import**. Callback
  сохраняет raw evidence, нужное для независимого datetime oracle.
- **Безопасность:** высокая. Optional private callback; единственный caller —
  `tools/loginom-acceptance/javascript-native-input-driver.mjs`, civil-datetime.
  Продуктовый агент не передаёт его. Ошибка callback может прервать внутреннюю
  проверку после чтения, что не меняет обычный путь.
- **Другие ветки:** Import preconfig/private opening captures решают другие
  задачи и не заменяют этот callback.
- **Уверенность:** высокая.
- **Проверять:** новый модельный прогон не нужен. O01: существующий civil oracle
  с NULL, leap day и миллисекундами. Ordinary Import не подтверждает callback.

## Общий UI, исполнение и выдача

### C16. Имя файла со словом `javascript` — данные, не code editor

Код: `workspace-ui.mjs:458–470`. Коммит `7526370158`.

- **Нужна:** да, иначе `javascript-sales.csv` запрещался как опасный control.
- **Безопасность:** высокая. Только readonly native storage cell с exact
  label/tid/unique grid; editable, name/id, links и secret checks сохранены.
- **Другие ветки:** конкурирующего исключения нет.
- **Уверенность:** высокая; отрицательные forged/editable случаи есть в tests.
- **Проверять:** S01/S11; стандартный pipeline не должен уходить в JS из-за имени.

### C17. Generic JS deny по native типу вместо редактируемого имени

Код: `workspace-ui.mjs:484–595,2917`. Коммиты `37545781a0`, `78974f383a`.

- **Нужна:** да. JS с названием «Итог» обходил lexical guard.
- **Безопасность:** высокая для поддержанного UI. Проверяются native model/icon/
  ports и собственные `FItems`, не inherited getter. Generic body/Setting/Views
  и порты JS остаются запрещены. Неизвестная структура даёт безопасный отказ,
  что может уменьшить доступность на неподдержанной версии Loginom.
- **Другие ветки:** альтернативного native classifier нет.
- **Уверенность:** высокая по нужности/адресности, средняя по future UI compatibility.
- **Проверять:** S09 как typed API smoke; O02 для настоящего generic deny.
  В `user-v1` generic tools нет, модельный успех сам по себе deny не доказывает.

### C18. Консоль и названия процессов

Код: `workspace-ui.mjs:199,347,471–479,1969`,
`node-process-context.mjs:14,49`, `process-node-focus.mjs:17,60`.
Коммиты `31dd47c70f`, `86629ae615`.

- **Нужна:** да. Pinned/unpinned консоль имеет два точных namespace; caption
  процесса «JavaScript» является данными и не должен включать editor deny.
- **Безопасность:** высокая. Панель/Ext store должны быть единственными и
  native-bound. Исключение caption не отменяет editable/name/id/secret checks.
- **Другие ветки:** обычные старые blobs знают один namespace. Другого нового
  решения в этой функции нет.
- **Уверенность:** высокая для двух наблюдённых namespace; не универсальный UI.
- **Проверять:** S08 с двумя режимами консоли, объединяя caption-вариант с ним.
  Базовый variant-reader всё ещё знает один namespace: отдельное L04 ниже.

### C19. Сначала controls консоли, затем native history; epoch после cache read

Код: `node-procedure.mjs:338,371,458`, `node-execution-procedure.mjs:10,79,123`.
Коммиты `948ff2e4c2`, `1673b5e5eb`, `2e7f67c172`, `00e84aa626`, `f050e9c567`.

- **Нужна:** да для всех узлов. Закрытая консоль ещё не имеет готового inventory,
  а чтение native cache может перерисовать UI и обесценить предыдущий epoch.
- **Безопасность:** высокая. Controls-read не объявляет подтверждённую историю;
  owner проверяется до/после native read. Перед запуском/Stop inventory свежий.
- **Другие ветки:** `origin/row-filter-sdk` делает readiness локальной для
  исходной console/grid (`aa8381577b`) и даёт до60s initial observation
  (`13b861258e`). У нас ещё возможны false refusal от общего `dom_epoch`/15s.
  Это унаследованная строгость, а не ошибка нового bootstrap.
- **Уверенность:** высокая в исправлении bootstrap, средняя в устойчивости
  к медленному журналу/непрерывным перерисовкам.
- **Проверять:** S08; races/IO budgets — O03, а не случайная модельная нагрузка.

### C20. Подтверждение своей JS-ошибки и продолжение ожидания

Код: `node-execution-evidence.mjs:77`, `node-execution-procedure.mjs:259`,
`node-operation-runner.mjs:36,74`, `node-result-schema.mjs:20`.
Коммиты `34737f2e45`, `b0d11eec19`, `e267252490`.

- **Нужна:** да. Ошибка upstream не равна ошибке самого JS; короткое wait/локальная
  пауза не разрешает повторный Execute.
- **Безопасность:** высокая. JS-only флаги по умолчанию выключены; JS caller
  включает их явно. Resume привязан к исходным execution/root/group/record/
  native owner. Добавление materialization phase в Stop не расширяет его на
  произвольный running process.
- **Другие ветки:** точных новых опций нет; старые runner без уже базовых
  safeguards — не пригодная замена.
- **Уверенность:** высокая в границах, с обычной version sensitivity native UI.
- **Проверять:** S08 и S12; abort/identity подмены — O03.

### C21. Typed Stop по свежему native ticket

Код: `node-process-control.mjs`, `node-procedure.mjs:553–672`,
`node-execution-procedure.mjs:234`. Коммиты `06491a541d`, `9bc8f711ea`.

- **Нужна:** да. Обновляющийся процесс делает общий snapshot устаревшим между
  наблюдением и кликом; нужен адресный свежий ticket.
- **Безопасность:** высокая по проверенным guards. Original document/workflow/
  native node, store/root/group/child, selection/menu, geometry/hit-test, epoch
  и object identity должны совпасть. Ticket записан до жеста. Lost reply остаётся
  ambiguous, повторного cancel нет; click success ещё не terminal cancellation.
- **Другие ветки:** typed module есть только у node-javascript; прежний путь
  не является альтернативным решением этой гонки.
- **Уверенность:** высокая для адресности, средняя для всех native error modes.
- **Проверять:** S08 только на конечном контролируемом вычислении; O03 для
  owner/ABA/lost reply. Чужие параллельные сессии создавать не нужно.

### C22. Новые materialization phases и особая семантика JS Done

Код: `node-apply.mjs:129–144,174,298–418`, `node-contracts.d.ts:46`.
Коммиты `b0d11eec19`, `40b7340427`; opt-in full-read `6853b39769`.

- **Нужна:** да. Для code-generated выхода сначала нужно материализовать схему,
  затем настроить output mapping и выполнить итоговый расчёт. Done не даёт
  честного знания о внутренней работе Loginom; теперь это `null`, не ложное false.
- **Безопасность:** высокая в интеграционной границе. Materialize разрешён только
  JS с separate output и явным Execute; final execution ID обязан отличаться.
  Done/Close не запускают этот путь. Обычные узлы сохраняют прежнюю последовательность
  и свои требования к Done. Refusal требует независимого JS-specific proof.
- **Другие ветки:** private Import opening/capture изменения того же apply-shell
  (`674fa5e70e`, `14cae669df`) решают другой режим; не замена JS phases.
- **Уверенность:** высокая. `node-apply.test.mjs` проверяет порядок, lost reply,
  cancellation, reused ID, выключенный materialize у других типов, Done/Close.
- **Проверять:** S04/S09. Нельзя требовать один Execute от JS режима, который
  по контракту выполняет отдельную materialization и итоговое исполнение.

### C23. Source/context read, source-bound reread и общий redactor

Код: `node-read-contract.mjs:9–108`, `node-read-driver.mjs:15–111`,
`node-support.mjs:25`, `user-workflow.mjs:28`, `executor.mjs:1809,2558`,
`execution-journal.mjs:8`, JS wiring `bridge.mjs`.
Коммиты `c8c2442b40`, `4291bbe223`, `34114660f2`, `a9e9bf8ebd`, `faaf775315`.

- **Нужна:** да. Совпадающая output schema не доказывает неизменность кода.
  Повторное исполнение JS связано с source SHA/bytes/lines, settings и mapping;
  чтение source/context имеет отдельный owned lifecycle без Execute.
- **Безопасность:** высокая на общей границе. Ветвление строго по JS/kind,
  source/context registry удерживает неурегулированный Close. Обычные reread и
  базовая CrossTable dynamic schema сохранены. Shared redactor дополняет прежний
  default, не открывает source в общие diagnostics.
- **Другие ветки:** `crosstable-status`/`documented-node-plans` содержат прежний
  Sliding read (`321ea7adfc`); требуемый смысл уже присутствует в базе и сохранён
  здесь. `javascript`/`package-docs` ещё старее. Конкурирующего source-bound
  JS дизайна в этих путях не найдено.
- **Уверенность:** высокая для изоляции стандартных узлов; средняя/высокая для
  полной JS цепочки без нового live текущего HEAD.
- **Проверять:** S09, со старой и новой квитанцией при той же output schema.

### C24. Каталог, API schema и `oneOf`/`const`

Код: `action-catalog.mjs:413`, `node-api.mjs:44–199`,
`node-contracts.mjs:21,86`, `node-contracts.d.ts`, `node-support.mjs`.
Коммиты `ac4f9dfd82`, `fae9543d15`, `2bf7d41c9b`, `4291bbe223`.

- **Нужна:** да. Регистрация JS, пять типов declared columns и три вида read
  должны быть доступны без смешивания с CrossTable `columns` и обычным output-read.
- **Безопасность:** высокая для текущих consumers. Локальный validator проверяет
  ровно одну допустимую форму и const type; отдельный envelope-validator запрещает
  JS mode/fields у других узлов и разделяет два смысла `columns`. Полноценные
  handler validators остаются обязательными до mutation. Это не универсальный
  JSON Schema engine; его нельзя без нового аудита использовать для любых схем.
- **Другие ветки:** calculator-check (`27ad30809a`, `e7f3461c9d`) улучшает описание
  request/finish, union-recheck (`f1921fd212`) — preserve-native prefixes. Это
  независимые параметры других узлов, а не иной способ различать JS/CrossTable.
- **Уверенность:** высокая по проверенному контракту; future schema reuse отдельно.
- **Проверять:** O04: существующий test сверяет публичную AJV schema и настоящий
  dispatch для CrossTable/JS и запрещённых смешений. Дополнительный модельный
  прогон ради schema branches не нужен; S04/S09 дают обычный smoke.

### C25. Итоговый MCP budget и сокращение preview целыми строками

Код: `user-response-budget.mjs`, `node-result-reply.mjs:8`,
`user-preview-budget.mjs`, `user-results.mjs:53`, wrapper `bridge.mjs`.
Коммиты `4aa9eed408`, `faaf775315`.

- **Нужна:** да для всех узлов. Нужно учитывать escaped text, structured copy,
  advice и ограничения в настоящем итоговом envelope, иначе backend режет ответ.
- **Безопасность:** высокая для смысла данных, **с изменением доступности**.
  Ordinary sample уменьшается целыми строками, precision/NULL/0/row_count и
  receipts сохраняются; incomplete пересчитывается. Full/native/JS source/schema
  не обрезаются молча: при превышении лимита возвращается delivery refusal.
  Состоявшаяся mutation не объявляется NOT_APPLIED из-за отказа доставки.
- **Другие ветки:** аналога final-envelope проверки нет; старые compact wrappers
  не имеют этого доказательства размера.
- **Уверенность:** высокая. Агент может получить меньше запрошенных строк или
  явный отказ для широкой схемы — это нужно считать известным tradeoff.
- **Проверять:** S11; точные boundaries/escaping/full refusal — O04.

### C26. Readiness файлового хранилища перед Refresh/download

Код: `artifact-discovery.mjs`. Коммиты `b84f14e939`, `8b63a3b6a5`.

- **Нужна:** да. Старые Refresh+250ms читали ещё pending/zero-size/cache-loading
  файл или преждевременно считали папку пустой.
- **Безопасность:** высокая. Same document/tab/card/directory/store/view,
  complete cache для пустоты, load generation после единственного Refresh и
  исходный 55s deadline. Foreign/replaced store отказывает, unknown Refresh/
  download не повторяется.
- **Другие ветки:** нового competing readiness алгоритма в этих функциях нет.
- **Уверенность:** высокая в guards; средняя в переносимости private store
  counters на другие версии Loginom.
- **Проверять:** S11/S03; фактическая загрузка должна быть в trace для race-вывода.

### C27. Исходный deadline вложенного Save

Код: `executor.mjs:1459,2462`. Коммит `c729220447`.

- **Нужна:** да для bounded persistence: preflight/evidence уже потратили часть
  родительского бюджета, нельзя выдать mutation новый полный интервал.
- **Безопасность:** высокая. `deadlineAt` private/optional; без него старый путь.
  Проверяются допустимый потолок и exact retry identity; deadline не продлевается.
- **Другие ветки:** альтернативы этого parent-deadline hunk нет; другие Save As
  changes касаются native reopening/custody (`26f2ec7e29`, `ab71f6737f`), не времени.
- **Уверенность:** высокая.
- **Проверять:** O05 (`action-parent-deadline.test.mjs`). Модель не управляет
  private ceiling; prompt «сохрани быстрее» не проверяет это изменение.

### C28. Download diagnostics и запрет page-provided WebMCP

Код: `executor.mjs:188,276`, `session.mjs:76`. Коммиты `237fb7e4cf`,
`b84f14e939`, `7526370158`.

- **Нужна:** diagnostics полезна, `webmcp:false` сохраняет фиксированный каталог
  browser tools после обновления MCP. Это не новая аналитическая возможность.
- **Безопасность:** высокая. Фиксированные bounded flags без сырых URL/errors;
  download state machine, authenticated context и proxy policy не меняются.
- **Другие ветки:** session blobs обычно старее; `81908659bd` на chromium-direct
  меняет proxy, не WebMCP. Отличия не доказывают избыточность этой настройки.
- **Уверенность:** высокая по изоляции, средняя по native launcher всех платформ.
- **Проверять:** download объединить с S03/S11; catalog/config — O04.

## Host, CLI и завершение сессии

### C29. Сквозные transport timeouts для source/context read

Код: runtime `src/call-timeout.mjs`, `managed-entry.mjs:231`;
Host `adapter.ts:85`, `host-port.ts:421`. Коммит `5415bc87b1`.

- **Нужна:** да. Reader допускает 300/600 секунд и до1800s budget, тогда как
  прежние MCP105s/IPC120s/adapter180s прерывали его раньше собственного deadline.
- **Безопасность:** высокая. Обычные tools сохраняют прежние пределы; source/
  context получают ограниченные transport allowances. Cursor не продлевает
  deadline reader. Зависший child теперь может дольше ждать outer timeout.
- **Другие ветки:** такого согласования бюджетов в этих местах нет.
- **Уверенность:** высокая. Настоящий adapter под Node проверен timer-тестом
  source310s/context610s/max1810s/ordinary181s с управляемым временем.
- **Проверять:** O05; 30-минутный модельный wait ради timeout не нужен.

### C30. Последний собственный Save как основание CLI cleanup

Код: `bridge.mjs:348–399,483–549`, CLI `standalone-run.ts:65`, Host
`node-client.ts:115`, `host.ts`, `node-entry.ts`, `start-input.mjs:22`.
Коммиты `1e481585dd`, `09eb287605`, усиление `5415bc87b1`.

- **Нужна:** да для ordinary CLI и локальных eval, независимо от JS. Закрытый
  браузер сам по себе не доказывает серверные package Close/logout.
- **Безопасность данных:** высокая. Private policy только standalone run;
  оригинальный admission sequence связывает action/path/document/receipt.
  Старый replay/inspect не перебивает более поздний Save. Native cleanup повторно
  сверяет local origin/build/account/document/tab, один собственный пакет,
  точный path, отсутствие running/dirty/dialogs. Save/discard/Stop не выполняются.
- **Доступность:** ограничена. При отсутствии Save, dirty/unsettled состоянии,
  ошибке evidence или Close возвращается failure, сохраняется guard. Кэшированный
  `closing`/`shutdownStarted` не допускает штатное исправление и второй close в
  том же экземпляре. Это **не безусловное улучшение** обычного CLI: безопасный
  отказ может потребовать адресного recovery. Расширение normal policy, в отличие
  от самого native cleanup helper, является изменением этой ветки.
- **Другие ветки:** `row-filter-sdk:45eeeb4776` обновляет latest любым старым
  successful receipt; текущая sequence-реализация здесь **правильнее**, заменять
  её упрощённым tracker нельзя. `0714407a18` у agent/ff4d… дожидается исходных
  jobs перед cleanup; `3f7ab67753` разрешает ограниченный Save после pre-effect
  refusal. cleanup-binding-fix (`1824937de8`, `de93e239cb`, `886e1d25b3`) имеет
  иной guarded retry/custody контракт. Это полезные направления, не готовая
  безопасная замена всей реализации.
- **Уверенность:** высокая в адресности/latest sequence и факте ограничения;
  средняя в полноте аварийного recovery. Положительный локальный Save/Close/logout
  на `659588af…` есть; он не покрывает все failure combinations.
- **Проверять:** S03 плюс O06. Вывод «нужна, оставить, но отдельно улучшать
  восстановление после отказа», а не «завершение теперь всегда успешно».

### C31. Проверка resource close ACK и фактического exit

Код: `managed-resources-close.mjs`, `managed-entry.mjs:33–70`, Host
`supervisor.ts:218`, `node-client.ts:115`, sticky flags `host.ts`.
Коммиты `59e6119e44`, `38b6ec9821`, `762371da92`, `f28df036d3`.

- **Нужна:** да. Fulfilled bridge.close с retained browser/clipboard раньше мог
  превратиться в ложный cleanup ACK с удалением recovery profile. Incomplete IPC
  frame также задерживал disconnect после уже отправленного terminal reply.
- **Безопасность:** высокая. Нужны true transport/process close и zero retained
  leases; snapshot accepted requests сделан до await, close не ждёт себя.
  После flush используется тот же checked stop. Supervisor всё ещё требует
  ACK **и** clean actual exit, kill не становится PASS. Sticky failure не теряется
  после успешного нового runtime. Фиксированная 0600 telemetry — не logout proof.
- **Другие ветки:** `ade5b6c532` agent/069… даёт общий close20s вместо наших5s
  обычного runtime/45s saved-policy; `fa3cd331cc` сохраняет original failed-start
  owner. Их другая модель recovery не отменяет нужность строгого ACK.
- **Уверенность:** высокая для проверенных process cases, средняя для всех
  аварийных сочетаний native/browser/IO. Ошибка завершения остаётся видимой.
- **Проверять:** O06 (real Node IPC/partial-frame/false-ACK tests), happy path S03.
  Модель не должна специально повреждать IPC.

### C32. Headed/headless preflight CLI

Код: `node-entry.ts:103`, `host.ts:18,86`. Коммит `098ab67508`.

- **Нужна:** самостоятельное полезное CLI исправление. Раньше validation была
  всегда headless даже при явно выбранном headed.
- **Безопасность:** высокая. Private CLI boolean; Desktop сохраняет свой default,
  Help readiness не создаёт browser. Явный headed теперь действительно видим.
- **Другие ветки:** в том же call site сохраняют старый validation||headless,
  другой реализации honoring explicit mode нет.
- **Уверенность:** высокая по routing; platform GUI отдельно.
- **Проверять:** O07; аналитический модельный prompt здесь не нужен.

### C33. `onContextCreated` для headed focus guard

Код: `connection-check.mjs:50,94,106`. Коммит `89e06cb6c9`.

- **Нужна:** внутренней headed JS acceptance, **не обычному агенту**. Guard
  ставится до первого navigation на том же authenticated context.
- **Безопасность:** высокая при нынешнем единственном acceptance caller.
  Callback optional, managed product его не задаёт; ошибка ведёт в cleanup и
  понятный `LOGINOM_FOCUS_SETUP_FAILED`.
- **Другие ветки:** такого hook нет, их обычный login не является иной его версией.
- **Уверенность:** высокая по изоляции, средняя по платформенной работе guard.
- **Проверять:** O07; ordinary аналитическая задача callback не активирует.

### C34. Private `urlSource: explicit`

Код: `connection-service.ts:165,273`, `connection-store.ts:12,124,141,184`.
Коммит `4f38373e17`.

- **Нужна:** для текущего JS поведения **нет**; допустимая provenance metadata
  для будущих миграций. По фактическому коду и базовая версия восстанавливает
  сохранённый URL напрямую. Marker сейчас не выбирает destination.
- **Безопасность:** высокая. Optional schema для старых records, private поле
  не попадает в публичный View, credentials/history не переписываются.
- **Другие ветки:** marker отсутствует, но они также сохраняют explicit URL.
  Нельзя утверждать, что без marker локальный URL обязательно подменялся.
- **Уверенность:** высокая. Тест наличия marker не равен тесту исправления routing.
- **Проверять:** O07 setup/restart/status/actual prepare; повтор модели только
  ради metadata не нужен. Оставить допустимо, критической зависимостью не считать.

## Сопутствующие изменения

### C35. Закреплённый Chromium/MCP, parser и сборочные пути

Код: `client/package.json`, lock, `product/loginom-release.json`, Chromium notices,
Host `script/build-cli.ts`, `native-resource-candidates.ts`,
`desktop/electron-builder.config.ts`, `.github/workflows/loginom-windows.yml`.
Основной коммит `237fb7e4cf`; parser policy `f1502889ac`.

- **Нужна:** да для согласованной сборки. Chromium1243→1246/MCP0.0.80→0.0.82
  был ответом на Linux download crashes; Acorn нужен статической JS source policy.
  Версия Chromium в chmod/licensing/CI берётся из единого pin вместо устаревшего
  hardcode. Это шире JS и способно влиять на все browser nodes.
- **Безопасность:** обоснованная, но не абсолютная. Версии/hashes/notices/paths
  согласованы; sandbox не отключён, download не зависит от install-on-start.
  Обновление browser само по себе имеет платформенный риск. Native candidates
  прямо помечены как build inventory, а не Windows/macOS acceptance.
- **Другие ветки:** большинство содержит прежний pin; это не альтернативное
  исправление Linux crash. Наличие старой версии не доказывает её надёжность.
- **Уверенность:** высокая в согласованности pins; средняя в полной native
  переносимости. Linux evidence нельзя переносить на Windows/macOS.
- **Проверять:** S03/S11 на Linux плюс штатные native packaging/GUI gates при
  выпуске. Для Acorn/конфигов — существующие unit/build tests, не новый LLM prompt.

### C36. Bounded diagnostics отказов

Код: diagnostics в `node-port-open`, `node-mapping-context`, `node-procedure`,
`node-target-browser`, `workspace-ui`, download/close telemetry выше.
Коммиты `4fef323aa8`, `0a384d9fca`, `f641db2dd0`, `582881c931`, `7e2b49c701`.

- **Нужна:** да для объяснимого расследования; это не новая функция узла.
- **Безопасность:** высокая. Bounded failure-only факты не создают usable refs,
  не превращают отказ в verified mapping. Diagnostic IO закрытия отдельно не
  сертифицирует успех и не должен смешиваться с обязательным cleanup evidence.
- **Другие ветки:** `7aafad5485`, `d04a64c797`, `bfac3013c2` добавляют scan/RPC
  timing; `7d604676f5` сохраняет journal failure и локализует durable ACK phases.
  Это дополняющая диагностика тех же функций, не альтернативный способ настроить
  порт. Полезна только с учётом исходного failure/IO контракта.
- **Уверенность:** высокая в отсутствии новых action permissions.
- **Проверять:** O03/O04 на принудительном отказе; отдельный успешный модельный
  прогон диагностику отказа не исполняет и не нужен.

## Что осталось и что действительно дают другие ветки

### L01. Прокрутка offscreen Table cards

`node-output-procedure.mjs:35–38` требует viewer-card anchor с `scroll`, а
`workspace-ui.mjs:2921` выдаёт viewerControl только `click/enter_table`.
На `origin/row-filter-sdk` `fe194a9d7c` добавляет именно недостающий scroll.
Это содержательно обоснованное решение **унаследованного** ограничения.
Нужно отдельно перенести/адаптировать с guards, а не откатывать C09/C10.
Проверка S13 нужна при таком исправлении. Не использовать неподдержанный JS
multi-output: достаточно много Table cards на одном стандартном output.

### L02. Save As и изменение canonical navigation path

Opening checks текущей ветки могут безопасно отказаться после rekey. Другие
ветки имеют native canonical-path/alias proof. Они не делают произвольное
игнорирование breadcrumb безопасным: переносить нужно с proof producer,
проверками сохранённого документа и native owner. S10 — адресная проверка.

### L03. DOM redraw и медленный durable journal

`consoleMenuIdentity` всё ещё включает общий `dom_epoch`; некоторые read stages
имеют локальные15s. `aa8381577b`, `13b861258e`, `1680595c00` row-filter-sdk и
`446e3e6507` union-recheck предлагают соответственно scoped identity, бюджеты
observations и различение времени sample/ACK. Они выглядят полезными, но
увеличивать все таймауты без measured timestamps не следует. O03/S08.

### L04. Базовый native variant-reader и pinned console

`variant-native-read.mjs` намеренно остался на `38ee045e79` после частичного
восстановления. Он ищет только `ConsoleForm;…`, тогда как C18 поддерживает и
`MF;ConsoleForm;…`. Поэтому не вся native full-read цепочка автоматически получила
новую совместимость. Это известный остаток текущей композиции, не новая правка
этого файла; успешный JS UI-full его не проверяет. S14 адресно проверяет native
Collapse/CrossTable с pinned console; переносить JS UI-full туда нельзя.

### L05. Восстановление после cleanup refusal

Данные защищены, но C30 не восстанавливает текущий экземпляр после pre-effect
отказа. Для будущего исправления полезны идеи drain-original-jobs и guarded
retry из origin, а не упрощённый latest-save tracker. Подтверждать отсутствие
эффекта, прежнего owner и uncertain Close обязательно. O06.

## Как пользоваться сценариями

Нет основания запускать все сценарии заново прямо сейчас: production не менялся,
часть случаев уже имеет привязанный live evidence. S03 — уже доказанный локальный
Export gate на runtime `659588af…`; S06 — прежний локальный downstream gate на
`21fcca85…`. Новое исполнение оправдано изменением соответствующего кода/runtime
либо явным пробелом доказательств. S10/S13/S14 полезны для адресной проверки
остаточных ограничений. Отсутствие фактической гонки/overflow обозначать
`NOT_REPRODUCED`, а не PASS ветви исправления.

Модельные сценарии не заменяют проверку private callback, timer routing, IPC,
ABA, exact schema boundary и отрицательных guards. Для них в отдельном файле
выделены O01–O07: правильный ответ в ряде случаев — **модель не нужна**.

## Проверки и воспроизводимость исследования

Новый test-run выполнен из `packages/loginom-runtime/client` закреплённым
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/node-v24.19.0-linux-x64/bin/node`:

```sh
node --test --test-reporter=dot \
  test/node-port-open.test.mjs test/node-mapping-context.test.mjs \
  test/port-mapping-procedure.test.mjs test/node-output-context.test.mjs \
  test/node-output-settlement.test.mjs test/node-output-procedure.test.mjs \
  test/node-procedure.test.mjs test/node-target-runtime.test.mjs \
  test/process-node-focus.test.mjs test/workspace-ui.test.mjs \
  test/workspace-script-guard.test.mjs test/artifact-discovery.test.mjs \
  test/javascript-output-preview.test.mjs test/text-export-input-reveal.test.mjs \
  test/text-import-format-recovery.test.mjs test/text-import-wide.test.mjs \
  test/node-api.test.mjs test/node-apply.test.mjs test/node-read.test.mjs \
  test/node-execution-evidence.test.mjs test/node-execution-stop.test.mjs \
  test/node-process-control.test.mjs test/user-preview-budget.test.mjs \
  test/user-response-budget.test.mjs test/user-results.test.mjs
```

Exit0; dot output1183, `X`0; skips/todos в выбранных tests не объявлены.
Локальный журнал: `/tmp/node-javascript-shared-audit-tests.log`.
Исторические Host/typecheck/source-suite результаты повторно не запускались.
Новый live, модельная серия, сборка/установка, merge/push не выполнялись.

Проверены существующие реальные локальные results:

- `evals/results/node-selection-local/20261014T112452Z-5e223f/native-export-input-reveal-minimal-proof/run/result.json`:
  source `fdc4ac455e`, runtime `659588af…`, no model, clipping/CSV/save/cleanup/
  explicit logout/shutdown подтверждены.
- `evals/results/node-selection-local/20261014T064745Z-367f4b/native-js-downstream-proof/run/result.json`:
  source `c5930ed689`, runtime `21fcca85…`, JS→Group/Sort→Export, cleanup/logout.
- `evals/results/node-selection-local/20261014T050544Z-2085d7/native-join-proof/run/result.json`:
  обе роли и сохранённые данные/граф подтверждены; hidden DOM заново не снят.

Подробности: [локальный отчёт](../../../testing/loginom-ai-agent/reports/2026-10-13-node-selection-local.md)
и [архив исходного обучения](../../history/programming-javascript/origin-javascript-399bb8b589/checkpoint.md).
Прежние стендовые результаты остаются историческими. Политическая приёмка skill,
математика и надёжность runtime — независимые оценки; этот отчёт их не объединяет.

## Решение по области изменений

Оставить исправления портов/мастеров, таблиц, Import/Export и связок JS→Group/Sort.
Не откатывать общий код по признаку «файл не называется javascript». Вынести
ограничения L01–L05 в адресные follow-up, если соответствующие задачи нужны
пользователям. Для C30 и C35 сохранять явную оговорку о доступности/платформах.
C15/C33 считать test infrastructure, C34 — необязательной private metadata.
Новых production-изменений это исследование не вносит.
