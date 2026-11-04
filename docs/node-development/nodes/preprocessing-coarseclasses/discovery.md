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
