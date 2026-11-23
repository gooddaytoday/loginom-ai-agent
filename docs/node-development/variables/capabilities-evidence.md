# Выдержки исследования LAB-828

04.11.2026. Исходник — операторский `ui.jsonl`, строки нумеруются с 1. Полный журнал остаётся вне Git. Ниже — отобранные DOM/TID и подписи, без сырых квитанций, профилей, учётных данных и серверных ответов. Префикс мастера в этом сеансе `MF;TF-1;WizrdMCF;`; он не является стабильной identity.

Это наблюдение UI, не автоматическая приёмка. Нажатие Next не означает выполнение узла. Пустая строка списка переключателей означает, что они не наблюдались на просмотренных страницах; это не отрицательный результат для всех режимов компонента.

Палитра пяти переменных и пяти управляющих компонентов: `ui.jsonl:2`, 04.11.2026 14:35 UTC. Версия и URL: `ui.jsonl:1`.

## imports-text

**Текстовый импорт**, `imports.text`. Источник: `ui.jsonl:44`, `ui.jsonl:45`, `ui.jsonl:235`, `ui.jsonl:236`, `ui.jsonl:237`, `ui.jsonl:238`.

Собственный CSV загружен по FileCsv; просмотрены форматы и mapping, выполнено чтение.

Страницы: «Импорт из текстового файла» → «Настройка форматов импорта» → «Настройка соответствия между столбцами» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Имя файла / URL | `ImportTextFilePreviewWizard;edtFileName;SwitchButton` | 44 |
| Параллельная обработка | `ImportTextFilePreviewWizard;chkParallelProcessing;SwitchButton` | 44 |
| Макс. кол-во потоков | `ImportTextFilePreviewWizard;cbbMaxThreadCount;SwitchButton` | 44 |
| Кодовая страница | `ImportTextFilePreviewWizard;edtCodePage;SwitchButton` | 44 |
| Заголовок в первой строке | `ImportTextFilePreviewWizard;edtFirstLineAsTitle;SwitchButton` | 44 |
| Пропустить строк | `ImportTextFilePreviewWizard;edtRowsToSkip;SwitchButton` | 44 |
| Разделитель столбцов | `ImportTextFileParamsWizard;edtDelimiterChar;SwitchButton` | 236 |
| Считать последовательные разделители одним | `ImportTextFileParamsWizard;edtMultipleDelimiters;SwitchButton` | 236 |
| Ограничитель строк | `ImportTextFileParamsWizard;edtTextQualifier;SwitchButton` | 236 |
| Пусто | `ImportTextFileParamsWizard;edtValueNull;SwitchButton` | 236 |
| Переменный тип | `ImportTextFileParamsWizard;edtVariantAsGeneralType;SwitchButton` | 236 |
| Десятичный разделитель | `ImportTextFileParamsWizard;edtDecimalSeparator;SwitchButton` | 236 |
| Формат даты | `ImportTextFileParamsWizard;edtDateFormat;SwitchButton` | 236 |
| Разделитель даты | `ImportTextFileParamsWizard;edtDateSeparator;SwitchButton` | 236 |
| Разделитель времени | `ImportTextFileParamsWizard;edtTimeSeparator;SwitchButton` | 236 |
| Истина | `ImportTextFileParamsWizard;edtValueTrue;SwitchButton` | 236 |
| Ложь | `ImportTextFileParamsWizard;edtValueFalse;SwitchButton` | 236 |

## transform-calculator

**Калькулятор**, `transform.calculator`. Источник: `ui.jsonl:32`, `ui.jsonl:35`, `ui.jsonl:36`, `ui.jsonl:37`.

Вставка Var.Amount и reopen; новое выполнение выражения отдельно не принималось.

Обычный вход переменных → Var.Amount в выражении; control-вход отдельно.

## transform-reform_columns

**Параметры полей**, `transform.reform_columns`. Источник: `ui.jsonl:62`, `ui.jsonl:63`.

Просмотренный путь мастера; дополнительные режимы не принимались.

Страницы: «Настройка параметров полей» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Кэширование | `ReformColumnsWizard;pedDataSourceCachingMethod;SwitchButton` | 62 |

## transform-filter_data

**Фильтр строк**, `transform.filter_data`. Источник: `ui.jsonl:14`, `ui.jsonl:17`, `ui.jsonl:18`, `ui.jsonl:19`, `ui.jsonl:20`, `ui.jsonl:219`, `ui.jsonl:220`, `ui.jsonl:221`.

Scalar integer: изменение Limit 5→9 изменило выход для Amount=7; списки/интервалы и прочие типы отдельно.

Значение scalar сравнения → переменная соответствующего типа.

## transform-group_data

**Группировка**, `transform.group_data`. Источник: `ui.jsonl:27`, `ui.jsonl:28`, `ui.jsonl:29`, `ui.jsonl:30`.

Основная страница; вложенные редакторы агрегатов не исчерпаны.

Кэшировать значения групп; Сортировать результирующие данные.

## transform-sorting

**Сортировка**, `transform.sorting`. Источник: `ui.jsonl:22`, `ui.jsonl:23`, `ui.jsonl:24`.

Основная страница и строка ключа Text; у направления/регистра ключа SwitchButton не наблюдён.

Сравнивать с учётом локали; Кэшировать все данные; Максимальное количество потоков.

## transform-join_data

**Слияние**, `transform.join_data`. Источник: `ui.jsonl:66`, `ui.jsonl:67`, `ui.jsonl:68`.

Просмотренный путь мастера; дополнительные режимы не принимались.

Страницы: «Настройка входных столбцов» → «Настройка слияния данных» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Тип операции | `JoinDataWizard;pedJoinType;SwitchButton` | 67 |
| Учитывать регистр | `JoinDataWizard;chbCaseSensitive;SwitchButton` | 67 |

## transform-union_data

**Объединение**, `transform.union_data`. Источник: `ui.jsonl:71`, `ui.jsonl:72`, `ui.jsonl:73`.

Просмотренный путь мастера; дополнительные режимы не принимались.

Страницы: «Настройка входных столбцов» → «Объединение» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Префикс имени | `UnionDataWizard;pedNamePrefix;SwitchButton` | 72 |
| Префикс метки | `UnionDataWizard;pedDisplayNamePrefix;SwitchButton` | 72 |

## transform-replace_columns

**Замена**, `transform.replace_columns`. Источник: `ui.jsonl:76`, `ui.jsonl:77`, `ui.jsonl:78`, `ui.jsonl:259`, `ui.jsonl:260`, `ui.jsonl:277`.

Основной путь, mapping, выбран Amount; видны cbxReplaceOther/edPrecision/chkCaseSensitivity без SwitchButton; редактор конкретного правила не активирован.

Страницы: «Замена» → «Настройка соответствия между столбцами» → «Описание узла».

На этих страницах видимый `SwitchButton` не зафиксирован.

## research-duplicates

**Дубликаты и противоречия**, `research.duplicates`. Источник: `ui.jsonl:81`, `ui.jsonl:82`.

Путь назначения полей → описание; другие конфигурации не исчерпаны.

Страницы: «Настройка входных столбцов» → «Описание узла».

На этих страницах видимый `SwitchButton` не зафиксирован.

## transform-date_time

**Дата и время**, `transform.date_time`. Источник: `ui.jsonl:85`, `ui.jsonl:86`, `ui.jsonl:216`, `ui.jsonl:262`.

Просмотрен When:datetime=NULL и таблица операций разбиения/начала/конца периода/числа/строки; без выполнения преобразований.

Страницы: «Преобразование даты/времени» → «Описание узла».

На этих страницах видимый `SwitchButton` не зафиксирован.

## preprocessing-data_recovery

**Заполнение пропусков**, `preprocessing.data_recovery`. Источник: `ui.jsonl:89`, `ui.jsonl:90`, `ui.jsonl:91`, `ui.jsonl:270`.

Основная страница и выбранное Amount с методом случайного значения; без заполнения пропусков.

Страницы: «Заполнение пропусков» → «Настройка соответствия между столбцами» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Исходные данные упорядочены | `DataRecoveryWizard;pedOrderedSample;SwitchButton` | 89 |
| Допустимый процент пропусков | `DataRecoveryWizard;pedMaxNullsPercent;SwitchButton` | 89 |
| Random seed | `DataRecoveryWizard;RandSeedEdit;edtRandSeed;SwitchButton` | 89 |

## transform-collapse_columns

**Свёртка столбцов**, `transform.collapse_columns`. Источник: `ui.jsonl:94`, `ui.jsonl:95`.

Основная страница; назначения и группы полей отдельно.

Страницы: «Свертка столбцов» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Игнорировать пустые значения | `ColumnFlippingWizard;pedSkipNullCases;SwitchButton` | 94 |

## exports-text

**Текстовый экспорт**, `exports.text`. Источник: `ui.jsonl:48`, `ui.jsonl:49`, `ui.jsonl:50`.

FileCsv выбран через SwitchButton, Done и штатное выполнение; созданный собственный файл прочитан импортом.

Страницы: «Настройка входных столбцов» → «Экспорт в текстовый файл».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Имя файла | `ExportTextFileParamsWizard;edtFileName;SwitchButton` | 49 |
| Ограничитель строк | `ExportTextFileParamsWizard;edtTextQualifier;SwitchButton` | 49 |
| Десятичный разделитель | `ExportTextFileParamsWizard;edtDecimalSeparator;SwitchButton` | 49 |
| Разделитель даты | `ExportTextFileParamsWizard;edtDateSeparator;SwitchButton` | 49 |
| Разделитель времени | `ExportTextFileParamsWizard;edtTimeSeparator;SwitchButton` | 49 |
| Истина | `ExportTextFileParamsWizard;edtValueTrue;SwitchButton` | 49 |
| Ложь | `ExportTextFileParamsWizard;edtValueFalse;SwitchButton` | 49 |
| Пусто | `ExportTextFileParamsWizard;edtValueNull;SwitchButton` | 49 |
| Формат даты | `ExportTextFileParamsWizard;edtDateFormat;SwitchButton` | 49 |
| Формат времени | `ExportTextFileParamsWizard;edtTimeFormat;SwitchButton` | 49 |

## datamining-clustering

**Кластеризация**, `datamining.clustering`. Источник: `ui.jsonl:98`, `ui.jsonl:99`, `ui.jsonl:100`, `ui.jsonl:101`.

Default-ветка настройки; обучение не выполнялось.

Страницы: «Настройка входных столбцов» → «Настройки нормализации» → «Кластеризация».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Автоопределение числа кластеров | `ClusterizationWizard;pedAutoClusters;SwitchButton` | 100 |
| Число кластеров | `ClusterizationWizard;pedClusters;SwitchButton` | 100 |
| Минимальное число кластеров | `ClusterizationWizard;pedClustersMin;SwitchButton` | 100 |
| Максимальное число кластеров | `ClusterizationWizard;pedClustersMax;SwitchButton` | 100 |
| Порог разделения кластеров | `ClusterizationWizard;pedThreshold;SwitchButton` | 100 |
| Random seed | `ClusterizationWizard;RandSeedEdit;edtRandSeed;SwitchButton` | 100 |

## datamining-lin_regression

**Линейная регрессия**, `datamining.lin_regression`. Источник: `ui.jsonl:104`, `ui.jsonl:105`, `ui.jsonl:106`, `ui.jsonl:107`, `ui.jsonl:108`, `ui.jsonl:209`.

Основная и детальная страницы; для второй отключена автонастройка, включён UseDetailedSettings; без обучения.

Страницы: «Настройка входных столбцов» → «Настройки нормализации» → «Разбиение на множества» → «Настройка линейной регрессии» → «Детальная настройка линейной регрессии».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Размер в процентах | `LearnPartitionWizard;SizeGridForm;colRelativeSize;FloatPropEdit;SwitchButton` | 106 |
| Размер в строках | `LearnPartitionWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit;SwitchButton` | 106 |
| Размер в процентах | `LearnPartitionWizard;SizeGridForm;colRelativeSize;FloatPropEdit-1;SwitchButton` | 106 |
| Размер в строках | `LearnPartitionWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit-1;SwitchButton` | 106 |
| Random seed | `LearnPartitionWizard;RandSeedEdit;edtRandSeed;SwitchButton` | 106 |
| Автоматическая настройка | `LinRegressionWizard;pedAutoMethod;SwitchButton` | 107 |
| Приоритет автоматической настройки | `LinRegressionWizard;pedAutoPriority;SwitchButton` | 107 |
| Отбор факторов и защита от переобучения | `LinRegressionWizard;pedRegressionMethod;SwitchButton` | 107 |
| Приоритет точность/скорость | `LinRegressionWizard;pedQualitySpeed;SwitchButton` | 107 |
| Приоритет точные/недостоверные данные | `LinRegressionWizard;pedExactInexact;SwitchButton` | 107 |
| Приоритет меньше/больше факторов | `LinRegressionWizard;pedFactLessMore;SwitchButton` | 107 |
| Денормализировать коэффициенты модели | `LinRegressionWizard;pedDenormalize;SwitchButton` | 107 |
| Использовать детальные настройки | `LinRegressionWizard;pedUseDetailedSettings;SwitchButton` | 107 |
| Показывать коэффициенты опорных категорий | `LinRegressionWizard;pedShowRefCoeffs;SwitchButton` | 107 |
| Точность решения | `LinRegressionWizard-1;pedEpsilon;SwitchButton` | 209 |
| Включить в модель константу | `LinRegressionWizard-1;pedIntercept;SwitchButton` | 209 |
| Уровень доверия, % | `LinRegressionWizard-1;pedPredictionIntervalLevel;SwitchButton` | 209 |
| Установка коэффициента L1-регуляризации | `LinRegressionWizard-1;pedLassoSetupMethod;SwitchButton` | 209 |
| Коэффициент L1-регуляризации | `LinRegressionWizard-1;pedLambdaLasso;SwitchButton` | 209 |
| Установка коэффициента L2-регуляризации | `LinRegressionWizard-1;pedRidgeSetupMethod;SwitchButton` | 209 |
| Коэффициент L2-регуляризации | `LinRegressionWizard-1;pedLambdaRidge;SwitchButton` | 209 |
| Критерий отбора факторов | `LinRegressionWizard-1;pedRegSelQuality;SwitchButton` | 209 |
| Порог значимости при добавлении фактора | `LinRegressionWizard-1;pedAddSignificance;SwitchButton` | 209 |
| Порог значимости при исключении фактора | `LinRegressionWizard-1;pedRemoveSignificance;SwitchButton` | 209 |

## datamining-log_regression

**Логистическая регрессия**, `datamining.log_regression`. Источник: `ui.jsonl:111`, `ui.jsonl:112`, `ui.jsonl:113`, `ui.jsonl:114`, `ui.jsonl:115`, `ui.jsonl:212`.

Основная и детальная страницы; для второй отключена автонастройка, включён UseDetailedSettings; без обучения.

Страницы: «Настройка входных столбцов» → «Настройки нормализации» → «Разбиение на множества» → «Настройка логистической регрессии» → «Детальная настройка логистической регрессии».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Размер в процентах | `LearnPartitionWizard;SizeGridForm;colRelativeSize;FloatPropEdit;SwitchButton` | 113 |
| Размер в строках | `LearnPartitionWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit;SwitchButton` | 113 |
| Размер в процентах | `LearnPartitionWizard;SizeGridForm;colRelativeSize;FloatPropEdit-1;SwitchButton` | 113 |
| Размер в строках | `LearnPartitionWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit-1;SwitchButton` | 113 |
| Random seed | `LearnPartitionWizard;RandSeedEdit;edtRandSeed;SwitchButton` | 113 |
| Тип события | `LogRegressionWizard;pedEventType;SwitchButton` | 114 |
| Индекс заданного события | `LogRegressionWizard;pedEventId;SwitchButton` | 114 |
| Автоматическая настройка | `LogRegressionWizard;pedAutoMethod;SwitchButton` | 114 |
| Приоритет автоматической настройки | `LogRegressionWizard;pedAutoPriority;SwitchButton` | 114 |
| Отбор факторов и защита от переобучения | `LogRegressionWizard;pedRegressionMethod;SwitchButton` | 114 |
| Приоритет точность/скорость | `LogRegressionWizard;pedQualitySpeed;SwitchButton` | 114 |
| Приоритет точные/недостоверные данные | `LogRegressionWizard;pedExactInexact;SwitchButton` | 114 |
| Приоритет меньше/больше факторов | `LogRegressionWizard;pedFactLessMore;SwitchButton` | 114 |
| Денормализировать коэффициенты модели | `LogRegressionWizard;pedDenormalize;SwitchButton` | 114 |
| Использовать детальные настройки | `LogRegressionWizard;pedUseDetailedSettings;SwitchButton` | 114 |
| Показывать коэффициенты опорных категорий | `LogRegressionWizard;pedShowRefCoeffs;SwitchButton` | 114 |
| Точность решения | `LogRegressionWizard-1;pedEpsilon;SwitchButton` | 212 |
| Порог отсечения | `LogRegressionWizard-1;pedThreshold;SwitchButton` | 212 |
| Включить в модель константу | `LogRegressionWizard-1;pedIntercept;SwitchButton` | 212 |
| Уровень доверия, % | `LogRegressionWizard-1;pedPredictionIntervalLevel;SwitchButton` | 212 |
| Установка коэффициента L1-регуляризации | `LogRegressionWizard-1;pedLassoSetupMethod;SwitchButton` | 212 |
| Коэффициент L1-регуляризации | `LogRegressionWizard-1;pedLambdaLasso;SwitchButton` | 212 |
| Установка коэффициента L2-регуляризации | `LogRegressionWizard-1;pedRidgeSetupMethod;SwitchButton` | 212 |
| Коэффициент L2-регуляризации | `LogRegressionWizard-1;pedLambdaRidge;SwitchButton` | 212 |
| Критерий отбора факторов | `LogRegressionWizard-1;pedRegSelQuality;SwitchButton` | 212 |
| Порог значимости при добавлении фактора | `LogRegressionWizard-1;pedAddSignificance;SwitchButton` | 212 |
| Порог значимости при исключении фактора | `LogRegressionWizard-1;pedRemoveSignificance;SwitchButton` | 212 |

## exports-excel

**Экспорт — Excel файл**, `exports.excel`. Источник: `ui.jsonl:57`, `ui.jsonl:58`, `ui.jsonl:59`.

FileXlsx выбран через SwitchButton, Done и штатное выполнение; собственный XLSX прочитан импортом.

Страницы: «Настройка входных столбцов» → «Экспорт в Excel файл».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Имя файла | `ExportExcelFilePreviewWizard;edtFileName;SwitchButton` | 58 |
| Имя листа | `ExportExcelFilePreviewWizard;edtSheetName;SwitchButton` | 58 |
| Тип файла Excel | `ExportExcelFilePreviewWizard;cbbFileType;SwitchButton` | 58 |
| Строка заголовков | `ExportExcelFilePreviewWizard;cbbHeadersRow;SwitchButton` | 58 |

## imports-excel

**Импорт — Excel файл**, `imports.excel`. Источник: `ui.jsonl:53`, `ui.jsonl:54`, `ui.jsonl:241`, `ui.jsonl:242`, `ui.jsonl:243`, `ui.jsonl:244`.

Собственный XLSX загружен по FileXlsx; просмотрен доступный путь до завершения.

Страницы: «Импорт из Excel файла» → «Настройка полей» → «Настройка соответствия между столбцами» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Имя файла / URL | `ImportExcelFilePreviewWizard;edtFileName;SwitchButton` | 53 |
| Параллельная обработка | `ImportExcelFilePreviewWizard;chkParallelProcessing;SwitchButton` | 53 |
| Макс. кол-во потоков | `ImportExcelFilePreviewWizard;cbbMaxThreadCount;SwitchButton` | 53 |
| Выбор объекта | `ImportExcelFilePreviewWizard;cbbTableNamingMethod;SwitchButton` | 53 |
| Имя объекта | `ImportExcelFilePreviewWizard;cbbTableName;SwitchButton` | 53 |
| Весь лист | `ImportExcelFilePreviewWizard;chkUsedRange;SwitchButton` | 53 |
| Стиль ссылок R1C1 A1 | `ImportExcelFilePreviewWizard;cbbReferenceStyle;SwitchButton` | 53 |
| Диапазон | `ImportExcelFilePreviewWizard;edtExplicitRange;SwitchButton` | 53 |
| До последней строки | `ImportExcelFilePreviewWizard;chkAllRows;SwitchButton` | 53 |
| Пустые строки | `ImportExcelFilePreviewWizard;cbbActionBlankRow;SwitchButton` | 53 |
| Количество строк заголовка | `ImportExcelFilePreviewWizard;edtTitleRowCount;SwitchButton` | 53 |

## integration-rest_request

**REST-запрос**, `integration.rest_request`. Источник: `ui.jsonl:167`, `ui.jsonl:168`, `ui.jsonl:169`, `ui.jsonl:170`, `ui.jsonl:171`.

Просмотрены четыре страницы; query-поведение — прежний discovery.

Страницы: «Настройка входных столбцов» → «Настройка запроса» → «Настройка пользовательских заголовков» → «Дополнительные параметры» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Выдавать описание кодов завершения | `AdditionalParamsWizard;pedProduceErrorDescs;SwitchButton` | 170 |
| Задержка между запросами (мс) | `AdditionalParamsWizard;pedRequestDelayMS;SwitchButton` | 170 |
| Количество повторных запросов при ошибке | `AdditionalParamsWizard;pedFailedRequestRepeat;SwitchButton` | 170 |
| Задержка между неудачными запросами (мс) | `AdditionalParamsWizard;pedFailedRequestDelayMS;SwitchButton` | 170 |
| Общий тайм-аут (с) | `AdditionalParamsWizard;pedTimeout;SwitchButton` | 170 |
| Сохранять текст запроса в папку | `AdditionalParamsWizard;pedDumpRequest;SwitchButton` | 170 |
| Имитировать запрос с ответом в файле | `AdditionalParamsWizard;pedUseResponseStub;SwitchButton` | 170 |

## preprocessing-binning

**Квантование**, `preprocessing.binning`. Источник: `ui.jsonl:118`, `ui.jsonl:119`, `ui.jsonl:251`, `ui.jsonl:252`, `ui.jsonl:253`, `ui.jsonl:254`.

Вход активирован, раскрыта строка Amount: Количество, Ширина, Плитка, Коэффициенты СКО; без расчёта границ.

Страницы: «Настройки компонента квантования».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Количество | `MethodSettingFrame;cbbCountBins;SwitchButton` | 251 |
| Нижняя граница | `MethodSettingFrame;edtLowerLimit;SwitchButton` | 251 |
| Верхняя граница | `MethodSettingFrame;edtUpperLimit;SwitchButton` | 251 |
| Нижняя граница открыта | `MethodSettingFrame;chkLowerLimitOpen;SwitchButton` | 251 |
| Верхняя граница открыта | `MethodSettingFrame;chkUpperLimitOpen;SwitchButton` | 251 |
| Ширина | `MethodSettingFrame;edtBinWidth;SwitchButton` | 252 |
| Количество | `MethodSettingFrame;cbbTileCount;SwitchButton` | 253 |
| Совпадающие наблюдения | `MethodSettingFrame;cbbMatchingObservationsMode;SwitchButton` | 253 |
| Из сумм значений | `MethodSettingFrame;chkSummTile;SwitchButton` | 253 |
| От среднего | `MethodSettingFrame;cbbSDBinsMode;SwitchButton` | 254 |

## preprocessing-data_partition

**Разбиение на множества**, `preprocessing.data_partition`. Источник: `ui.jsonl:122`, `ui.jsonl:123`.

Просмотренный путь мастера; дополнительные режимы не принимались.

Страницы: «Разбиение на множества» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Размер в процентах | `PartitionComponentWizard;SizeGridForm;colRelativeSize;FloatPropEdit;SwitchButton` | 122 |
| Размер в строках | `PartitionComponentWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit;SwitchButton` | 122 |
| Размер в процентах | `PartitionComponentWizard;SizeGridForm;colRelativeSize;FloatPropEdit-1;SwitchButton` | 122 |
| Размер в строках | `PartitionComponentWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit-1;SwitchButton` | 122 |
| Положение приоритетного тестового множества | `PartitionComponentWizard;pedTestPriorityPosition;SwitchButton` | 122 |
| Random seed | `PartitionComponentWizard;RandSeedEdit;edtRandSeed;SwitchButton` | 122 |

## preprocessing-elim_outlier

**Редактирование выбросов**, `preprocessing.elim_outlier`. Источник: `ui.jsonl:126`, `ui.jsonl:127`, `ui.jsonl:271`, `ui.jsonl:272`.

Выбран Amount; раскрыты СКО и интерквартильный метод, действия и значения замены; без обработки выбросов.

Страницы: «Редактирование выбросов» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Исходные данные упорядочены | `ElimOutlierWizard;pedOrderedSample;SwitchButton` | 126 |
| Порог СКО для выброса | `ElimOutlierWizard;pedDetectOSko;SwitchButton` | 271 |
| Порог СКО для экстремального | `ElimOutlierWizard;pedDetectESko;SwitchButton` | 271 |
| Действие для выброса | `ElimOutlierWizard;pedActionOut;SwitchButton` | 271 |
| Заменять выброс на | `ElimOutlierWizard;pedSettedValueOut;SwitchButton` | 271 |
| Действие для экстремального | `ElimOutlierWizard;pedActionExtr;SwitchButton` | 271 |
| Заменять экстремальное на | `ElimOutlierWizard;pedSettedValueExtr;SwitchButton` | 271 |
| Порог интерквартильной ширины для выброса | `ElimOutlierWizard;pedDetectOKvartil;SwitchButton` | 272 |
| Порог интерквартильной ширины для экстремального | `ElimOutlierWizard;pedDetectEKvartil;SwitchButton` | 272 |

## preprocessing-sampling

**Сэмплинг**, `preprocessing.sampling`. Источник: `ui.jsonl:130`, `ui.jsonl:131`.

Основная страница, редакторы процентов/строк; без расчёта случайной выборки.

Страницы: «Сэмплинг данных» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Размер в процентах | `SamplingComponentWizard;SizeGridForm;colRelativeSize;FloatPropEdit;SwitchButton` | 130 |
| Размер в строках | `SamplingComponentWizard;SizeGridForm;colAbsoluteSize;FloatPropEdit;SwitchButton` | 130 |
| Random seed | `SamplingComponentWizard;RandSeedEdit;edtRandSeed;SwitchButton` | 130 |

## preprocessing-smoothing

**Сглаживание**, `preprocessing.smoothing`. Источник: `ui.jsonl:134`, `ui.jsonl:135`, `ui.jsonl:256`, `ui.jsonl:257`.

Выбран Amount; просмотрены фильтр Ходрика–Прескотта и вейвлет-сглаживание; без расчёта ряда.

Страницы: «Сглаживание».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Параметр Lambda | `SmoothingWizard;edtLambda;SwitchButton` | 256 |
| Период сглаживания | `SmoothingWizard;edtPeriod;SwitchButton` | 256 |
| Тип вейвлета Добеши Койфлеты CDF 9/7 | `SmoothingWizard;pedWaveletType;SwitchButton` | 257 |
| Порядок вейвлета | `SmoothingWizard;edtWaveletOrder;SwitchButton` | 257 |
| Продолжение границ | `SmoothingWizard;edtEdgeExtension;SwitchButton` | 257 |
| Глубина разложения | `SmoothingWizard;edtDecompositionLevel;SwitchButton` | 257 |

## programming-javascript

**JavaScript**, `programming.javascript`. Источник: `ui.jsonl:39`, `ui.jsonl:40`, `ui.jsonl:41`.

Структура выхода → код; InputVariables не исполнялся.

Обычный вход переменных и InputVariables в штатном коде; control-порт не наблюдён.

## research-auto_correlation

**Автокорреляция**, `research.auto_correlation`. Источник: `ui.jsonl:138`, `ui.jsonl:139`, `ui.jsonl:140`, `ui.jsonl:141`.

Просмотренный путь мастера; дополнительные режимы не принимались.

Страницы: «Настройка входных столбцов» → «Автокорреляция» → «Настройка соответствия между столбцами» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Количество отсчетов | `AutoCorrelationWizard;pedLagCount;SwitchButton` | 139 |
| Область расчета АКФ | `AutoCorrelationWizard;pedDomainCalc;SwitchButton` | 139 |

## research-corr_analysis

**Корреляционный анализ**, `research.corr_analysis`. Источник: `ui.jsonl:144`, `ui.jsonl:145`, `ui.jsonl:275`, `ui.jsonl:276`.

Выбраны Amount и Limit в первом/втором множествах; переход к описанию; без расчёта корреляции.

Страницы: «Корреляционный анализ» → «Описание узла».

На этих страницах видимый `SwitchButton` не зафиксирован.

## transform-cross_table

**Кросс-таблица**, `transform.cross_table`. Источник: `ui.jsonl:148`, `ui.jsonl:149`, `ui.jsonl:150`.

Просмотренный путь мастера; дополнительные режимы не принимались.

Страницы: «Кросс-таблица» → «Настройка соответствия между столбцами» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Разделитель частей меток полей | `CrossTabWizard;pedDisplayNameSeparator;SwitchButton` | 148 |
| Ограничение количества значений | `CrossTabWizard;pedSlidingUniqueValuesLimit;SwitchButton` | 148 |
| Уникальные значения как имена полей | `CrossTabWizard;pedUniqueValueNames;SwitchButton` | 148 |

## transform-sliding_window

**Скользящее окно**, `transform.sliding_window`. Источник: `ui.jsonl:153`, `ui.jsonl:154`, `ui.jsonl:273`, `ui.jsonl:274`.

Двойным щелчком раскрыты history/forecast Amount: обычные spinner без SwitchButton; обработка неполных записей имеет переключатель.

Страницы: «Скользящее окно» → «Описание узла».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Способ обработки неполных записей | `SlidingWindowWizard;pedIncompleteRecordsProcessing;SwitchButton` | 153 |

## trees-from_json

**JSON в дерево**, `trees.from_json`. Источник: `ui.jsonl:157`, `ui.jsonl:158`.

Начальная страница; Next отказал на обязательном поле.

Страницы: «JSON в дерево».

| Поле | Суффикс `data-tid` | Строка |
|---|---|---:|
| Имя столбца | `JSONToTreeWizard;pedSourceColumn;SwitchButton` | 157 |
| Формат даты и времени | `JSONToTreeWizard;pedDateTimeFormat;SwitchButton` | 157 |
| Автоопределение структуры | `JSONToTreeWizard;pedBuildTreeAuto;SwitchButton` | 157 |
| Исключить корневой узел | `JSONToTreeWizard;pedRootExcluded;SwitchButton` | 157 |
| Строгое соответствие структуры | `JSONToTreeWizard;pedStrictMode;SwitchButton` | 157 |
| Корневой узел | `JSONToTreeWizard;pedRootGeneration;SwitchButton` | 157 |

## trees-to_table

**Дерево в таблицу**, `trees.to_table`. Источник: `ui.jsonl:162`, `ui.jsonl:163`, `ui.jsonl:164`.

Входное дерево и выбор узлов; нет fixture дерева для выбора.

Страницы: «Настройка входного дерева данных» → «Выбор узлов дерева».

На этих страницах видимый `SwitchButton` не зафиксирован.

## Адресные наблюдения

| Факт | data-tid / наблюдение | Источник |
|---|---|---|
| Фильтр: переход constant → variable | `FilterDataWizard;FilterDataPanel;VariantPropEdit;SwitchButton` → `VariableControl;trg_picker` | `ui.jsonl:17` |
| Фильтр: подходящий integer | `VariableControl;boundlist;Amount_(_7_)`, текст `Amount ( 7 )` | `ui.jsonl:18` |
| Фильтр: незаполненная строка отказала | `btnError`, «Поле указано не верно», «Не указан тип данных», «Тип отношения не соответствует типу фильтруемого столбца» | `ui.jsonl:19`; tooltip прочитан отдельно |
| Калькулятор: обычный набор, не control | `CalcDataWizard;colFieldName_Var.Amount`, `colFieldValue_Var.Amount=7` | `ui.jsonl:35` |
| Калькулятор: вставка из списка | `CalcDataWizard;cmpExpression`, текст `Var.Amount` | `ui.jsonl:36` |
| Калькулятор: reopen | Повторно открыт тот же GUID; в `cmpExpression` осталось `Var.Amount` | `ui.jsonl:37` |
| JavaScript | `JavaScriptCodeWizard;cmpCodeCM`, штатный импорт включает `InputVariables` | `ui.jsonl:41` |
| JSON: предел перехода | `msgbox-1;cnt;cnt;MessagesView`, «Это поле обязательно для заполнения» | `ui.jsonl:159` |

Начальные порты «Замены (переменные)»: `ui.jsonl:3`, показ control: `ui.jsonl:7`,
мастер: `ui.jsonl:6`. Соединение: `ui.jsonl:9–10` — два variables input,
`Input_Add`, variables output, `DerivedVariablesMappingEngineOutputPortWizard`.
Control subtype 4 отличается от ordinary variables subtype 3.

Дополнительные вложенные редакторы: у Сортировки выбран Text, прочитан DOM
ячеек направления/регистра (`ui.jsonl:263,264`); у Скользящего окна двойным
щелчком раскрыты `grdColumns;roweditor;colHistory_num` и `colForecast_num`
(`ui.jsonl:274`), это spinner без наблюдённого SwitchButton. У Замены выбран
Amount, доступны обычные `cbxReplaceOther`, `edPrecision`, `chkCaseSensitivity`,
но редактор конкретного правила не активирован (`ui.jsonl:277`). Эти границы
не означают доказанного отсутствия bindings во всех конфигурациях.

## Палитра, области и управление выполнением

TID ниже — суффиксы наблюдённых элементов, без изменяемого префикса документа.

| Факт | Адрес / выбранное значение | Источник |
|---|---|---|
| Пять компонентов переменных | `Graph;Замена_(переменные)`; `Соединение_(переменные)`; `Калькулятор_(переменные)`; `Таблица_в_переменные`; `В_столбцы:_Text_Amount` | `ui.jsonl:2,3,9,174`; палитра и cached ports собственного графа |
| Control отличен от ordinary | У Замены `Input_Var-0` subtype 3 и скрытый subtype 4, после показа `Input_ControlVar` | `ui.jsonl:3,7` |
| Соединение | `Input_Var-0`, `Input_Var-1`, `Input_Add` subtype 10; `DerivedVariablesMappingEngineOutputPortWizard` | `ui.jsonl:9,10` |
| Пакетные значения | `PackageVariablesForm;grdPackageVariables`; `PackageVariableEditForm;edtName`, `cbxDataType`, `cbxNullValue`, `pgcValue;txt`, `cnt;chb`, `cnt;chb-1` | `ui.jsonl:194–196`; последние два — Скрытая / Только для чтения |
| Значение пакета читается отдельно | `PreviewForm;VariablesForm;colValue_Lab828Package` = `pkg` на выходе 3 | `ui.jsonl:198` |
| Условие: порты | `ConditionSocketsWizard`, выбран тип «Переменные», также предложены «Таблица» и «Дерево данных» | `ui.jsonl:176,177` |
| Условие: ветви | `ConditionParamsWizard;grdBranches`, `ConditionsView;btnAddOR`, `colField`, `colAggregation`, `colRelationType`, `colCompareValue`, `colCaseSensitive` | `ui.jsonl:178,179`; пустой список правил, без исполнения |
| Цикл | `LoopNodeWizard`, `LoopParamsWizard;cbxConditionVariable;boundlist;Выходные_переменные.Выражение1` | `ui.jsonl:181–184`; это picker постусловия, не счётчик |
| Выполнение узла | `ExecNodeComponentWizard;pnlNodesTree`, выбран собственный вычислитель переменных; переход к описанию | `ui.jsonl:186,187` |
| Узел-ссылка | `ReferenceNodeComponentWizard;pnlNodesTree`, строки дерева собственного модуля | `ui.jsonl:189`; выбор исполнения не принимался |
| Подмодель | `GenericModelComponentWizard;grdModelPorts;tbl;GroupHeader;0;AddButton` и `GroupHeader;1;AddButton`; выбраны variables input/output | `ui.jsonl:191,192` |
| Внешние порты подмодели | После Done наблюдены `Input_Var-0`, `Output_Var-0` | `ui.jsonl:193`; внутренний workflow — прежний W1 discovery |

## Изменение scalar порога без перенастройки фильтра

Связь: пользовательские значения → VarToData → табличный вход Фильтра;
тот же набор → control-вход. Предикат `Amount > Limit`.

| Настройка / просмотр | Наблюдение по data-tid | Источник |
|---|---|---|
| `Amount=7`, `Limit=5`, выход «Соответствуют условию» | `PreviewForm;DataSetForm;normalHeaderCt;Amount_0` = `7`, `Limit_0` = `5` | `ui.jsonl:219` |
| Изменён только `Limit=9`, тот же соответствующий выход | Заголовки Amount/Limit есть, строк `Amount_0`/`Limit_0` нет | `ui.jsonl:220` |
| «Не соответствуют условию» после повторного выполнения | `Amount_0` = `7`, `Limit_0` = `9` | `ui.jsonl:221` |

Это ручное native выполнение с чтением таблицы в UI. Оно подтверждает
динамический binding для integer, не модельный PASS, все типы или cold acceptance.

## Файлы из управляющих переменных

| Узел | Точный суффикс поля | Наблюдение |
|---|---|---|
| Текстовый экспорт | `ExportTextFileParamsWizard;edtFileName;SwitchButton` | Выбрана FileCsv; Next/Done/Execute, `ui.jsonl:225–228` |
| Excel экспорт | `ExportExcelFilePreviewWizard;edtFileName;SwitchButton` | Выбрана FileXlsx; Done/Execute, `ui.jsonl:231–233` |
| Текстовый импорт | `ImportTextFilePreviewWizard;edtFileName;SwitchButton` | FileCsv, файл предыдущего экспорта; формат → mapping → Done/Execute, `ui.jsonl:235–239` |
| Excel импорт | `ImportExcelFilePreviewWizard;edtFileName;SwitchButton` | FileXlsx, собственный XLSX; поля → mapping → Done/Execute, `ui.jsonl:241–245` |

В каждом случае появляется `edtFileName;VariableControl;trg_picker`.
Полные пути своей пары из выдержек исключены. Порты текстового экспорта:
`Input_Connection-0` subtype 6, `Input_Data-1` subtype 1, `Input_Var-2` subtype 3;
реальные SVG-связи подтверждены отдельно (`ui.jsonl:224`). Поэтому нельзя
определять управляющую роль только проверкой subtype 4.

## Сохранение и чтение в новом документе

Собственный пакет сохранён штатно (`ui.jsonl:197`), скачан через native UI
(`ui.jsonl:201`), затем открыт в новом документе (`ui.jsonl:202`). После
активации собственного источника фильтр перечитан с сохранённой переменной
(`ui.jsonl:204`); Калькулятор сохранил `Var.Amount` (`ui.jsonl:205`). До активации
источника mapping показал недостающие объекты (`ui.jsonl:203`); связи не удалялись.
Такой отказ нельзя считать потерей bindings без проверки схемы источника.

После возобновления сохранена собственная копия `lab828-capabilities-final.lgp`
(`ui.jsonl:229,265`), скачана штатно (`ui.jsonl:266`). Ниже сокращённые выдержки
её `Unit_0/Unit.xml`; они не являются предложением править XML вместо мастера.

```xml
<!-- Узел Фильтра: Component/PropBinder/PropertyBindSavers -->
<Item Name="CompareValue.[0].Items.Filter.Engine.Root."
      PropertyPath="CompareValue.[0].Items.Filter.Engine.Root."
      VariableName="Limit"/>
<!-- Каждый из двух CSV-узлов -->
<Item Name="FileName.Engine.Root." PropertyPath="FileName.Engine.Root."
      VariableName="FileCsv"/>
<!-- Каждый из двух Excel-узлов -->
<Item Name="FileName.Engine.Root." PropertyPath="FileName.Engine.Root."
      VariableName="FileXlsx"/>
<!-- Выражение обычного табличного Калькулятора -->
<Item Name="Expr1" DataType="dtFloat" Expression="Var.Amount"/>
```

В первоначальном пакете у фильтра `Name` ещё содержал `[1]`, когда актуальный
`PropertyPath` уже был `[0]`: индекс изменился после удаления пустого условия.
Сохранённая константа `CompareValue` сама по себе не описывает активный binding.

Сопоставление Engine с живым GUID и VendorGuid:

| Компонент | Engine/@xsi:type | VendorGuid |
|---|---|---|
| Замена переменных | `TBGCustomModelComponentEngine` | `f2c44372-4b7c-41ae-99f5-a3d52d418d90` |
| Соединение переменных | `TBGCustomModelComponentEngine` | `b4432322-a745-46b0-93cb-83ac194d8adb` |
| Калькулятор переменных | `TBGCalcVariables` | `3cff62aa-e3b0-4505-b2f0-90bb23b87875` |
| Переменные в таблицу | `TBGVariablesToDataEngine` | `b00d1d89-0386-4fdd-a404-f7ef26ffcd25` |
| Таблица в переменные | `TBGCustomModelComponentEngine` | `c0c06e4e-da43-4f30-b2dd-d95ade0e5970` |

Это сериализованные Engine, не чтение RPC FullType. Замена и DataToVar в этом
пакете не завершены; для общего Engine DataToVar после настройки есть прежний
discovery. В `Variables.xml` своя `Lab828Package` сохранена с
`DataType="dtString"`, `TBGStringVariableContainer Value="pkg"`.

Сохранённый пакет закрыт, выполнен logout (`ui.jsonl:268,269`). После
дополнительного просмотра вложенных настроек пакет снова штатно закрыт без
сохранения временных настроек, сохранённая копия осталась прежней
(`ui.jsonl:278`); проверена форма LoginForm, браузер закрыт (`ui.jsonl:279`).
Новых сборок и модельных прогонов в этой работе нет.
