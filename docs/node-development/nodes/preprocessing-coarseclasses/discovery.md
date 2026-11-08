# Конечные классы: этап 0, LAB-775

03.11.2026, mas, Linux x64, база `origin/v040@2910b8782c1ad8c016c6fc478369ddd179457e3e`.
Стенд только `https://app.loginom.ai/app/?testable=true`, Loginom **7.4.2**,
Node 24.19.0, Chromium 1246. После уточнения назначения использован worker пары
`~/.config/loginom-multica/cards/412fbafd-e49a-427b-bcbb-c107ebe51b8a/`.
В прежнем браузерном профиле после прерывания уже была форма входа; повторного
входа под прежней парой не выполнялось. Все численные опыты ниже — в новой паре.

Это native discovery и предложение критериев перед этапом 1. CLI не собирался,
runtime не менялся; модельные run-check, CSV-приёмка и cold-check не запускались.
Результаты ручного исследования не засчитываются в требуемые 2/3.

## Компонент и адресация — наблюдено

В палитре есть `ModelForm;colVendors_Компоненты>Предобработка>Конечные_классы;TreeText`.
Component ID назначения — `component.preprocessing.CoarseClasses`;
runtime proposal — **`preprocessing.coarse_classes`**, режимы **`internal` / `apply`**.
Иконка `bg-vendor-icon-coarseclasses`, vendor `IBGCoarseClassesComponentVendor`,
VendorGuid `5c25727f-f53f-44b3-89cc-9570afe0f294`.
Native fulltype движка **`TBGCoarseClassesEngine`** прочитан как `Engine/@xsi:type`
в `Unit_0/Unit.xml` штатно сохранённого и скачанного собственного пакета.
Имя JS proxy не использовано вместо fulltype. Сырые XML/пакет в PR не включены.

Исследование начато с DOM по data-tid. Префикс первого сценария `MF;TF-1`,
после открытия сохранённого пакета — `MF;TF-5`. Мастер имеет корень `WizrdMCF`.
В графе: один табличный вход `Input_Data-0`, дополнительный `Input_Add` для
внешнего разбиения и три табличных выхода `Output_Data-0/1/2`.
Служебные переменные не считаются ещё одним табличным портом.

После Done метка автоматически стала «Кон. классы: Target, Segment»;
DOM-суффикс `Кон._классы:_Target_Segment`. На повторном открытии GUID узла
сохранён. Реализации следует связывать текущий data-tid с GUID, не конструировать
его из прежней подписи. Кнопки Setting/Launch появляются у выбранного тела узла.

Страницы: `TuneDataSourceInputPortWizard` при неподготовленном входе;
`CoarseClassesWizard` — внешнее разбиение, скрыта без дополнительного входа;
`CoarseClassesWizard-1` — назначения столбцов;
`CoarseClassesWizard-2` — классы;
`DerivedDataSourceMappingEngineOutputPortWizard`, `-1`, `-2` — три выхода;
`DoneWizard`. При готовой связи входная страница пропускается.
Скрытые страницы остаются в DOM; длина мастера не константа.

В пределах узла все использованные controls имеют data-tid. Для загрузки CSV
скрытый HTML `input[type=file]` не имеет data-tid; использовано штатное событие
filechooser после клика собственного `FileStorageForm;btnUpload`. Это пробел
разметки загрузки, не разрешение произвольного DOM-поиска в обработчике узла.

## Роли и параметры — наблюдено

Ниже C = `WizrdMCF;CoarseClassesWizard-1`, S = `C;CoarseClassesSettingsFrame`.
Строки грида адресованы `C;colColumnDisplayName_<имя>`, назначения —
`C;colColumnPurpose_<имя>`. Кэш строк содержит Name/Index/DataType/DataKind/
ColumnPurpose/IsUsed; сначала надо дождаться complete inventory.
Выбор строки и перерисовка настроек асинхронны: немедленный снимок может показать
старую либо пустую настройку. Убедиться в выбранной строке и settled value.

`S;cbxColumnPurpose;trg_picker` раскрывает строковые пункты «Не выбрано»,
«Входное», «Выходное». У наблюдённых ролей native codes 0/1/4;
публичной схеме нужны строки и имена полей, а не эти коды.
RowID/Note остались unused, Segment=input, Target=target.
Значение события yes задавалось в
`S;cbxEventValue;ValueContainer;txt-1` у выбранного Target.

| Control относительно S | Умолчание / предел UI | Проверенный выбор |
|---|---|---|
| `edtMinimalClassRate;ValueControl` | 5; 0…50 | 5 процентов |
| `edtDesiredClassCount;ValueControl` | 5; 1…1000 | 2 |
| `edtUniformityCoefficient;ValueControl` | 0; 0…100 | 0 процентов |
| `chkUseFineClassesBinning;ValueControl` | false у string/discrete | false |
| `chkPreQuanting;ValueControl` | control у continuous RowID | Только осмотр |
| `edtPreQuantingCount;ValueControl` | 0; UI 0…9007199254740991 | Только осмотр |
| `chkIncludeHighBounds;ValueControl` | control у continuous RowID | Только осмотр |

Значения UI min/max не доказывают все алгоритмические границы. Исследован только
один численный выбор 5/2/0, без начальных классов в качестве готового разбиения.
В сохранённых параметрах наблюдены `TBGCoarseClassesInputDiscreteParams`,
MinClassRate=5, MaxClassCount=2, EquabilityCoefficient=0, UseFineClassesBinning=false.

Отказ: у выбранного Segment задан max_classes=0, нажата Next;
переход остался на назначениях, причина из **`WizrdMCF;btnError/@data-qtip`**:
«Значение этого поля не может быть меньше 1». Тот же текст показан в диалоге
«Переход запрещен». После OK восстановлено 2, диагностический draft закрыт
без коммита. Это наблюдённая причина, не предположение по исходному коду.

На странице классов есть `CoarseClassesEditor`: таблицы `grdUsedColumns` и
`grdBinning`, поля `fldMinClassRate`, `fldCoarseClassCount`, `fldUniformityCoef`,
`btnCalculateIV` («Установить...»), ручное объединение/редактирование,
флаги сохранения разбиения. Они не входят в первый автоматический writer.
Состояние «Узел конечные классы не готов» до обучения не означает готовую модель.

## Обучение, применение, сохранение — наблюдено

Источник train.csv: 20 строк. Segment A имеет 2 события/8 не-событий,
B — 8/2; Target=yes — событие. Числа ниже независимо вычисляет Python oracle
из authored CSV: `WoE_i = ln((n_i/N)/(e_i/E))`,
`IV_i = (n_i/N - e_i/E) * WoE_i`, `IV = sum(IV_i)`.

Done сохраняет настройки. Штатная команда `ModelForm;btnRetrain` обучила узел
и активировала его; следующее нажатие Toggle может уже деактивировать его.
Проверять актуальную подсказку «Выполнить узел» / «Деактивировать узел».
Не использовать старый открытый preview как доказательство нового выполнения.
Для readback сохранённой модели открытие Settings активного узла требует
подтверждения деактивации; просмотренный draft надо закрывать без коммита.

| Класс | Category | Events | NonEvents | EventRate | NonEventRate | WoE | IV | Weight |
|---|---|---|---|---|---|---|---|---|
| 0 | B | 8 | 2 | 0.8 | 0.2 | -1.3862943611198906 | 0.8317766166719345 | 0.5 |
| 1 | A | 2 | 8 | 0.2 | 0.8 | +1.3862943611198906 | 0.8317766166719345 | 0.5 |

Общий IV = **1.663553233343869**, Significance = «Высокая».
Порядок class rows в этом примере — по возрастанию WoE, B затем A;
универсальное правило при ties/нулевых частотах не установлено.
EventRate на порте 1 — доля внутри класса, не e_i/E из формулы WoE.

В том же импорте заменён путь на holdout.csv с сохранением типов/схемы;
тот же узел выполнен без Train. RowID 101/102/103, Segment B/A/B,
Target весь NULL → номера **[0,1,0]**, метки [B]/[A]/[B].
Порты 1/2 сохранили обучение 20 строк, 10/10 и прежний IV, а не статистику
трёх новых строк. Сохранён .lgp, закрыт, штатно открыт, выполнен без Train:
повторно получены те же три строки и прежние классы/статистика.
Таким образом, apply без скрытого refit возможен, включая сохранение модели.

Собственные native cached preview, привязанные к видимой таблице и текущему порту,
сверены по всем ячейкам, типам и порядку с независимыми expected для train,
apply и reopened apply. Это discovery, не проверка точности production reader
или модельная приёмка. На этапе 1 нужны настоящий reader, CSV и cold.

## Точные схемы, NULL и порядок — наблюдено

Порт **0**, 7 полей:
`RowID integer, Segment string, Segment_ClassNum integer, Segment_ClassMark string,
Segment_ClassSignificant real, Target string, Note string`.
Производные поля следуют сразу за Segment; порядок строк исходный.
ClassSignificant равен **частному IV класса**, не WoE и не общему IV признака.
На train Note первой строки NULL, остальных — пустая строка; на holdout
Note = `"", NULL, "keep"`, Target=NULL. Значения сохранены раздельно.

Порт **1**, 17 полей:
`Group integer, ColumnName string, ColumnDisplayName string, ClassNumber integer,
UniqueValue string, ClassMark string, EventsCount integer, NonEventsCount integer,
EventRate real, NonEventRate real, LowerBound variant, UpperBound variant,
WoE real, IV real, Weight real, IncludeUpperBound boolean, PreQuantingApplied boolean`.
Group=0; ColumnName=ColumnDisplayName=Segment; метки классов именно `[B]`/`[A]`.
Обе границы Variant и оба Boolean-флага в этом дискретном примере **NULL**,
не false/0/пустая строка.

Порт **2**, 9 полей:
`ColumnName string, ColumnDisplayName string, EventsCount integer,
NonEventsCount integer, EventRate real, NonEventRate real, TotalEventsCount integer,
IV real, Significance string`. Одна строка Segment, 10/10, 0.5/0.5, Total=20.
Метаданные всех схем появились в выходных страницах ещё до обучения/Execute.
Публичный порт соответствует native Names DataSource/ClassParams/BinningParams.

Точность: UI отображает 2 знака, кэш native preview содержит double.
Предложенный допуск для Real **abs=1e-12, rel=1e-12**; целые, NULL, строки,
Boolean, имена и порядок — точно. Для меток колонок `label_any:true`, поскольку
задание их не предписывает; значения ClassMark/Significance сравниваются точно.
NULL/пустой/неизвестный predictor и нулевые частоты обучения не исследованы
численно; первый контракт должен отвергать их до мутации, не назначать
им придуманное сглаживание или новый класс. NULL цели поддержан только в apply.

## Предлагаемый контракт этапа 1

Один бинарный пример с одним string/discrete predictor. Новая схема
[parameter-schema.json](acceptance/parameter-schema.json) вкладывается в
`parameters.coarse_classes`; каждое поле имеет description, enum строковые.
Новый internal требует все поля; существующий internal без правок может
сохранить поддерживаемые настройки и явно переобучить текущий вход.
Apply разрешён только существующему узлу с материализованными классами,
`parameters:{}`, `inputs:[]`, `mappings:[]`, `finish:execute`.
Закрыть просмотренный draft без коммита, не вызывать Train. Читать **[0,1,2] явно**.
Внешнее/ручное/замороженное разбиение, continuous и управляющие переменные
не входят в регистрацию этапа 1; причины отказа должны объяснять ограничение.

Текст `NODE_TYPES.semantics` предлагается в [schema-size.mjs](acceptance/schema-size.mjs).
Компактный readback: `kind=coarse_classes`, mode, все 7 аналитических настроек,
ordered roles всех полей, settings/materialized, source node+port,
training=requested/not_requested, список классов number/category/mark/WoE/IV,
total IV и точные mappings портов 0/1/2. Для apply — settings_applied=false.
Не передавать в readback полные таблицы, native enum codes или квитанции.
Не заявлять persisted state только по Done; сохранение пакета проверяется отдельно.

W1 уже имеет native train и apply-образцы Binning/Linear Regression;
W2/W3 поддержаны `expected-outputs.mjs` и cold-check (tolerance, ordered,
node_id+output_port, Variant NULL). Необходимость общей алгоритмической правки
по наблюдённому бизнес-отказу не установлена. Этап 1 предполагает собственные
coarse-classes modules, аддитивную регистрацию/наблюдение своей страницы,
собственный справочный файл навыка и сценарии run-check. Если потребуется иная
общая правка — остановиться по правилам карточки, не расширять её молча.

Оценка — **2 цикла реализации**: роли/автоматическое обучение/три выхода;
saved-model apply и save/reopen/cold. Затем приёмка train/apply: исполнитель
≥2/3 и независимая проверка ≥2/3 на одном SHA разными аккаунтами.
Это оценка объёма, не обещание завершить всю матрицу в одном назначении.

## Размеры предложения

Из корня checkout, `node …/acceptance/schema-size.mjs`; JSON.stringify UTF-8,
полная схема взята из текущего кода, карта типа — клон настоящего describe
с новым schema/semantics и пустыми session pins. Runtime-регистрация отсутствует;
реальные pins и окончательный readback могут увеличить ответ и требуют повторного
измерения этапа 1. Компактная схема измеряет inputSchema, не весь каталог tools.

| Объект | Байты | Бюджет |
|---|---|---|
| Full apply базы → предложение | 40219 → 42009 (+1790) | Только измерение |
| Compact apply базы → предложение | 11933 → 11964 | ≤20000 |
| Карточка типа describe | 3603 | ≤12000 |
| Сам объект parameter_schema | 1741 | Входит в карточку |
| SKILL.md базы | 49525 | ≤40000: уже превышен на 9525 |
| Строка маршрутизации | 162 | ~200 |
| SKILL.md с этой строкой | 49687 | Превышен на 9687 |
| Собственный файл узла | 3537 | ≤6000 |

Превышение основного навыка — пункт отчёта этапа 0 по решению
model-visible-budgets, не основание менять общий skill в этом docs-PR.
Предлагаемые тексты находятся в acceptance/skill-routing.txt и skill-node.md.

Справочные определения отдельно от live/oracle:
[описание компонента и выходов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes.html),
[назначения и настройки](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-column-usage-types.html),
[формула IV](https://wiki.loginom.ru/articles/information-value.html).
Эти страницы не используются генератором expected и не являются численным oracle.


## LAB-1055: frozen и карантин категорий, mas3

07.11.2026, Loginom 7.4.2, Chromium 1246, только app.loginom.ai/app/?testable=true;
worker пары `01a124e5-1e74-70ef-b9ea-b289e04cf35c`. База назначения v040@3ff0d88;
#851 открыт, начало ветки coverage-binning-modes@266c9a0ab. Собственные coarse-classes
модули в этих точках совпадают. Runtime и CLI не менялись; continuous/manual,
утверждённые назначением, повторно не принимались.

Источник train.csv физически подключён к Input_Data-0. На странице
`CoarseClassesWizard-1` Segment=input, Target=target, event=yes, остальные unused.
В `CoarseClassesWizard-2` нужно штатно активировать вход кнопкой
`btnActivationPortVisualizer`; до этого пустой редактор не доказывает отсутствие
модели. После активации `CoarseClassesEditor;grdUsedColumns` содержит Segment,
два класса, 10 событий/10 не-событий, IV=1.663553233343869.

**Frozen: наблюдено переключение UI.** TID
`CoarseClassesWizard-2;CoarseClassesEditor;colColumnUsePrevBinning_Segment`.
Его клик изменил cached-запись выбранного признака `IsLocked:false → true`,
Count=2, IsEdited=false. Нельзя объявлять этот режим отсутствующим. Save/reopen этого флага и неизменность классов при переобучении
пока не доказаны; их нельзя выводить из одного checkbox. После Done и штатного
Train порт 1 содержал B/номер 0, 8/2, WoE=-ln(4), IV=0.6*ln(4), и A/номер 1,
2/8, WoE=ln(4), тот же IV. Типы/17 полей совпали с прежней схемой, обе Variant
границы и Boolean-флаги NULL. Это проверка materialized-модели для последующего
исследования, не новый PASS ранее принятого дискретного режима.

**Unknown/NULL вместе: наблюден нативный отказ.** Файл того же импорта сменён
на unseen.csv без Train классов. Входной preview проверен до Done по
`ImportTextFileParamsWizard;ColumnDefsTuning;grdData;grd-1;tbl`: 101/A/NULL/known,
102/Z/NULL/new, 103/NULL/NULL/null-category. Новое выполнение прежнего узла
завершилось FStatus=4. В принадлежащей этому узлу записи 13.2 (Status=5)
`ConsoleForm;ProgressForm;trpProgress;treepanel;tree` ErrorDetails:
«При расчете списка уникальных значений возникли ошибки».
Три новых выхода не подтверждены. Гипотеза expected-unseen.json (все производные
NULL для Z/NULL) остаётся карантинной; это не численный PASS и не доказательство,
какой именно фактор вызывает отказ. Unknown отдельно, NULL отдельно и сочетание
с NULL цели — `not_checked`, требуется раздельный опыт. Один отказ discovery
не объявляется воспроизводимым дефектом обработчика.

Первый столбец ручного источника получил технический alias
RowID_Segment_Target_Note при начальном распознавании заголовка; его значения
проверены, он unused. Этот опыт не засчитывает полную таблицу expected.json,
где требуется RowID. Переименование fixture или ослабление matcher не предлагается.
Ранний ввод нового пути до загрузки старых настроек был перезаписан native binding;
опыт со старыми 20 строками исключён. Для состоявшейся смены сначала дождались
сохранённого getValue старого пути, затем отдельно подтвердили новый путь и три
строки входа. Это барьер готовности UI, не новый режим классов.

Предложения остаются в acceptance/modes; модели — только task и CSV, без oracle.
Оценка этапа 1 — 3 цикла в собственных coarse-classes-{parameters,context,procedure,
readback,node,output}.mjs: native frozen/external mapping; сохранение/применение;
карантинные случаи после отдельных доказательств. Аддитивные type/schema/input
регистрации допустимы. Необходимость иной общей правки не установлена.


### Нулевые частоты и frozen-переобучение

После mixed-отказа источник того же импорта сменён на zero-frequency.csv;
входной preview подтвердил четыре строки A/yes, A/yes, B/no, B/no без NULL.
Вызван отдельный штатный Train того же узла с ранее установленным IsLocked=true.
После него собственный узел FStatus=1, FRunning=false. Вновь открытые видимые
preview-формы привязаны к FCurrentPreviewNode и FCurrentPreviewPort; скрытые
DataSetForm из cache не используются для чтения другого порта.

Порт 0: A остаётся классом 1/[A], B — 0/[B], по четыре исходных строки.
Порт 1: B/0 имеет EventsCount=0, NonEventsCount=2, EventRate=0, NonEventRate=1,
WoE=ln(8)=2.0794415416798357, IV=1.8195113489698562; A/1 — 2/0, 1/0,
WoE=-ln(8), такой же IV. Weight=0.5, обе Variant границы и Boolean-флаги NULL.
Порт 2: 2/2, доли 0.5/0.5, TotalEventsCount=4, IV=3.6390226979397124,
«Высокая». Состав/номера/метки прежних классов сохранились при изменении частот;
это численное наблюдение frozen-переобучения, Save/reopen ещё не проверен.

Additive alpha=0.5 с перенормировкой предсказал бы ±ln(5), а не наблюдённые ±ln(8).
Гипотеза не продвигается. Независимый новый expected-frozen-zero.json предлагает
для данного N=4 epsilon=1/(2*N)=1/8 только вместо нулевой доли, ненулевые доли
сохраняются. Все значения трёх портов совпали с Decimal-oracle с max abs 4.45e-16;
переименование alias в RowID выполнялось только для диагностического сравнения,
это не изменение expected/matcher и не приёмочный PASS. В исследованной конфигурации
max_classes=5 (default), приёмочное предложение использует уже поддержанный 2.
Универсальная формула для другого N, числа классов и иных нулевых комбинаций —
not_checked. Нового alpha-control в исследованной панели не наблюдалось.


### Внешнее разбиение: порты и страница назначения

В новом собственном узле `Graph;Конечные_классы;Input_Add` создал второй
табличный вход с native TID `Input_Data-2` (основной Input_Data-0; публичный
табличный индекс дополнительного входа — 1). Стоковый порт 1 первого обученного
узла с 17 полями классов физически подключён к этому входу; основной zero-source
подключён отдельно к Input_Data-0. Это не объявленная вручную входная схема.

Первой появилась страница `WizrdMCF;CoarseClassesWizard` без суффикса -1,
таблица `grdExternalBinningLinks`. В ней реальные исходные поля, их типы и роль
`colInputRangesColumnKind_<index>`; `colAutoMappingColumnKind` имеет tooltip
«Установить связи автоматически». После клика auto-map: ColumnName → kind 1
(идентификатор), ClassNumber → 2 (номер класса), UniqueValue → 3,
UpperBound (Variant) → 4, IncludeUpperBound (Boolean) → 5; остальные 12 полей
не используются (kind 0). Значит, внешний вход не копирует слепо всю 17-польную
таблицу со статистиками/метками: ему нужны назначения исходных столбцов.
Next принял эту карту и открыл обычную страницу ролей CoarseClassesWizard-1.
На этом промежуточном шаге исполнение ещё не проверено; итог отдельного
выполнения ниже. Минимальный CSV с тремя полями остаётся not_checked.


На следующей странице для Segment включён
`CoarseClassesSettingsFrame;chkUseFineClassesBinning;ValueControl` (готовое
разбиение), min=5/max=2/uniformity=0; Target=target, event=yes.
После активации входов редактор показал два класса, IsLocked=true,
TotalIV=3.6390226979397124. После Done и Train второй узел выполнился.
Числа всех трёх портов совпали с новым expected-external.json с max abs 4.45e-16
(оговорка о source alias сохраняется). **Внешние номера не сохраняются:**
предоставленная таблица имела B=0/A=1, а output дал A=0/B=1 по возрастанию WoE.
Это отличается от внутреннего frozen-переобучения, где B=0/A=1 сохранились.
Оба external-класса singleton; неоднозначность равных WoE и предоставленный
класс с несколькими категориями не исследованы.

Предложены task-external-frozen.md и минимальный external-classes.csv
(ColumnName,ClassNumber,UniqueValue). Внешний oracle читает эту таблицу и
основные четыре строки; частоты и WoE/IV вычисляет независимо, для различных
WoE нумерует выход по их возрастанию. Минимальный трёхпольный CSV в UI не
испытывался: фактический опыт использовал готовый 17-польный native-порт.
Контрастный пример с несколькими категориями в одном заданном классе,
external с оптимизацией вместо готового разбиения, numeric external и
Save/reopen внешней карты — not_checked. Текущий singleton-пример не является
единственным достаточным критерием внешнего режима.


Checkpoint LAB-1055: после второго разрыва связи исследование остановлено.
Раздельные Unknown/NULL, другой N для zero-correction, многокатегорийный внешний
класс и persistence внешней карты/frozen — not_checked: лимит переподключений.
Восстановление использовано только для Save/закрытия своего пакета/logout.
