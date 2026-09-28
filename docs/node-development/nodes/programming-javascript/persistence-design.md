# JavaScript: сохранение последней редакции и холодное открытие

## Актуальный итог private G7 — 2026-09-29

Новые headed writer/cold/byte-reader тройки для `code` и `declared` дали
`dirty_state_verified=true` и `package_bytes_verified=true` для одних и тех же
двух сохранённых пакетов. Независимые SHA и пределы доказательства приведены в
[checkpoint](checkpoint.md). Публичный обработчик и CLI-приёмка всё ещё открыты.

## Состояние после независимого byte audit — 2026-09-29

Для обоих режимов завершены отдельные private writer/cold пары и read-only
получение точных байтов сохранённого `.lgp`. Воспроизводимый независимый аудитор
`javascript_package_byte_audit.py` связывает ZIP/XML с принятым writer/cold audit,
не передавая expected в cold reader и не запуская новый Execute. Подтверждённые
SHA и границы доказательства перечислены в [checkpoint](checkpoint.md).
Child source `945f75baf0` теперь читает `IsPackageModified` сразу после
каждого Save с проверкой прежнего владельца и журналом; аудитор проверяет два
согласованных ответа. Это пока source-only: старые пакеты не получают
`dirty_state_verified` задним числом, нужны новые headed writer/cold пары.
Публичная реализация G7 также остаётся открытой.

Source99, 2026-09-28. Части G7/J20 согласованного plan.md; base runtime
beaf849091830e3adb77a53cb88ca2f0c9e4a98c. Полный план/public/CLI остаются в силе.

## Решение

Две отдельные операторские сессии на каждый schema mode: writer и cold reader.
Обе headed, sandbox enabled, Ubuntu DISPLAY=:1, pinned Node/Chromium. Первый
профиль115 свободен; следующие выдаёт ROOT последовательно после cleanup.
Один браузер одновременно. Для writer общий immutable deadline1800000ms,
для cold reader600000ms с самого начала процесса; каждый фазовый timeout
обрезается оставшимся временем. Не использовать defaultInfinity старого
operator и не продлевать deadline после ожидания. Cleanup имеет отдельный
bounded budget и подтверждённую authority, не разрешает новое вычисление.
Writer полностью завершается с close/logout/browser
close, ROOT проверяет terminal и отсутствие процесса, затем запускает reader
в новом пустом профиле. Reopen в том же контексте может сохранить caches; только
ZIP/XML inspection не доказывает исполнение. Поэтому эти варианты не заменяют
выбранную проверку. Никаких новых калибровок ошибок/K5 и публичных маршрутов.

Отдельные fixed code/declared cases, по6строк и2столбца ObservedID/PhaseMarker
на уже проверенном CSV RowID. Подготовить две неизменяемые программы S1/S2:
S1 — существующий table-v1; S2 сохраняет schema/типы, меняет PhaseMarker на
фиксированный новый sentinel и содержит Unicode/LF/XML-special characters
в комментарии/строковом литерале. Полный текст, UTF8/lines/SHA, expected6x2 и
metadata зафиксировать до live. Source98 policy должна допустить оба.
Read oracle проверяет точные значения и типы, порядок/полноту, а не только preview.
Не выполнять код fixture в Node для получения expected.

Writer: create/import/connect, configure выбранный mode, exactS1 readback,
свежий owned Execute/output, save_checkpoint в новый уникальный .lgp.
Затем exact owned reopen, замена S1→S2 с проверкой прежнего digest и сохранением
наблюдённых settings/mappings, Done, свежий S2 Execute/output, повторный checkpoint
того же принадлежащего попытке файла. В первый раз conflict_policy:fail;
replace разрешён только после доказанного первого save в тот же owned path.
Другие файлы/пакеты не заменять. Каждому эффекту новый ID/identity и original
phase deadline; unknown effect не повторять. Финальный snapshot обоих mappings,
source/mode/columns/graph и save/dirty-state receipts сохранить отдельно.

Cold reader принимает только exact owned package path и техническое назначение;
никаких source_text/expected columns/настройки/CSV upload либо source factory
в его исполняющем пути. Открыть .lgp через workspace prepare/open_package,
наблюдать новый document/workflow/graph, обнаружить свои import и JS узлы по
наблюдённым уникальным native identities/type (не индексу/координатам). Полностью
прочесть JS через production source97 reader, закрыть wizard, проверить source98
policy; наблюдать settings и оба mappings. Перед Execute повторно проверить
actual source digest и принадлежность; Execute новый, с независимым process
baseline/terminal proof. Вычитать фактическую полную6x2таблицу без перенастройки
узла. Ожидаемые S2/source/settings из writer/fixture использует только независимый
host auditor после наблюдения; они не поступают в configuration драйвер cold reader.
Наблюдённый unsupported source/foreign package/identity drift — отказ до Execute.

Аудитор сравнивает writer-final и cold-read full source/SHA без trim/CRLF
исправлений; actual mode/declared metadata, semantic mappings/graph, typed6x2
и свежесть исполнения. Document ID и browser handles между процессами новые;
не требовать равенства временных IDs и не заменять ими устойчивую package/node
идентичность. Вставленные ошибки source,mode,mapping,type,value,order,count,
execution identity/truncation обязаны давать FAIL. Cold read не должен использовать
S1 вместо последней редакции; независимый expectedS2 исключает старый output cache.

## Повторное использование и границы изменения

package.save_checkpoint реализован createActionRuntime/capability-registry:
использовать существующий effect/receipt механизм, ограничить private action
allowed_roots своим /jsteach/js-g2-UUID, не менять глобальный catalog. Имя пакета
уникально для попытки. После save использовать verified workflow_continuations
и заново наблюдать graph: SaveAs меняет navigation labels/tids. Не подставлять
старый prefix и не отключать сравнения package identity ради продолжения.

makeWorkspacePrepareCode open_package использовать с фактическим Linux
compatibility profile, не historical macOS helpers. package-reopen-qa.mjs —
источник наблюдений порядка close/open; его fixed15s и сохранённый контекст
не заменяют отдельный fresh cold reader и original deadline.

createJavascriptExecutionRuntime сейчас требует prepared.package_ref.persisted=false.
Не удалить этот guard. Добавить отдельный private saved-package binding/constructor
либо явный строгий режим с account/origin/build/path/document/workflow checks.
Cold path не получает prepareInput/create/connect/configure/source-mutation authority.
Выделять reusable read/execute части там, где это уменьшает дублирование, сохраняя
старые admission/ownership/cleanup контракты и source98 политики. Source/metadata
чтения не делают нового Execute/Done. Settings generated schema не угадывать.

Save/file artifact hash хранить отдельно от decoded-source hash. Если доступен
штатный owned file download, получить .lgp через него, записать bytes/SHA, проверить
ZIP/XML read-only отдельным аудитором. Не вводить server RPC/HTTP shortcut.
Если download пока не подтверждён, честно оставить package-byte hash/inspection
открытыми; нельзя подменять hash .lgp хешем отчёта или кода.

Cleanup writer/reader закрывает только подтверждённый свой пакет, выходит из
jsteach и закрывает собственный браузер. Failure/timeout/foreign state сохраняются
с original effect/cleanup uncertainty; не запускать второй writer вместо
неподтверждённого первого. Saved package/CSV сохраняются как evidence; не удалять.

## Реализация и приёмка этапа

Разработчик реализует private writer/reader/independent oracle и fixture manifest,
тестирует настоящие host/builder функции с synthetic UI transport и fault injection.
Public tools/общая готовность JS не меняются. ROOT отдельно проверяет freeze,
dependency closure (Acorn production dependency), тесты/guards, затем запускает
по одному headed writer/reader на mode. До live ROOT фиксирует exact source hashes,
свежие profiles/evidence paths и допустимые эффекты. Исторические RUNNING/FAIL
не перезаписывать. Smoke tests одного helper не закрывают G7 целиком.

Baseline для следующего manifest — private javascript-freeze98-root-final-source.json
(SHA4bf45dc25ab84999f411996b16622472d216fbaab37918ed89dfbefb17e9aed2),
а не старый developer draft freeze98 с прежней product pin. Исходники source98
закоммичены; ROOT final source/check/staging receipts — авторитетный prior state.


## Source115: открытие консоли без преждевременного чтения истории

Cold05 после внешнего закрытия сеансов прошёл initial prepared observation без
readonly toast, но perform отказал до жеста: в graph-scoped snapshot отсутствовал
btnProgress. Source114 readProcesses:false убрал не только native process inventory,
но и выбор toolbar/console observation root. Повтор Execute здесь не нужен.

Выбран отдельный внутренний readProcessControls: та же область toolbar/console,
тот же prepared-node owner, все dialog/epoch guards, но без запроса native history.
Initial openConsole ждёт существующую консоль либо единственную доступную кнопку.
Флаг сохраняется при разрешённом pre-gesture refresh. После открытия обязательный
readProcesses:true возвращает полную проверку истории; отсутствие grids не выдаётся
за пустую историю. Альтернативы — ослабить native history guard или расширить весь
workspace scan — не нужны. Публичные model tools и контракты не меняются.

Проверить actual createNodeProcedure: controls-only root, отсутствие native history
вызова, retained marker, отказ без prepared owner; driver test проверяет initial
controls-only и последующие history reads. Затем общий runtime regression до live.

Cleanup: закрытие браузера и пустой новый сеанс не подтверждают закрытие пакета в
старом сеансе. При CLEANUP_UNCONFIRMED новый пакетный прогон запрещён до наблюдаемого
закрытия прежнего пакета/сеанса либо явно сообщённого пользователем admin cleanup.
Для cold05 ROOT через headed Диспетчер подтвердил exact path в jsteach:2970, закрыл
пакет и сеанс, подтвердил отсутствие строки2970, затем admin logout/browser close.


## Source116: ожидание открытия порта и запрет cleanup при неизвестном эффекте

Cold06 подтвердил открытие консоли и process baseline. Output port Configure
отправлен и вернулся; pending diagnostics увидели4 samples без wizard до15s deadline.
Поздний screenshot показал уже открытый output wizard; cleanup встретил locked-node
confirmation. Поэтому выбран оставшийся исходный operation deadline для port open
и его transport, вместо независимых15s/20s. Срок самой операции не увеличивается,
прошлая операция не возобновляется, Configure не повторяется. Произвольное увеличение
лимита на N секунд и повторный Configure не нужны.

readPortMapping должен помечать nativeReadUncertain при отказе открытия до получения
verified receipt, а также при отказе Close/graph proof. Это блокирует внешний UI
cleanup при возможно открывающемся мастере. Успешные read/Close сохраняют обычное
закрытие пакета. Отдельный admin recovery после завершения исходного browser разрешён
только для установленного своего пакета/сеанса, с чтением точного подтверждения.

Actual node-procedure test проверяет deadline и transport остаток больше20s;
actual readPortMapping tests проверяют отсутствие Close после ambiguous/lost opening
и uncertainty после отказа cleanup. Затем runtime regression перед новым live.
