# Дополнение данных: исследование этапа 0

2026-11-03–04, mas, LAB-769. База `v040@2910b8782c1ad8c016c6fc478369ddd179457e3e`.
Живой стенд: https://app.loginom.ai/app/?testable=true, Loginom **7.4.2**
(`LoginForm;Login;lblProductVersion`). Только собственные пакеты worker
назначенной пары. CLI не собирался; модельной и независимой приёмки обработчика нет.

## Идентичность и порты — наблюдено

Палитра содержит
`MF;TF-1;ModelForm;colVendors_Компоненты>Трансформация>Дополнение_данных;TreeText`.
Создание через её контекстное меню `mnComponentsContextMenu;mniAddNewNode`.
Component ID назначения `component.transform.EnrichData`, иконка
`bg-vendor-icon-enrichdata`. Нативный fulltype — **TBGEnrichDataEngine**:
`Unit_0/Unit.xml`, `Component/Engine/@xsi:type` собственного сохранённого пакета,
сопоставленного по GUID созданного узла с живым графом.
VendorGuid — `0370e80a-78e1-4ede-b71b-930497994b44`.
Входы `TBGTuneDataSourceSocket`, выход `TBGDerivedDataSourceOutputSocket`.
UsePrefixes=true, NamePrefix=Ref, DisplayNamePrefix=Lookup;
Links содержат отдельные пары Key для каждого входа с главной таблицей.
Пакет скачан через Files UI, `btnDownload` → `mniDownload`; в Git не включён.

У нового узла два табличных входа: «Главная таблица» и «Присоединяемая таблица»;
один табличный выход «Выходной набор данных», `Output_Data-0`.
`Input_Add` создаёт ещё один вход; второй справочник назван
«Присоединяемая таблица 2». Подключены и выполнены все три входа.
Обязательность отсутствующих входов нативным Execute отдельно не проверялась;
контракт этапа 1 требует главную таблицу и каждый заявленный справочник.

Нативные индексы нельзя выводить из SVG-суффикса:

| Логический табличный вход | SVG data-tid suffix | Кэшированный FPortIndex |
|---|---|---|
| 0, главная | Input_Data-0 | 0 |
| 1, справочник | Input_Data-1 | 1 |
| 2, справочник 2 | Input_Data-3 | 2 |

Скрытый вход управляющих переменных также имеет индекс 2, но другой subtype.
Связи подтверждены `Graph;<источник>|Output_Data-0|Дополнение_данных|Input_Data-N`.
После открытия сохранённого пакета третий SVG-вход стал Input_Data-2:
индекс создания SVG не устойчив при persistence.
Предел произвольных динамических входов и удаление портов не исследовались:
назначение ограничено двумя справочниками.

## Мастер и настройки — наблюдено

Корень `MF;TF-1;WizrdMCF`; TF — текущий префикс вкладки, не постоянный ID.
Без настроенного входа присутствуют `TuneDataSourceInputPortWizard` для входов,
затем `EnrichDataWizard`, `DerivedDataSourceMappingEngineOutputPortWizard`,
`DoneWizard`. При активных источниках мастер сразу открыл EnrichDataWizard;
Далее перешёл сразу к описанию узла, выходное соответствие было пропущено.
Наличие страницы в DOM не означает, что она посещена.

Таблица `grdEnrichData` содержит главные поля и отдельную пару столбцов
для каждого справочника. Флаг `normalHeaderCt;chk1_Key` / `chk2_Key`
назначил ключ; `col1_Key` / `col2_Key` показали `Key`.
Редактор `grdEnrichData;grd-1;tbl;celleditor;cbx` содержит
`trg_filterswitch`, `trg_picker`, `boundlist;Key`.
При включённом фильтре для integer Key предлагался integer Key справочника.
Фильтрация всех совместимых/свободных полей и составные ключи требуют
адресной проверки на этапе 1; их успех здесь не заявляется.

Наблюдённый cached UI controller — EnrichDataWizard; FColumnsPrepared=true,
FMainColumnStore и два FJoinedColumnStores — локальные Ext.data.Store.
Главная строка Key имеет chk1=chk2=true, col1=col2=0;
lookup Key имеет Value=Index=0, Link=1 (индекс главного Key).
Остальные связи -1. FLinkAssignedProps/FLinkValueProps содержали также
лишнее сохранённое имя chk3/col3: число входов брать по реальному полному
инвентарю портов/хранилищ, а не по длине этих массивов имён.
Для readback пригоден паттерн Union — полный инвентарь и проверка взаимных
локальных связей; FEngine/FLinks — RPC proxies, их не разыменовывать.

`cntUsePrefixes;cnt;chb;InputEl` включает префиксы;
`pedNamePrefix;ValueControl input` и `pedDisplayNamePrefix;ValueControl input`
задают их независимо. Defaults: выключено, `Enrich` / `Дополнение`.
Заданы `Ref` / `Lookup`. Это буквальные общие префиксы без номера входа.
Для второго Name нативное техническое имя стало `RefName_1`, метка —
снова `LookupName`. Уникальность меток автоматически не обеспечивается.

Переход Далее при неназначенных ключах был принят без кнопки ошибки;
выполнение такой конфигурации не проводилось. Будущий handler должен
отклонять пустые keys до мутации: это ограничение среза, не нативный отказ.

Отрицательная проверка: NamePrefix=`9bad` → Далее оставил EnrichDataWizard
и показал `WizrdMCF;btnError`. Причина прочитана именно из его `data-qtip`:
«Префикс имени "9bad" не является правильным идентификатором».
Та же причина в `msgbox-1;cnt;cnt;MessagesView`, заголовок «Переход запрещен».
Собственный диалог закрыт, допустимый префикс восстановлен.

## Семантика и точность — наблюдено

Входы из `fixtures/`: main.csv — 6 строк, ref-b-duplicates.csv — 6,
ref-c.csv — 5. UTF-8, запятая, десятичная точка, заголовок,
ограничитель `"`, NULL-маркер `?`. После изменения decimal separator
требовалось штатно обновить автоопределение столбцов импорта: Amount/Rate
до этого были строковыми. Для приёмки типы закреплены явно в manifest.

Обычный Execute, без обучения, дал **13 строк × 7 полей**.
На посещённых страницах не было настройки train/apply; наблюдалась обычная
команда `btnExecute`. Сохранённая обученная модель не нужна и не проверялась.
Обе связи используют исходный Key главной таблицы. Для Key=3 поле первого
справочника NULL, но второй справочник всё равно даёт c3.
Два совпадения первого и два второго дают четыре сочетания на каждую
главную строку с Key=1. NULL совпадает с NULL: главная строка RowID=4
дала две строки b-null / b-null-copy с c-null. Key=4 сохранился с тремя NULL.
Строки справочников Key=99 и 98 отсутствуют. Ключи справочников исключены.

| Порядок | Имя | Метка | Тип |
|---|---|---|---|
| 1 | RowID | RowID | integer |
| 2 | Key | Key | integer |
| 3 | Amount | Amount | real |
| 4 | Note | Note | string |
| 5 | RefName | LookupName | string |
| 6 | RefRate | LookupRate | real |
| 7 | RefName_1 | LookupName | string |

Все 13 строк/91 ячейка и схема сравнены с независимым Python oracle:
точное совпадение, численная ошибка 0. Чтение — кэш видимого
`ModelForm;PreviewWindow;PreviewForm;DataSetForm`, FColumnInfosStore
и уже загруженная страница FDataTable.FDataSourceStore.data; вычислители,
RPC и внутренний JS Loginom не подменялись. Форматированный предпросмотр
округлял -0.125 до двух знаков; точное значение подтверждено кэшем.
Note="" у RowID=2 и Note=NULL у RowID=3 сохранились различными.
Числа fixture — двоичные рациональные, поэтому предлагается abs=rel=0.
Порядок наблюдён: главные строки по исходному порядку, внутри — B, затем C.
Предложение приёмки `ordered:false`: проверяется полное мультимножество
с сохранением кратности; порядок строк не объявляется общей гарантией.

На том же импортном источнике первого справочника путь заменён на ref-b.csv
с совместимой схемой и импорт выполнен заново. Execute того же EnrichData,
без повторной настройки его ключей/префиксов, дал 8×7 согласно expected-initial.
Возврат ref-b-duplicates.csv и повторный Execute дал снова точные 13×7,
включая заданные метки. Полные значения повторно сравнены с oracle.
Смена источника не требует пересоздания узла дополнения.
Числа oracle были подготовлены до первого выполнения; предварительные имена
col1/col2 уточнены по наблюдённому механизму префиксов до предложения критериев.
Модельных прогонов ни до, ни после этого не было.

## Сохранение и порядок полей

В новом браузерном профиле сохранённый пакет открыт и EnrichData выполнен
без восстановления настроек. Значения всех 13 строк совпали с oracle,
но при autosync=true порядок стал **Key,RowID,Amount,Note,RefName,RefRate,RefName_1**.
Исходная сериализация входа содержит настроенный Key перед автоматически
синхронизируемыми остальными столбцами; из начальной схемы RowID,Key нельзя
делать вывод о гарантии её порядка после открытия.

Для предложенного exact порядка используется существующий выходной mapping:
контекст Output_Data-0 → `mn;mniConfigurePort`,
`DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns` выключен,
RowID перемещён выше Key штатным `btnMoveMappingColumnUp`, Done.
Перед Done прочитаны полный порядок RowID,Key,Amount,Note,RefName,RefRate,RefName_1
и autosync=false. Сохранена отдельная собственная версия пакета;
исходная версия с автоматическим порядком сохранена для воспроизведения.
Нового общего алгоритма перестановки не требуется: готовый контракт mappings
уже принимает полный fields layout и autosync=false.

В ещё одном новом браузерном профиле эта версия открыта и выполнена без
перенастройки. Все **13×7 значения, типы, заданные метки и точный порядок полей**
совпали с expected.json. Это ручная исследовательская проверка persistence,
а не запуск штатного cold-check или приёмка ещё отсутствующего handler.

## Контракт этапа 1 — предложение

Runtime `transform.enrich_data`, единственный строковый mode `left`.
`parameter-schema.proposal.json` содержит descriptions всех полей, включая
вложенные объекты и ключи. Внутренние числовые коды модели не передаются.
Новый узел требует полную конфигурацию `enrichment`, источники 0..N и
непустые exact key pairs для каждого справочника. Пропуск enrichment на
существующем узле сохраняет настройки лишь при неизменных источниках;
при смене источника требуется полная конфигурация и повторная валидация схем.
Типы ключей совпадают; неявных конверсий нет. Префиксы не затрагивают главные поля.
Пустой ключ, третий справочник, иной mode и внешние привязки — отказ до мутации.
Train/apply не вводятся: обычное преобразование текущих входов.

Предлагаемый NODE_TYPES.semantics:

> Left-enrich main input 0 with one or two independent lookup inputs 1/2.
> Equal NULL keys match; duplicate lookup keys expand all Cartesian matches.
> Retain every main row; unmatched lookup values are NULL, distinct from empty text.
> parameters.enrichment supplies complete per-input key pairs and global literal
> name/label prefixes. Exclude lookup key columns, preserve scalar types, append
> non-key fields in input order; native name collisions may add suffixes.
> Execute current inputs without training; read output 0. Existing omission
> preserves supported settings only when sources stay unchanged. Other joins,
> third lookup, conversions and variable bindings are unsupported.
> For explicit output field order use output mapping port 0 with autosync=false
> and a complete fields layout; autosync can reorder keys after reopen.

Компактный readback: type/mode; node/source/port identities; полный список
каждого входа name/label/type; tables[{port,native_index,keys}]; prefixes;
фактическая выходная схема и output_port=0; validation=accepted_by_loginom_next.
Сырые UI-снимки и повторные копии каждой стадии модели не возвращать.
Ограничения и размеры — в приёмочном предложении. Статус не является PASS runtime.
