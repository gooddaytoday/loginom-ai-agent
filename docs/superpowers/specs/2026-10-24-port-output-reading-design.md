# Чтение результатов Loginom напрямую от выходного порта

Статус: дизайн, редакция 2, утверждён владельцем 24.10.2026 с сохранением F3 для native full. Реализация и план реализации не разрешены; для них требуется отдельное явное разрешение.

## Результат и границы

После выполнения узла агент получает схему и значения от выходного порта. Для обычной выборки и JavaScript full исчезают создание Table, настройка форматов, листание и восстановление отображения. Настройка узлов, выполнение, проверки принадлежности и ограничения full сохраняются. Обычный режим тоже возвращает точные значения, когда они доступны; неоднозначность обозначается явно.

Владелец выбрал штатный пакетный DataSource для обычного чтения и сохранение исходных байтов для native full. По результату живой сверки дополнительно разрешено сохранять исходный `−0`, хотя Table превращает его в `+0`. Native full сохраняет существующий путь через F3.

Владелец также одобрил исключение для потенциально усечённого строкового текста: после пакетного чтения он дочитывается штатным `column.AsString(row)` в том же browser-вызове. Это сохраняет полноту String и строк внутри Variant, но такие ячейки требуют дополнительных запросов данных.

Охвачены `dock_node_apply`, `dock_node_read`, доставка ответа, eval, действующие приёмочные потребители и освобождение ресурсов. Переиспользуются авторизованный браузер и контекст операции. Не входят новые типы/режимы/выходы, снятие пределов, изменение mapping, обучения, материализации, числа Execute и файлового экспорта; новый HTTP-клиент, сервис, кэш агента, публичный RPC-инструмент, настройки или реестр reader-ов; удаление пользовательских визуализаторов.

Подходы: ускорение Table сохраняет лишний визуализатор; штатный пакетный DataSource выбран как основной путь; собственный байтовый decoder для всех значений добавляет ненужную ответственность за протокол. Исходные байты остаются у действующего native full. Недопустим выигрыш за счёт потери значения, чужого/старого результата или выдачи неполного набора как полного.

Вне задачи: позже метаданными порта можно заменить F3 в предварительных проверках `sorting-preflight.mjs` и `grouping-preflight.mjs`.

## Текущее чтение и общая процедура

Сейчас сервер заполняет `ValueText` в кэше грида Table; DOM — свидетель соответствующей ячейки, не источник точного текста. Строгое чтение устанавливает маски real `0.################E+00`, integer `0`, datetime `yyyy-mm-dd hh:nn:ss.zzz`, проверяет их и восстанавливает. При `require_exact_numbers:false` формат не меняется. Эти действия обслуживают чтение, не вычисление узла.

Проверенная цепочка: `diagramPort.data.get_Output()` → `QueryInterface(bg.IBGDataSource)` → `get_RowCount()` и `get_Columns()` → `AsVariant(row,col)`. Коллекция даёт `get_Count()`/`getItem(i)`, столбцы — `get_Name()`, `get_DisplayName()`, `get_DataType()`, `get_DataKind()`. Вызовы асинхронные. Модельный порт не подменяется engine-портом. Штатный cache-helper читает блоки по 100 строк через GetValues (7227); отдельный QueryInterface внутреннего cache-интерфейса не нужен.

Общая внутренняя процедура получает проверенные контекст узла, завершённое выполнение и запрошенный выход. `node-context.mjs` и `node-output-context.mjs` сохраняют проверки документа, пакета, workflow, узла и порта: принадлежность, направление, табличный подтип, индекс, GUID и нативные объекты. Одного GUID недостаточно. Схема и count поступают от того же источника, не из ожидаемой конфигурации. Name/label/type/порядок сравниваются с проверенной схемой; `data_kind` **копируется** из проверенного mapping. `alignReadSchema` по-прежнему сравнивает только name/label/type.

Выборка начинается с первой строки и не превышает 100 строк — достаточно одного блока данных плюс метаданные. Всё чтение проходит одним обращением host→browser, без отдельного перехода через транспорт агента для каждой ячейки. После блока возможны только необходимые дочитывания строк по правилу ниже; обещания ровно одного запроса данных для них нет. Для count 0 и `sample_rows=0` возвращается полная схема без cell RPC. Пустой кэш не доказывает пустой набор; нулевая запрошенная выборка не делает непустой набор полным.

Для нескольких выходов источники и схемы отдельные, execution identity общая. Проверяются все запрошенные выходы в исходном порядке; атомарный снимок нескольких портов не заявляется.

## Значения, точность и пределы

Оба значения `require_exact_numbers` используют один разбор. `true` дополнительно отказывает, если результат содержал бы неподтверждённые Variant, нечисловой real или неоднозначную дату. `false` сохраняет `formatted_display`/`unverified` и прежние ограничения `numeric_display_precision`, `variant_display_precision`, `datetime_display_precision`. Формула `numbers_verified` прежняя: false при numeric/variant limitation; одна datetime limitation не делает его false. NULL обрабатывается прежде типа, включая Variant.

| Тип | Значение и метки обычного пути |
| --- | --- |
| NULL | `is_null:true`, `value:null`, `precision:'exact_null'` |
| Integer | Десятичная строка; Int64/UInt64 только через `toString()`, никогда через Number; `decimal_integer` / `exact_integer` |
| Конечный real | Число value и кратчайшая обратимая `decimal=String(v)`, для −0 `"-0"`; `binary64` / `17_significant_digits`. Метка означает достаточную точность, не обязательную длину текста. После JSON знак нуля сохраняет decimal |
| Нечисловой real | В false текст NaN/Infinity/−Infinity, `formatted_display` / `unverified`; в true отказ; не превращать в NULL при JSON |
| String | Полный текст с действующей редакцией секретов; новые `representation:'data_source_string'`, `precision:'source_text'` |
| Boolean | Boolean; новое `representation:'data_source_boolean'`, прежнее `precision:'exact_boolean'` |
| DateTime | Гражданский текст `YYYY-MM-DDTHH:mm:ss.SSS`; `local_datetime` / `millisecond`, `timezone:'unspecified'`, с правилом неоднозначности ниже |
| Variant | Неподтверждённый текст по правилу ниже; native-подтип не выводится из typeof или целочисленности Number |

Текст Variant: null/пусто → `is_null:true`; число → String(v), отдельно `"-0"`; Int64/UInt64 → toString(); строка без изменения; boolean → `"true"`/`"false"`; Date → правило дат. VT_UNKNOWN не сериализуется, ячейка без текста и unverified. Любой ненулевой Variant сохраняет `variant_display_precision` и отказ строгого режима; неоднозначный Date внутри него также получает `datetime_display_precision`. У DataSource нет серверного форматировщика: `$ConvertToString` лишь вызывает value.toString().

У точных ячеек нет display_text, у Boolean — русской подписи. Выбор новых имён меток — техническое решение этой редакции. Новый текст `precision.strings`: `data source text; existing secret redaction applies; original byte encoding is not attested`. `exact_native` остаётся исключительно в native full.

512 KiB считаются как UTF-8 длина JSON массива строк выборки, каждая строка — массив простых значений, без record_id/UI/метаданных ячеек. Это null, boolean, конечное число, строка; Integer — decimal-строка, дата — гражданский текст, Variant и nonfinite real — текст. Для VT_UNKNOWN без текста в расчёте используется null, не меняющий `is_null:false` самой ячейки. Сохраняются 100 строк и 10 000 ячеек; добавляются только полные строки. При ограничении — `sample_complete:false`, `read_limit:'preview_cell_or_byte_budget'`. На тех же данных полных строк должно быть не меньше, больше допустимо. Строки длиннее прежних 16 384 символов должны читаться целиком в этом бюджете; сегодня старый observer отказывает всей странице.

Отдельный бюджет доставки 46 000 байт и правила JavaScript full сохраняются. Компактор распознаёт новые строковые метки, удаляет избыточные метаданные, затем при необходимости целые строки с явной неполнотой. Сейчас он не обрезает текст ячейки: формулировка о прежнем «укорачивании строк» неточна. Native full не сокращается обычным preview-компактором; неполный результат не становится успешным full.

### Полный строковый текст

GetValues/AsVariant и обычный DataSource.AsString используют сокращённый кэш. Штатный `column.AsString(row)` у уже полученного для metadata IBGColumn читает напрямую через RPC160 и ReadString; собственный decoder, патч helper-а и новый proxy-слой не нужны. Коллекция/столбец остаются теми, что получены от проверенного источника.

Для поддерживаемой сборки техническое правило: если декодированное значение — строка и `value.length >= 5000 || value.endsWith("…")`, читать эту ячейку через column.AsString и использовать полный ответ. Это относится к String и строковому значению Variant, без вывода native-подтипа. Проверка суффикса нужна: на emoji усечение дало длину 4 999. Настоящее многоточие и полная строка длиной ровно 5 000 тоже дочитываются; лишний запрос безопаснее ложной полноты. Это признак необходимости проверки, не утверждение, что текст усечён.

Дочитываются только ячейки нужной выборки: строки обрабатываются по очереди, требующие дочитывания ячейки одной строки — параллельно. Бюджет 512 KiB рассчитывается по полному тексту, а не кэшированному префиксу; при невозможности добавить очередную строку целиком чтение останавливается, следующие строки не дочитываются. При ошибке дочитывания префикс не публикуется как полный. Все вызовы входят в тот же deadline, снимок до/после, finally/dispose и семантику отмены; очереди, retry, новые подписки и механизм прерывания не добавляются. Цена — один дополнительный RPC на такую ячейку; последовательные вызовы при наблюдавшихся примерно 131 мс на ячейку могут съесть выигрыш уже на сотне ячеек.

### Даты

Table получает серверный текст, независимый от пояса браузера. GetValues вызывает ReadDateTime → Date.FromOADate → Date.AddBias: serial трактуется линейно, затем из UTC-компонент создаётся местный Date. Поэтому возможны OLE-различия до 30.12.1899 и нормализация несуществующего местного времени. toISOString() не является нужной календарной семантикой.

Обратный OLE-пересчёт выполняется после проверки DST. Из локальных компонент Date строятся UTC-миллисекунды через `new Date(0)`, `setUTCFullYear(Y,M,D)`, `setUTCHours(...)`, с учётом годов 0–99. Пусть x — их разность с UTC(1899-12-30), day=86400000. Для x<0 результат `trunc(x/day)*day + abs(x%day)`, иначе x. Компоненты результата извлекаются UTC-getters без новой местной нормализации. Это обращает линейное декодирование к правилу OLE «целый день плюс время по модулю» с сохранением миллисекунд.

Детерминированный консервативный детектор — техническое предложение этой редакции: встроенный Temporal, доступный в закреплённом Chromium ([release manifest](../../../packages/product/loginom-release.json)). До OLE-коррекции timestamp Date преобразуется в Temporal.ZonedDateTime того же пояса. Предыдущие переходы обходятся начиная с instant + 1 ns для включения точной границы; обход останавливается при null или на первом переходе T, для которого `T ≤ instant − 48 ч`. Для более позднего перехода T вычисляется реальная положительная Δ по offset непосредственно до/после; instant в `[T,T+Δ)` неоднозначен. Смещение пояса от UTC по модулю меньше 24 ч, поэтому положительный скачок Δ < 48 ч и более ранний переход не может покрыть instant. Предположения «всегда час» нет.

Для декодированного года 0–99 дополнительно консервативно проверяются соответствующие гражданские сутки 1900+Y: сдвинутое/отсутствующее начало суток или положительный переход до начала следующих суток включительно означает неоднозначность. Причина — промежуточный год 1900+Y в new Date(Y,...) до setFullYear; проверка одного времени вспомогательного года пропускает переход через полночь. Новый timezone, polyfill, Table-fallback и сырой decoder дат не вводятся.

Неоднозначность даёт гражданский текст полученного значения с formatted_display/unverified и datetime_display_precision, без утверждения точности серверной даты. При true — отказ. Сейчас строгий Table-reader только добавляет datetime limitation: отказ — сознательное ужесточение владельца. Правило одинаково для DateTime и Date внутри Variant. Лишняя пометка допустима, пропуск сдвинутого значения недопустим.

## Разрешённые видимые изменения

Это исчерпывающий список ожидаемых отличий; прочее — дефект либо новое решение владельца:

- нет `table`, `table_schema_id`, `table_creation`, `format_proof`, `format_restoration`, `read_settings`, `workflow_return`/`workflow_returned`, `filter_enabled`;
- нет display_text точных ячеек и русских подписей Boolean; меняются строковая пара меток, Boolean representation и precision.strings согласно таблице;
- real получает кратчайшую decimal вместо научной записи того же binary64; исходный −0 сохраняется вместо прежнего +0 — отдельно одобрено по живому воспроизведению;
- false получает точные значения; Variant — определённый выше текст; неоднозначные даты — unverified либо отказ;
- длинные строки читаются целиком, под 512 KiB может поместиться больше полных строк, но не меньше; обнаруженное усечение этим не разрешено;
- порт получает `freshness_basis:'completed_execution_port_source'`.

freshness_basis уже есть как необязательная строка, но нового значения в коде нет. Оно означает подтверждённый порт, источник, завершённое выполнение и стабильность перед выдачей. Compact сейчас его выбрасывает — должен сохранять. Text Import заменяет `new_bound_table_after_verified_node_execution`. Enum происхождения файловых артефактов не расширяется; native binding не используется для обычного sample.

## Взаимодействие с обработчиками

17 типов используют общую tabular-оболочку, но четыре переопределяют readOutputs. Все **восемь** рабочих мест создания Table переходят на одну процедуру; копий нового reader-а нет. Пути далее относительно `packages/loginom-runtime/client/lib`.

| Место | Что сохраняется |
| --- | --- |
| `calculator-node.mjs` | Общий путь Calculator, Grouping, Sorting, Field Parameters, Replacement, Date/Time, Missing Values, Duplicates, Join, Union, Excel Import; mapping; динамические правила CrossTable; обычный sample Collapse |
| `filter-output.mjs` | Настраиваются оба выхода; при Execute минимум один запрошенный из 0/1, не обязательно оба; отдельные схемы, одно выполнение |
| `linregression-output.mjs` | Прогноз/коэффициенты, исключённые коэффициентные поля, фактическая схема |
| `clustering-output.mjs` | Обучение, материализация двух выходов, Cluster/Distance |
| `rest-request-node.mjs` | Схемы и эффекты Execute; reader не повторяет запрос |
| `text-import-node.mjs` | Файл, загрузка, mapping; hook приёмки и freshness переходят на новое происхождение |
| `javascript-code-node.mjs` | Sample и full (`sample_rows:100`, `require_exact_numbers:true`) через общий reader; openManagedJavascriptOutputViews для него не нужен. Только output 0, code/declared lifecycle, физическая привязка, source/settings admission, materialization и итоговый Execute сохраняются |
| `node-read-driver.mjs` | Повторное чтение после нового Execute; retained schema, NODE_READ_SCHEMA_CHANGED, sliding CrossTable, JavaScript admission |

`dock_node_read` строится из завершённой локальной операции, не из переданных моделью source identities. Сам reader никогда не вызывает Execute; существующие пути ожидания и восстановления не меняются. В частности, предложенный после остановки dock_node_read выполняет узел заново, включая REST/JavaScript. Text Export сохраняет файловый путь, bytes/SHA и cleanup.

## Native full: сохраняется F3

Native full Collapse/CrossTable уже не создаёт Table и не меняет форматы: клик порта → F3 → схема Preview → raw 321 → закрытие. JavaScript full относится к обычному пути выше.

| Вариант | Стоимость и риск |
| --- | --- |
| **Оставить F3: выбран владельцем** | Сохраняет проверенный native-контракт; медиана повторного F3-цикла в probe 66,9 мс; не меняет native binding/cleanup |
| Перенести источник на порт: отклонён для этой задачи | Шесть пар тегов/байтов совпали; источник отвечает на 321. Но полная привязка с метаданными заняла медианно 479 мс; выигрыш не доказан, нужны новые основания provenance и отказа |

Это накладные этапы на маленьком наборе, не end-to-end native full; Preview повторно использует свой кэш. Замеры не оправдывают расширение изменения сейчас. Перенос native full на порт исключён из утверждённого объёма.

Существующий [native full](../../../packages/loginom-runtime/client/lib/collapse-native-output.mjs) сохраняет interface 116 / method 321, decoder/adapter, native tags/bytes, 50×8, предел байтов, статический импорт, топологию, свежесть предков и exact_table/read_coverage/cell_precision/read_consistency. Привязка к Preview, её pins, закрытие и preview_closed в отказе не меняются. ReadVariant теряет исходный tag, ReadDateTime превращает serial в Date — обычный AsVariant их не заменяет.

Message Release, retirement при неопределённости и запрет поздней публикации сохраняются. Это не атомарный серверный снимок; невидимое изменение с возвратом к исходному состоянию не обнаруживается.

## Стабильность, отмена и освобождение

Один browser-вызов содержит снимок до/после: те же объекты узла и порта, GUID, session/$OW/$O, узел не выполняется, то же завершённое выполнение, тот же `$FData` и `$FCacheInitialized` после штатной инициализации. При расхождении результат не публикуется. Отдельных подписок, службы инвалидации и перепривязки нет; штатное поведение helper-а сохраняется.

Перед чтением подтверждается активность выхода, как сейчас. В host возвращаются только простые JSON-значения; proxy, cookies кэша (`$FDataChangeCookie`/`$FStateChangeCookie`), session и данные авторизации не передаются в host и журнал (инцидент «cookie bound», 27.09.2026). Размер ответа и временные объекты проверяются в браузере до передачи.
`cleanup_complete:true` допустим только при завершённых обращениях, освобождённых собственных ссылках и подтверждённом исходном контексте.

Отмена проверяется до dispatch и после возврата. Механизма прерывания внутри браузера нет; поздний результат не публикуется. finally освобождает через dispose только приобретённые proxy выхода, DataSource, коллекции и элементов столбцов. RPC-message Release не переносится на proxy. Если вызов не вернулся к сроку, сохраняются существующее unsettled-состояние и владение браузером, без фиктивного cleanup, нового deadline и автоматического Execute.

Переиспользуются operation controller, deadline, journal, inspect/release. Повтор operation_id/wait сохраняет семантику ожидания. Успешное выполнение не обнуляется отказом чтения: read остаётся effect_possible:true. Ошибка вспомогательного отчёта/доставки не отменяет подтверждённый результат.

Для новых чтений исчезают readView, восстановление своей Table при release и предупреждения о нём (node-pending-release.mjs, restoreStoppedTableRead, node-apply.mjs), запас времени на форматирование в user-workflow.mjs. Карты операций/readView живут в памяти; миграция журналов не нужна. Table-функции для независимых проверок сохраняются.

## Сверка старого и нового чтения

Удаление старого пути из рабочего чтения разрешено только после парной сверки, где все отличия входят в одобренный список. Будущий одноразовый приёмочный скрипт в `packages/loginom-runtime/tools/loginom-acceptance` использует существующую сессию: после **одного Execute**, на том же порту/выполнении сначала новый reader, затем старый Table в строгом режиме. Публичный dock_node_read для пары не подходит: он выполняет узел повторно. Сейчас скрипт не создаётся.

Сравниваются схема name/label/type/порядок, count, позиции NULL; Integer как decimal-строки; real через Object.is над binary64 с одобренным исключением потери знака −0 старой Table; Boolean по значениям; String точно, включая пустую, пробел, NBSP, CRLF; DateTime по гражданскому тексту с миллисекундами; Variant по null/status. UI-evidence/метки происхождения исключаются. Для разрешённых strict-отказов сравнивается соответствующий отказ/неподтверждённость, не выдумывается успешная полная таблица. После JSON знак real восстанавливается по decimal.

Для строк длиннее 16 384 символов старый reader отказывает; эталон — исходный текст фикстуры или ValueText из кэша Table, как в прогоне. Целые > 2^53 и границы Int64 поступают через Text Import CSV: [mixed.csv](../../../packages/loginom-runtime/tools/loginom-acceptance/collapse/acceptance-kit/fixtures/mixed.csv) содержит 9007199254740993; запись из JavaScript-узла округляет такие значения. Отсутствие изменения dirty проверяется на сохранённом чистом пакете: переход true→true этого не доказывает.

Сравниваются также compact и результат бюджета 46 000 байт: строк не меньше. Новый false равен новому true по точным значениям, кроме разрешённых unverified/отказов. Старый false не эталон: он возвращает экранный текст.

| Покрытие | Достаточные случаи |
| --- | --- |
| Обработчики | Calculator; Filter оба порта; Regression; Clustering; REST; Text Import; JavaScript sample/full; CrossTable, включая отдельный dock_node_read sliding-сценарий; обычный Collapse |
| Данные | >2^53, границы Int64; дробные после 9-го знака, −0, крайние real и сохраняемые NaN/∞; миллисекунды/граничные даты; NULL/пустая/пробел/NBSP/CRLF; >16 384 символов; Boolean/Variant; пустой выход/sample_rows=0; границы 10 000 ячеек/512 KiB |
| Unit | Int64/−0/nonfinite/Variant/бюджет; даты с фиксированным TZ, OLE, DST; снимок до/после отказывает чужому/заменённому порту, старому execution, сброшенному кэшу; отмена и поздняя публикация |
| Live | Парная сверка; существующее изменение схемы NODE_READ_SCHEMA_CHANGED; время чтения; отсутствие новых Table/смены форматов/листания и изменения dirty от обычного чтения и JavaScript full на сохранённом чистом пакете. Native full продолжает использовать Preview через F3 |

Переиспользуются runtime tools `collapse/fixtures/types.csv`, `collapse/acceptance-kit/fixtures/{mixed,all-null,header-only}.csv`, `javascript-native-fixtures.mjs`, `fixtures/row-filter/golden.csv` с математическим row_filter_oracle.py; evals `tasks/node-evals/crosstable-sliding-source-refresh/{oracle.py,oracle.csv,initial-oracle.csv,data/sales-initial.csv,data/sales-updated.csv}`. Отдельная live-матрица отрицательных проверок binding/cache не нужна.

## Потребители и опорные файлы

Помимо восьми мест выше, изменение обязано дойти до следующих границ. Это карта ответственности, не план реализации.

- [Схема результата](../../../packages/loginom-runtime/client/lib/node-result-schema.mjs), [контракты](../../../packages/loginom-runtime/client/lib/node-contracts.d.ts), [compact](../../../packages/loginom-runtime/client/lib/user-results.mjs) (поля порта и UI-summary), [бюджет](../../../packages/loginom-runtime/client/lib/user-preview-budget.mjs), нормализация журналируемых результатов и precision warnings.
- [Eval tableCsv](../../../evals/src/node-events.ts) принимает обе формы: старую workflow_returned + port.table.port_guid для истории; новую freshness_basis + port_guid + fresh + execution_id с проверкой принадлежности/полноты. Сохраняются [тест](../../../evals/test/node-additional-sequence.test.ts) и [fixture](../../../evals/test/fixtures/node-evals/sliding-refresh-protocol.json); обновляется [sliding SPEC](../../../evals/tasks/node-evals/crosstable-sliding-source-refresh/SPEC.md).
- text-import-node.mjs меняет hook onTableRead/его содержимое для нового результата и потребителя javascript-native-input-driver.mjs; независимый Table-оракул остаётся.
- [node-api](../../../packages/loginom-runtime/client/lib/node-api.mjs), [workflow skill](../../../packages/product/skills/loginom-automation/references/workflow.md), [user-workflow](../../../packages/loginom-runtime/client/lib/user-workflow.mjs): убрать инструкции о форматировании, округлении false, «512 KiB UI row data» и многоминутном запасе на форматы.
- [Table procedure](../../../packages/loginom-runtime/client/lib/node-output-procedure.mjs), [страницы](../../../packages/loginom-runtime/client/lib/table-output-pages.mjs), [старый decoder](../../../packages/loginom-runtime/client/lib/table-output-values.mjs), [observer](../../../packages/loginom-runtime/client/lib/node-table-context.mjs), [output context](../../../packages/loginom-runtime/client/lib/node-output-context.mjs), [read contract](../../../packages/loginom-runtime/client/lib/node-read-contract.mjs), [apply](../../../packages/loginom-runtime/client/lib/node-apply.mjs), [release](../../../packages/loginom-runtime/client/lib/node-pending-release.mjs): убрать рабочую зависимость от Table, сохранить нужные oracle-функции.

Файлы таблицы — в `packages/loginom-runtime/tools/loginom-acceptance`. «Обновить» означает новый producer-контракт, не замену независимого оракула тем же reader-ом.

| Проверка | Действие |
| --- | --- |
| row_filter_output_evidence.py | Обновить действующих Filter/combined/date/export потребителей |
| import_output_evidence.py | Обновить результат инструмента; сохранить verify_table_output_observations для настоящей Table |
| row_filter_oracle.py | Старую evidence-форму — только для исторических отчётов; используемые load_rows/partition остаются |
| reform_matrix_evidence.py | Старую evidence-форму — только для исторических отчётов; live reform использует другой verifier |
| full_read_evidence.py | Обновить ordinary sample потребителей; название не означает native full |
| javascript_output_evidence.py | Обновить |
| javascript_cold_evidence.py | Обновить интеграцию, сохранить живую Table-ветку cold readback |
| javascript-native-datetime-civil.mjs | Обновить интеграцию, сохранить независимый живой Table-оракул даты |
| javascript-native-input-contract.mjs | Обновить input-base result, сохранить private Table-оракул |
| javascript-native-input-driver.mjs | Обновить hook/base.readOutput, сохранить независимое наблюдение |
| javascript-mismatch-probe.mjs | Обновить интеграцию действующих проб, сохранить Table-оракул |
| collapse/acceptance-kit/audit.py | Только для исторических отчётов/закреплённого набора; не переписывать frozen контракт ради ordinary sample |
| collapse/exact-wiring/public-audit.py | Только для исторических отчётов/закреплённого native full; утверждённый дизайн его не меняет |

Table-функции нужны также `scripts/node-acceptance/cold-check.mjs`; runtime tools `rc-combined-reopen.mjs`, `rc-combined-reopen-v2.mjs`, `date-time-saved-import.mjs`, `collect_missing_values_table.mjs`, живым cold/civil веткам `javascript-execution-runtime.mjs`; `packages/loginom-host/script/skills-acceptance/cold.mjs`; `packages/desktop/test/loginom/cold-readback.mjs`; `evals/script/text-import-cold/reader.mjs`; `docs/node-development/nodes/text-import/acceptance/matrix-cold-check.mjs`. Helper целиком не удаляется.

Опорный клиент стенда: BrowseView.js (серверный cvkValueText), bg.model.rpc.js (output), bg.customconnectors.rpc.js (GetValues/helper), bg.rtl.rpc.js (metadata/column.AsString), rpc.js (ReadVariant/ReadDateTime/ReadString), SysUtils.js (FromOADate/AddBias). Это внутренние интерфейсы поддерживаемой сборки, не обещание публичной стабильности API Loginom.

## Исследование 24.10.2026

Стенд Loginom 7.4.2, Chromium 154.0.8037.0 из закреплённой установки; default Europe/Moscow и отдельный context Europe/Berlin. JavaScript output 0, 10×6 в собственном несохранённом пакете; порт и Table прочитаны на одном выполнении. Повторены UI-шаги/маски Table, прочитаны серверный кэш и заголовки; полный продуктовый observer не запускался. Это probe, не приёмка реализации.

| Случай | Старое | Новое | Совпало / объяснение / решение |
| --- | --- | --- | --- |
| Схема/count | I/F/S/B/D/V, 10 строк | Те же имена/подписи/типы/порядок/count; прочитан DataKind | Совпало; DataKind не новый критерий |
| Полученные Integer | Decimal, включая 9007199254740992 и MIN Int64 | Number/Int64 → та же decimal | Совпало. Заданные 2^53+1/MAX Int64 не получены: JS-запись округлила/переполнила их до чтения |
| Конечные real | Научный текст, различие после 9-го знака, 5e−324/MAX | Исходный binary64 | Совпало после разбора decimal |
| −0 | 0E+00 → +0 | −0; raw tag5 подтверждает знак | Отличается; сохранение −0 отдельно одобрено |
| NaN/±Infinity | NaN стал NULL; Infinity: 0E+32766/−0E+32766 | NULL/±Infinity | NaN отдельно не получен; nonfinite false unverified, strict отказ |
| NULL/короткие строки/Boolean | NULL, пустая, пробел, NBSP, CRLF, «null», Истина/Ложь | Те же значения | Совпало после нормализации |
| Строка 20 000 | ValueText содержит 20 000; observer отказал бы из-за 16 384 | Кэш: 4 999+… (5/5); column.AsString: 20 000, точное равенство | Усечение подтверждено; отдельно проверенное дочитывание устраняет его и одобрено владельцем |
| Обычные даты/ms | Серверный гражданский текст | Совпадает после правила дат | Подтверждено для полученных значений |
| До эпохи/0050 | Фактически записаны 1899-12-30 18:00 и 0050-06-02 12:00 | До коррекции 1899-12-29 06:00 и 0050-06-01 12:00 | После OLE-коррекции совпало; запрошенные исходные даты на сервере не получены из-за JS→Loginom записи |
| Moscow DST | 2010-03-28 02:30; 2011-03-27 02:15 | 03:30; 03:15 | Отличается, детектор помечает неоднозначность |
| Berlin DST | 2026-03-29 02:30 | 03:30 | Подтверждено в отдельном контексте |
| Variant | 1,1,«1»,дата,NULL | number,number,string,Date,null | Null/status согласуемы; raw первого Variant — tag 3. Отдельный real-подтип литерала 1.0 не подтверждён |
| Отдельный пустой output | Table не открывалась | count 0, полная схема Empty/string, rows[] | Прямой путь подтверждён без cell calls |
| Raw 321: Preview/порт | Шесть frames Preview | Те же tags 20/5/8/11/7/3 и логические payload | Совпало: Int64, −0, CRLF, Boolean, Date, Variant; это не весь native binding |

Дополнительный live-probe проверил 12 ячеек String/Variant: длины 4 999, 5 000, 5 001, 20 000, настоящий суффикс «…» и 5 001 emoji. Все column.AsString совпали с полным исходным текстом; приведённое правило не пропустило ни одного усечения. Проверка сериализации Playwright отдельно передала 20 000 символов без усечения.

Offline-probe точной копии FromOADate/AddBias: 44 случая UTC/Moscow/Berlin, Lord Howe (30 минут), Apia (сутки), Monrovia (44 минуты 30 секунд), годы 0–99 и переходы вспомогательного года. Все значения либо восстановлены точно, либо помечены неоднозначными. Проверка ревью: копия `rev2/offline-datetime-probe.cjs` с ограничением обхода 48 часами дала те же вердикты на всех 44 случаях, проверяя не более одного перехода. Без ограничения `9999-12-31` в Europe/Berlin требует 16 067 переходов (~26 мс на значение), Europe/Moscow — 76 переходов (~0,2 мс). Вся tzdb не проверена.

| Замер: медиана из 5 | Время | Граница |
| --- | --- | --- |
| Прямое холодное чтение | 499 мс | Новый proxy/cache, schema/count, 60 значений; без настройки узла |
| Привязка/метаданные | 479 мс | get_Output, QueryInterface, count/columns/metadata |
| Тёплые значения | 0,10 мс | Повторные 60 AsVariant уже загруженного источника; без metadata, не полный reader |
| Старый UI-цикл | 4 943 мс | Открытие существующей Table, маски, кэш, восстановление, граф; без создания новой Table и проверок channel |
| Повторный F3 | 66,9 мс | Клик, F3, готовая схема/count, закрытие, граф; кэш Preview переиспользуется |

Один дополнительный column.AsString для 20 000 символов занял 131 мс; это одиночный замер, не медиана. Неуспешные попытки настройки временного UI-probe в пять успешных циклов Table не включены. Коэффициент ускорения не обещается: основной прямой замер содержит усечённую строку. Dirty оставался true→true — проверена неизменность флага, не отсутствие изменения чистого пакета.

Все собственные пакеты, включая дополнительную проверку строк, закрыты без сохранения, выполнен logout, браузеры закрыты. Сырые данные/временный код — вне Git в каталоге визуализаций чата, rev2. Продукт, тесты и fixtures не менялись. Пока не проверены реализация reader-а, compact/46 000, границы 10 000/512 KiB, все семейства узлов, live schema change. Эти проверки относятся к будущей реализации. Дополнительное дочитывание проверено на отдельном тестовом выполнении; общий reader и его полная парная приёмка ещё не реализованы.

Внутренние имена/размещение функций и адресных тестов оставлены исполнителю. Видимый контракт, режимы, provenance/full/cleanup и правило дат — нет.

Проверка редакции: независимый builder check — `nothing important left`; относительные ссылки проверены, `git diff --check` чистый. Это подтверждение готовности документа, не реализации.
