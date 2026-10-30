# Логистическая регрессия: этап 0, LAB-534

Исследование 30.10.2026 на `https://app.loginom.ai/app/?testable=true`,
Loginom **7.4.2**, Linux x64 / mas. База — `v038@2098aafcf46eaea118b18cb529f6bf045a5704eb`.
Использованы исходные `loginBrowser`, `makeWorkspacePrepareCode`,
`makePackageCleanupCode` и Playwright с закреплёнными Node 24.19.0 / Chromium 1246.
Новая CLI-сборка не выполнялась. Все жесты адресованы по `data-tid`;
внутренний JS Loginom не подменялся. Использован только worker назначенной пары.

Это предложение критериев для утверждения владельцем перед этапом 1.
Обработчик отсутствует; модельные `run-check` и `cold-check.mjs` не запускались,
исполнитель **0/3**. Native-опыты ниже не являются модельной приёмкой.

## Компонент и страницы — наблюдено

Палитра: `MF;TF-1;ModelForm;colVendors_Компоненты>Data_Mining>Логистическая_регрессия`.
Иконка — `bg-vendor-icon-logregression`.
Native vendor в `FVendorInfo` собственного дерева узла:
`IBGLogRegressionComponentVendor`, GUID `b932b077-1ddb-4d8a-9f3a-514d72b9c094`.
Мастер — `LogRegressionWizardVendor`, engine — `$bg_rpc_TIBGLogRegressionEngine_Proxy`.
Отдельное строковое свойство `fulltype` в DOM не предоставлено: vendor и engine
наблюдены, равенство их имени component ID не предполагается.
Предлагаемая регистрация: **`datamining.log_regression` / `enter`**.

Входы: таблица **0**; управляющие переменные скрыты по умолчанию.
Выходы: таблица прогноза **0**, таблица коэффициентов **1**, переменные сводки **2**
(`Input_Data-0`, `Output_Data-0`, `Output_Data-1`, `Output_Var-2`).
Порты 1/2 и W4 исключены из приёмки этапа 1 решением карточки.

Корень мастера — `MF;TF-1;WizrdMCF`; кнопки `btnNext`, `btnPrev`, `btnDone`,
`btnExecute`, `btnClose`. Все перечисленные страницы наблюдены:

| Страница / suffix | Наблюдение для этапа 1 |
|---|---|
| `TuneDataSourceInputPortWizard` | X — «Входное» (UsageType 3), Target — «Выходное» (4); RowID/Note — «Не задано» (0). Непрерывному X цель недоступна; строковой дискретной Target доступна. |
| `NormTuneWizard` | X: «Нет», важность 1; Target: штатное кодирование «Отклонение». Кнопка `btnActivationPort`: «Не активировано» → «Вход активирован». |
| `LearnPartitionWizard` | Обучение 100%, тест 0%, случайное разбиение, без валидации; доступен seed. При 100% не требуется воспроизводить PRNG. |
| `LogRegressionWizard` | Выбор события, метода и поправки на долю событий. Умолчания: более редкое событие, auto=true, Ridge (disabled), denormalize=true, detailed=false, reference coefficients=true; поправка — на основе обучения. |
| `LogRegressionWizard-1` | Детальная страница при detailed=true: epsilon 0.0001, threshold 0.5, intercept=true (disabled при denormalize), confidence 95. Epsilon/threshold имеют UI-границы 0..1. Приняты epsilon=1e-10 и threshold=0.8. |
| `DoneWizard` | Описание узла, Done / Execute. Табличные выходы настраиваются отдельно через меню порта `mn;mniConfigurePort`. |

Методы в picker: Enter, Forward, Backward, Stepwise, Ridge, LASSO, Elastic-net.
Событие: первое / последнее / более редкое / более частое / задано явно.
В текущем наборе `pedEventId;ValueControl;boundlist` показал **`0 (no)`, `1 (yes)`**.
Выбран `1 (yes)`, `pedEventType=4`, `pedAutoMethod=false`, `pedRegressionMethod=0`.
Индекс нельзя выводить из порядка строк CSV: первая строка содержит yes, но его
наблюдённый индекс — 1. Публичный параметр должен принимать метку **yes**.

LASSO/Ridge, критерий отбора и пороги включения/исключения в Enter disabled.
Вне среза: веса, поправки, регуляризация, отбор факторов, нормализация факторов,
проверка границ всех будущих методов. Их UI-наличие не означает поддержку.

## Выход 0, NULL и порядок — наблюдено

Схема до обучения видна в `DerivedDataSourceOutputSocketWizard;colName_<name>`:

| Имя | Native метка | Тип |
|---|---|---|
| `PredictionEvent` | Событие\|Прогноз | boolean |
| `PredictionProbability` | Вероятность события\|Прогноз | real |
| `ActualEvent` | Событие\|Факт | boolean |
| `Target_predicted` | Target\|Прогноз | string |
| `RowID` | RowID | integer |
| `X` | X | real |
| `Target` | Target | string |
| `Note` | Note | string |

Тёплый порядок — четыре служебных поля, затем RowID/X/Target/Note.
После Save / нового профиля / Execute — четыре служебных поля,
затем **X/Target/RowID/Note**. Этот холодный порядок закреплён в `expected.json`;
строки остаются в порядке RowID 1..32 (`ordered=true`).
Метки служебных колонок не заданы бизнес-задачей, поэтому `label_any=true`;
имена и типы точны. Native метки выше сохраняются как наблюдение.

В readback preview `...;PreviewWindow;PreviewForm;DataSetForm;grdDataTable;grd-1;tbl`
загружены все 32 записи. Числа прочитаны из уже загруженных записей этого
UI-grid; форматированное `0.10` не использовалось для вывода о точности.
11 пропусков Note остаются NULL, не строкой «?» и не пустой строкой.
Для holdout пустая Target даёт NULL в Target и ActualEvent, но прогноз заполнен.
Обучение на пустой Target отклонено: **«Пропущенные значения запрещены
(пропущенное значение в колонке "Target")»**. Причина прочитана из
`ConsoleForm;ProgressForm;colErrorDetails_Root>Активация_узлов-3>Логрегрессия:_Target_X`
и по клику в `msgbox-1;cnt;cnt;MessagesView`. Собственный диалог закрыт.
Отказов Next при корректной конфигурации не было; при их появлении обработчик
должен прочитать `btnError`, а не подменять причину timeout.

## Числа и train/apply — наблюдено

`fixtures/train.csv`: 32 строки, по X=-2/-1/0/1/2 размеры групп 10/4/4/4/10,
число yes 1/1/2/3/9. Обе категории есть в каждой группе, полной разделимости нет.
Входы и независимый oracle созданы до обучения; числовые ожидания не получены
из Loginom. Схемные имена уточнены по мастеру до чтения результата.

`acceptance/oracle.py` решает два уравнения score независимым Newton/IRLS,
проверяет β₀=0, β₁=ln(3), затем использует точную рациональную форму
`p=3^X/(1+3^X)` для целых X. Это устраняет ошибку округления при проверке p=0.5.

| X | Число строк | Oracle p(yes) | Прогноз при threshold=0.8 |
|---:|---:|---:|---|
| -2 | 10 | 0.1 | no |
| -1 | 4 | 0.25 | no |
| 0 | 4 | 0.5 | no |
| 1 | 4 | 0.75 | no |
| 2 | 10 | 0.9 | yes |

Явное `mn;mniTeachNode` обучило и активировало узел. Все 32 класса совпали,
максимальная абсолютная ошибка вероятности — **2.38e-10**.
Собственный пакет сохранён; закрытие и logout подтверждены без discard.
В новом профиле обычное `mn;mniActivateNode`, **без Teach**, вернуло те же
32 записи и значения; изменился только порядок passthrough полей выше.

У того же импорта (тот же GUID) источник заменён на `holdout.csv`;
типы сохранены явно, заголовок / запятая / точка / NULL «?» сохранены.
Обычный Execute того же узла, без настройки модели и Teach:
RowID 33/34/35, X=-3/0/3, p≈0.035714285844886055/0.5/0.964285714155114,
классы no/no/yes; независимые числа — 1/28, 1/2, 27/28.
Последующее явное Teach на holdout дало отказ по NULL Target выше.
Изменения источника этого опыта отброшены; пакет закрыт и logout подтверждён.
Файл на сервере сохранил исходную train-модель.

При отдельной настройке threshold=0.5 и повторном Teach на train строки
RowID 15..18 имели ровно p=0.5, PredictionEvent=true, Target_predicted=yes.
**Правило решения: p >= threshold**, равенство относится к событию.
Граничная проба не добавляет второго режима.

## Предлагаемый контракт этапа 1

Только `enter`: бинарная **строковая дискретная** цель, непрерывные числовые
факторы, intercept, 100% обучения, без весов / нормализации факторов /
регуляризации / валидации / поправки. Фиксированная epsilon=1e-10;
обязательные `event` и `threshold`, чтение только порта 0.
Применение сохранённой модели к holdout исследовано; отдельный режим `apply`
и его модельная приёмка не входят в предложенный первый срез.

Параметры — отдельный объект **`parameters.logistic`** по
`acceptance/parameter-schema.json`. Это оставляет прежние общие описания
`target_field` / `input_fields` неизменными. Все четыре поля обязательны,
имеют description; строковый enum режима — существующий `enter`, индексы
native enum наружу не передаются. NULL/пустая/неизвестная event, совпадающие
имена факторов и цели, иные типы/роли/порты отклоняются до мутации.
При NULL обучающей цели / фактора причина приходит штатным отказом Loginom;
нельзя подставлять ноль, пропускать строки или молча выбирать другой метод.

Предлагаемая `NODE_TYPES.semantics`:

> Train unweighted binary logistic regression using Enter, an intercept and
> unnormalized continuous numeric predictors. Set parameters.logistic with
> input_fields, one discrete string target_field, the exact event category
> label and an explicit threshold (event if p >= threshold). Execute explicitly trains on all current
> input rows, then reads output 0: event flag, event probability, actual event,
> predicted category and original fields. Other modes, weights and ports 1/2
> are unsupported. Native class indices must be observed, never guessed.

Компактный readback: kind=`log_regression`, mode=`enter`, input_fields,
target_field, class mapping (две метки и наблюдённые индексы), event,
threshold, intercept=true, normalization=`none` для факторов, epsilon,
train_percent=100, validation=`none`, calibration=`train`, training.status,
source и execution_id по существующему образцу ЛинРег. Не возвращать всю
сводку/статистику, не объявлять package persistence по настройке мастера.

Предлагаемый допуск вероятностей — **abs=1e-8, rel=1e-10**, как в ЛинРег;
целые, строки, Boolean, NULL и схема сравниваются точно. Полный результат
32×8, CSV, Save, новое открытие и cold-check; правило 2/3 на одном SHA
у исполнителя и независимого проверяющего остаётся по регламенту.

## Общие изменения и размер

В базе уже есть W1 (`trainConfiguredNode`), W2 (`tolerance`), W3 (`output_port`).
Новый общий механизм обучения/проверки и W4 не нужны.
Ожидается аддитивная регистрация типа, собственного reader/driver/readback,
маркеров двух страниц и контролов UI, собственного раздела навыка и сценария
run-check. Для страниц можно добавить LogRegression-алиасы к существующим
`lin_regression` / `lin_regression_details`, сохранив публичный enum стадий.
Нужда в изменении общих алгоритмов сейчас не наблюдена; если появится — стоп
по карточке. Реализации и доказанного red→green в этом docs-PR нет.

`acceptance/schema-size.mjs` использует production `nodeApiTools` и тот же
`Buffer.byteLength(JSON.stringify(inputSchema))`, что `node-caption-schema.test.mjs`.
Добавляет в копию только тип в target.enum и вложенный logistic schema:
**45 891 → 46 677 Б, +786 Б** (предел на тип ≤1 050 Б соблюдён).
Существующий `enter` уже в mode.enum; descriptions включены в подсчёт.
До предела 46 000 Б не хватает 677 Б; это измерение для F2, не стоп этапа 0.
Production-регистрация отложена до этапа 1.

Оценка этапа 1 — **3 цикла red→green**: (1) роли/страницы/обучение,
(2) полный порт 0 / точность / сохранение, (3) стабилизация 2/3 и независимая
приёмка того же SHA. Это оценка, не обещание PASS и не разрешение общих правок.
