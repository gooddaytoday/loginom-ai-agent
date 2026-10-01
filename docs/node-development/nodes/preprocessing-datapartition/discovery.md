# DataPartition: журнал native discovery LOG-52

Дата: 2026-10-01. Статус: **discovery_required**, реализация не принята.
Продуктовая база: `375b32bbf5d5e1376628d1b3684a2da78bda29da`.
Кандидат исследования: `LOG-51-375b32bbf`, `sourceDirty=false`; это общая
принятая база, **не сборка готового обработчика DataPartition**.
Аккаунт/слот исследования: `lab-slot-a` / `a`.

## Подтверждённые наблюдения

Источник: собственный qualified diagnostic run `95a78b96-b7da-41df-abd8-c586a189c2c3`,
пакет своего аккаунта открыт без сохранения изменений; новый узел и связь
с существующим импортом создавались только для исследования, затем отброшены.
Путь evidence: `/opt/loginom-worker/slots/a/attempts/LOG-52-discovery-95a78b96-7/evidence`.

| Свойство | Наблюдение | Статус |
| --- | --- | --- |
| Build | Loginom `7.4.2` | Подтверждено |
| Native palette | `Предобработка>Разбиение_на_множества;TreeText` | Подтверждено |
| Native icon | `bg-vendor-icon-partition` | Подтверждено |
| Узел / порты | Один новый GUID, один табличный вход, три табличных выхода; GUID каждого порта сохранён в `native.json` | Подтверждено topology, не семантика данных |
| Главная форма | `WizrdMCF;PartitionComponentWizard` | Подтверждено |
| Методы | `pedSamplingMethod;ValueControl`: 0 random, 1 uniform, 2 stratified, 3 sequential, 4 biased | Подтверждено полный локальный combo store и UI-переходы |
| Приоритет test | `cntTestPriority;cnt;chb` | Подтверждено контрол, не все сочетания |
| Положение test | `pedTestPriorityPosition;ValueControl`: 0 алгоритм, 1 начало, 2 конец; disabled при training priority | Подтверждено контрол/store |
| Seed | `RandSeedEdit;edtRandSeed;ValueControl`, native строковое представление числа | Подтверждено контрол; persistence NOT_RUN |
| Состояние входа | `btnActivationPort`, `txtActivationPortStatus`, `txtTotalRecords` | Подтверждено наличие; активация отдельно исследуется |
| Общие размеры | `SizeGridForm;grdDataSet`: `Partition.TeachDataSetSize` и `Partition.TestDataSetSize`, отдельные percent/rows редакторы | Подтверждено |
| Uniform | `RandomUniformMethodForm;SizeGridForm`: **два** размера групп, `Partition.TeachGroupSize` и `Partition.TestGroupSize`; каждый имеет свой способ и percent/rows редакторы | Подтверждено; одиночный proposed `group_size` не описывает полный native контракт |
| Strata | `StratifiedMethodForm;grdStratifiedGrid`, выбор technical `Name` через `UsageFlag`; дополнительный `pedCompleteUniqueValues;ValueControl` | Подтверждено контроли/store, математическое правило NOT_RUN |
| Sequential | `SequenceMethodForm;grdSequence`: training/test/unused, `SamplingType`, `SamplingCount`, `SamplingPercent`, `SequenceOrder`, `PartitionType`; кнопки reset/up/down | Подтверждено контроли/store; proposed take/skip не считаются доказанным mapping |
| Bias | `BiasedMethodForm;grdBiasedColumns` и `grdBiased`, кнопки unique values/edit; колонки value/factor/count | Подтверждено наличие; значения/округление NOT_RUN |
| Завершение исследования 7 | command_exit=0, `cleanup.json.confirmed=true`, package_closed/logged_out=true; wrapper COMPLETED и cleanup_confirmed=true | Подтверждено cleanup, **не PASS узла** |

Дополнительный завершённый run: attempt `LOG-52-discovery-95a78b96-10`.
Перед browser выполнен authenticated knowledge MCP initialize штатным
`checkKnowledge` exact candidate. Собственный вход активирован кнопкой:
наблюдение `txtActivationPortStatus = "Вход активирован"`, `txtTotalRecords = "2"`.
Все пять методов повторно открыты с активированным источником. Для bias выбрано
technical поле `Category`, нажата штатная кнопка unique values; локальный store
содержит X/Y, у каждого `RefCount=1`, `Factor=1`, `Count=1`.
Это наблюдение UI, **не математическое expected и не продуктовая приёмка**.
Attempt 10: command_exit=0, локальная cleanup confirmed, wrapper COMPLETED,
cleanup_confirmed=true, package_closed/logged_out=true.

В локальной native форме Sequence все четыре колонки имеют `editor=null`;
прочитанный, но **не вызванный** native `SaveParams` сохраняет только позиции
test/training через `SetPartitionsOrder`. `LoadParams` читает общие размеры
`GetSizeGridData`/`GetDataSets` и вычисляет остаток unused. Отдельные take/skip
контроли этим наблюдением не подтверждаются. API нельзя рекламировать как
поддерживающий синтетический повторяющийся take/skip, не имея native основания.
Native код редактора bias отображает `Count = Math.round(RefCount * factor)`;
это подтверждает UI-формулу, но не доказывает серверный sampling/rounding.

## Разрешённые shared hooks

В принятом SHA общий snapshot не распознаёт `PartitionComponentWizard`:
`workspace-ui.mjs` содержит закрытые stage markers/expected_stage и не имеет
DataPartition markers. `node-procedure.mjs` имеет закрытый список `read*`
контекстов и не содержит `readDataPartition`. Без адресного подключения этих
hooks собственный handler не получает guarded, journaled native readback и
не может пройти штатный мастер. Прямой raw executor в product handler не
предлагается как обход.

В задаче разрешены собственные datapartition-файлы и регистрационные entries
в API/support/contracts/result/discovery. Владелец разрешил правки 2026-10-01 через interaction
`2b2ac489-ab43-4612-91bb-e6cda41ff565` и уточнение issue plan:
только DataPartition stage/control bindings и optional native-context hook,
без изменения guard/deadline/lifecycle или новых services/барьеров.

Новый native узел автоматически получил label с размерами (`Обучающее: 50%`,
`Тестовое: 50%`), а не title компонента. Identity определяется GUID/иконкой/портами,
не сравнением такого label с названием компонента. Native SVG TID находится
под `MF;TF-1;Graph;...`, хотя контейнер — `MF;TF-1;ModelForm;cmpDiagram`.

## Сохранённые неуспешные диагностические попытки

Попытки 2–6 сохранены отдельно; их результаты не заменены успешной попыткой 7.
Собственные ошибки диагностического скрипта: слишком быстрый drag, предположение
о label, неверный SVG TID, клик перекрытого body, неверное имя кнопки close.
После каждого отказа прочитаны фактические lifecycle/cleanup. В попытке 6
локальная cleanup не подтверждена из-за открытого мастера, но штатный wrapper
закрыл одну сессию **своего** аккаунта и подтвердил cleanup. Это не подтверждение
успешного выполнения сценария узла и не скрывает первоначальный FAIL.

## Непроверенное / дальнейшая работа

- Edition и полный native fulltype ещё не подтверждены.
- Native limits, все active settings/readbacks, complete_unique_values и group/order
  mapping должны быть закреплены до публикации API. Предварительный валидатор
  пока проверяет proposed параметры подплана и не зарегистрирован как support.
- Все mathematical fixtures/rules, output role/schema/membership, typed values,
  fresh dynamic reads, negative oracle controls и recovery: **NOT_RUN**.
- Handler create/edit/execute/read, clean current-SHA build, business CLI7200,
  независимый cold reopen и product `result.json PASS`: **NOT_RUN**.
- Registry/readiness партии не изменены; PR готового узла не открыт.

## Продолжение после разрешения hooks — 2026-10-01

Собственный run `deb574a4-2a22-471b-b32b-fe0db7185675`, слот `a`.
Кандидат Loginom runtime остаётся accepted prerequisite; адресные UI reader/procedure
исследуются из рабочей копии. Это **не clean product candidate / PASS узла**.

| Проверка | Evidence / результат | Уровень |
| --- | --- | --- |
| Bridge checkpoint | GET → plan PUT(baseRevisionId) → GET compare | PASS текущего run |
| Managed MCP | Оба initialize/tools/list; installed list_projects | PASS текущего run |
| Guarded native readback | attempts `LOG-52-readback-deb574a4-3`: все пять methods, before/after prepared node context | Подтверждено UI |
| Штатный journaled observer | attempts 5–9: createNodeProcedure/readDataPartition | Подтверждено UI; не execution |
| Seed + процент training | attempt 6: seed=17, training=60%; readback native UI | Подтверждено draft |
| Оба способа размера | attempts 7/8: training/test rows=1; native SizePath/record/editor binding | Подтверждено draft |
| Summary row | test-size имеет повторный colSizeType_1; summary исключён, кнопка native record привязана отдельно | Подтверждено DOM |
| Sequence | attempt 9: guarded выбор sequential, порядок unused/test/training | Подтверждено draft, save/cold NOT_RUN |
| Strata checkbox | attempt 10 отказал до жеста: unique checkbox не найден; wrapper cleanup_confirmed=true | FAIL reader; native math NOT_RUN |
| Unit/context и regression | 109/109 PASS; полный workspace-ui/node-procedure/parameters 394/394 PASS | Offline implementation checks |
| Docs validator | PASS; registry партии не менялся | Offline docs |

Параметры валидатора теперь соответствуют наблюдённым контролам:
`uniform={training:{unit,value},test:{unit,value}}`,
`stratified={fields,complete_unique_values}`,
`sequential={order:[training,test,unused]}` в любой перестановке.
Ранее proposed `group_size` и `take/skip` не поддерживаются и отклоняются;
полный scope native методов сохраняется. UI-фильтр bias использует ChainedStore
и исключает continuous поле из доступного списка; reader читает полный source
store для schema и не принимает filtered chain за полный inventory.

Неуспешная attempt 4: диагностический caller не передал обязательный
`operation.action` для journal; wrapper очистил свой аккаунт. Исправленная attempt 5
COMPLETED. Historical FAIL не заменён успешным результатом.

В попытках 1–3,5–9 wrapper COMPLETED/cleanup_confirmed=true; это cleanup,
не математический oracle и не PASS продукта. При ошибке внутри открытого мастера
локальная cleanup может отказать; административный wrapper cleanup отдельно
подтверждает освобождение. Native fulltype/edition, пределы, математические правила,
output schemas/roles, dynamic/recovery/save/cold/CLI7200 остаются **NOT_RUN**.

Attempt 12: binding checkbox strata исправлен и флаг поля успешно переключён.
Отдельный set_checked для CompleteUniqueValues отказал до жеста:
InputEl закрыт native DisplayEl (NOT_APPLIED/effect_possible=false/cleanup_complete=true).
Для следующей проверки используется штатный DisplayEl того же owned checkbox;
guard hit-test сохранён. Wrapper attempt 12 FAILED, cleanup_confirmed=true.

## Native configure/execute/read — 2026-10-01

Собственная попытка `LOG-52-readback-deb574a4-19` завершилась COMPLETED,
command_exit=0, cleanup_confirmed=true, loggedOut=true. Продуктовая приёмка
на чистом SHA обработчика, business CLI и cold остаются NOT_RUN.

- Guarded настройки: все пять methods; размеры обоих наборов rows/percent,
  seed17, priority test/end, native последовательный порядок unused/test/training,
  strata RowID + complete_unique_values=true, bias Category: X factor2, Y count0.
- Native Next/Done приняли draft; все три output mappings прочитаны и сохранены.
  Source links получены штатной кнопкой без execution. Source inventory содержит
  name/label/type/required, **не data_kind**; data_kind отдельно проверяется по
  target definition и fresh native Table metadata.
- Port0 combined: IsTestSet, boolean, Дискретный, service required=true;
  port1 training и port2 test сохраняют исходные поля. Три GUID различны.
- Одно owned completed execution; Table schemas свежие, filters выключены,
  каждый порт sample_complete=true. Combined3/training2/test1.
- Training содержит две occurrence X с RowID `9007199254740993`, exact integer,
  Amount5.5, Qty3, Status new и typed NULL Note; test содержит Y/RowID2,
  Amount6.25, Qty4, Status new и empty string Note. Membership false/true
  согласуется с отдельными портами. Numeric format проверен и восстановлен.
- Native Y остаётся в test при count0 и test priority/end. Следовательно,
  правило «bias count0 удаляет значение из каждого выхода» **опровергнуто**;
  порядок allocation/bias и процентная база требуют различающих fixtures.

Попытки 10–14,17–18 сохранены как FAIL с подтверждённым wrapper cleanup.
17: ошибочное ожидание data_kind в source inventory исправлено отдельной
проверкой target metadata. 18: общий диагностический deadline120s исчерпан
после настройки портов; повтор19 использовал заранее заданный900s deadline,
без продления незавершённой операции. Attempt15/16 также COMPLETED.

Адресные handler/output/readback/schema и read-existing driver добавлены как
internal candidate. Публичные schema/modes/default ports проверены офлайн;
живой public create/edit/read, dynamic/recovery/save/cold ещё NOT_RUN.
Registry/readiness партии не менялись. Ожидаемые математические результаты
не построены копированием native output; oracle для полного объёма не заморожен.

## Проверка registry документации

После адресной регистрации internal candidate `validate.py` завершился FAIL:
`runtime handlers differ: ['preprocessing.data_partition']` и
`evidence hash runtime-registry`. В документационном registry по-прежнему15
implemented handlers, в runtime16. Общие registry/inventory/readiness принадлежат
оператору и здесь не повышались. Это сохранённый незакрытый результат проверки,
а не основание объявить всю партию готовой или переписать validator.

## Первый полный public path — чистый SHA78a2b40cb

Attempt `LOG-52-public-deb574a4-25`, runtime build
`78a2b40cb8f2316c94b58470cf9705c824870454`, sourceDirty=false, remote SHA совпал.
Штатные managed bridge APIs в квалифицированном browser namespace использованы
через настоящую MCP transport/client; prepare немедленно bindPrepared, один sessionId.

- Delivery108bytes/hash исходного base.csv подтверждён; существующий import
  изменён на12 строк и3 поля без пересоздания и без сохранения исторического пакета.
- Новый DataPartition/sequential: rows6/3, training priority, seed17,
  order training/test/unused. Public create/configure/execute/read SUCCEEDED,
  cleanup_complete=true, все3 порта complete (9/6/3), settings readback присутствует.
- Public dock_node_read использовал original source_operation_id, тот же node GUID
  и новые owned completed execution; configuration.status=not_requested.
- Independent expected сохранён из CSV **до** появления native результата:
  first6 training, next3 test, last3 unused. Initial и reread oracle PASS.
-13 negative controls дали FAIL: value, port, schema, NULL, added/lost occurrence,
  duplicate с прежним count, stale execution, filter, partial, cached metadata,
  order, membership. Это подтверждает только указанную последовательную конфигурацию.
- Оба cleanup.json/lifecycle.json подтверждают закрытие пакета/logout; slot a свободен.
-88 public/schema/user-response tests и388 observer/procedure regressions PASS
  с квалифицированными SDK dependencies собранного runtime.

Исторические public attempts20–24 сохранены FAILED: own script graph invocation,
missing delivery budget, неправильный уровень upload_operation_id и SDK wait60s.
24 имел неизвестный исход import после транспортного timeout; local cleanup отказал
DIAGNOSTIC_SAVE_PROMPT_CHANGED, wrapper закрыл свою сессию и подтвердил освобождение.
25 использовал заранее120s transport allowance для wait60s, без продления
immutable node deadline; никакой исторический FAIL не заменён PASS.

Остальные методы/math/limits/fulltype/edition, dynamic/recovery/save/cold/CLI7200
остаются NOT_RUN. Этот один public PASS не является приёмкой полного узла.

## Public attempt 26 / guarded epoch recovery

Clean candidate `0c6fc58c67822c33c68281c091c3b64162a5e0de`, sourceDirty=false,
remote SHA confirmed. Source delivery/import succeeded. Random configure stopped
with AMBIGUOUS, no execution, while switching test size percent→rows. The primary
journal shows NOT_APPLIED/UI_EPOCH_CHANGED with no effect, then authorized retry
whose observation omitted node_data_partition. Its semantic readiness therefore
timed out. This is a missing DataPartition dispatch in the shared refresh path,
not a native sampling result. The own dispatch is now retained on refresh; a
regression proves fresh native observation before the second guarded gesture.

Local cleanup encountered DIAGNOSTIC_SAVE_PROMPT_CHANGED. Wrapper lifecycle
retains FAILED/command_exit=1, cleanup_confirmed=true, closed=1/loggedOut=true
for lab-slot-a only. Historical FAIL is preserved. New native run is required.

Int64 bias keys now decode only native plain hi/lo data descriptors, safe numbers
or bigint within signed int64. Datetime keys decode valid cached Date objects
to local ISO milliseconds. Offline tests reject unsafe numeric values and
getters; native bias int64/datetime remains NOT_RUN. Canonical typed key identity
is shared between validation and selection, including local datetime precision.
