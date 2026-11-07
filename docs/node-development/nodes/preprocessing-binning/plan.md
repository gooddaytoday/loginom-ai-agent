# Квантование: подплан

Статус: `ready_for_development` для предложенного ниже среза; это результат
этапа 0 LAB-645, **не разрешение начинать этап 1 до утверждения критериев владельцем**.
Редакция 2, 31.10.2026. База исследования `v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`.
Loginom 7.4.2 Enterprise, mas/Linux x64.
Component ID `component.preprocessing.Binning`, slug `preprocessing-binning`.
Runtime proposal `preprocessing.binning`, режим `internal` и существующий `apply`.

[Discovery и контракт](discovery.md) · [задание](acceptance/task.md) ·
[oracle](acceptance/oracle.py) · [ожидания](acceptance/expected.json) · [карточка](README.md).

## 0. Назначение и регламент

Объём, SHA, пара аккаунтов и целевая ветка задаются текущей карточкой Multica.
Действующий регламент сквада важнее этого документа и RUNBOOK.
LAB-645 — только исследование и docs-PR в v039; без runtime-кода и сборки CLI.
Модель будущей приёмки `openai/gpt-6.1-sol`, medium, предел 1800 с.
После утверждения владельцем нужна отдельная карточка реализации.

Живой стенд только `https://app.loginom.ai/app/?testable=true`, элементы через
`data-tid`, пакеты только назначенной пары. Отказ мастера читать из `btnError`.
Стоп по текущему назначению: компонента нет; нужна неразрешённая общая правка,
режим или новый критерий вне назначенного объёма. Один вопрос в карточку, blocked.
Не создавать новые карточки, не изменять чужие, merge/release/done не выполнять.

## 1. Предлагаемый этап 1

Одна выбранная Integer/Real колонка, остальные без метода:

- count («Количество»): целое положительное количество, явные нижний/верхний пределы;
- width («Ширина»): положительная ширина и явные пределы (в стартовой матрице длина диапазона кратна ширине);
- frequency («Плитка»): количество плиток по числу строк, «Добавлять в следующий»;
- без округления, открытых внешних краёв, переменных и автоматической настройки;
- создание, настройка существующего узла, оба полных выхода;
- internal: отдельное обучение текущего входа, затем свежее выполнение;
- apply: только сохранённые материализованные интервалы, без обучения и коммита draft.

Явные пределы у count/width — осознанная граница предложения: автоматические пределы
на стенде не совпали с min/max; универсальная формула не установлена.
«Границы пользователя» как отдельный метод в палитре метода отсутствуют.
Фиксация крайних пределов count/width входит в срез; произвольная правка каждого
интервала не считается проверенной только по наличию редактора.

Не включены: DateTime, SD, суммы значений, другие tie policies, случайное назначение,
внешние интервалы, инверсия типа границ, пользовательские метки/произвольные границы,
empty/all-NULL и constant-выборки без отдельного наблюдения. dates.csv оставлен как fixture
следующего среза; его наличие не означает принятого DateTime-контракта.

## 2. Наблюдённая основа и контракт

[Discovery](discovery.md) фиксирует точные TID, страницы, поля портов и ограничения.
Порт 0: входные поля, производные сразу после квантуемого поля; порядок строк входной.
Порт 1: таблица интервалов. Номера с нуля, BinsID=имя исходного поля.
Для count/width по умолчанию верхние пределы включительно, общий предел входит в нижний интервал.
Для frequency next — нижние пределы включительно, последняя верхняя тоже.
NULL сохраняется, Note=NULL отличается от Note="". Real-допуск объявлен в expected
для численных вычисляемых значений; номера, типы, строки, Boolean и NULL точны.

configured ≠ сохранённые интервалы: Execute может считать по настройкам без их
материализации. В UI после Train появляется ненулевой BinsCount. Apply при состоянии
settings должен отказать до мутации с объяснением явного обучения.
После Train активного узла старый preview не обновляется: нужен новый Execute.
Смена source файла того же импорта и применение того же узла без fit наблюдены.

Публичная видимость: собственная запись NODE_TYPES с semantics из discovery;
каждое поле parameter_schema с description, строковые enum. Предложенная схема
находится в acceptance/parameter-schema.json, не зарегистрирована в runtime.
Readback содержит наблюдённые настройки, intervals/state, источник обучения и обе
output mappings; текущая схема не должна подменяться предложенной до реализации.

## 3. Приёмочный комплект до реализации

Входы UTF-8, запятая, заголовок, десятичная точка, NULL `?`, строковый ограничитель `"`.
RowID integer, X real, Note string; Integer — отдельная адресная проверка того же
математического oracle. fixtures/manifest.json описывает файлы и типы.
acceptance/data содержит только входы модели; oracle и expected туда не попадают.

| Сценарий | Задание / expected | Что различает |
|---|---|---|
| binning-count | task.md / expected.json | 2 интервала 0…20, NULL, повтор границы, порядок |
| binning-width | task-width.md / expected-width.json | те же пределы, ширина 10 |
| binning-frequency | task-frequency.md / expected-frequency.json | 3 плитки, независимый rank oracle |
| binning-apply | task-apply.md / expected-apply.json | новые RowID/значения, прежние интервалы |
| binning-retrain | task-retrain.md / expected-retrain.json | то же новое сырьё, явно новая модель |
| binning-real | task-real.md / expected-real.json | дробное 5.25, сохранение Real |
| binning-integer | task-integer.md / expected-integer.json | явные Integer-типы |
| binning-frequency-ties | task-frequency-ties.md / expected-frequency-ties.json | дубли на cut переходят вместе |
| binning-holdout | task-holdout.md / expected-holdout.json | outside -1/+1, NULL и края |

Во всех expected: ordered=true, column_order=exact, явные output_port=0/1,
все поля/строки. Real abs=1e-12, rel=1e-12; остальные значения без допуска.
Пропавший/добавленный порт, строка, столбец, перестановка или иной тип — FAIL.
Метки без запроса — label_any; значения интервальных меток фиксированы контрактом.
Данные expected вычисляются арифметикой Python stdlib, не результатами Loginom.

Прогоны только после утверждения критериев: run-check start, затем wait одной
foreground-командой; текущий этап модельных прогонов не содержит.
В этапе 1 добавить только собственные записи сценариев run-check с соответствующими
prompt/expected_name/input_files и export_count=2; не менять механизм runner.
Модель видит только задание и входные CSV. Публикация сырых журналов и receipts в Git
не требуется. После Save cold-check заново выполняет оба выхода в новом профиле.

## 4. Реализация и общие изменения

Образцы: elim-outlier (несколько числовых методов/выходов), data-partition (несколько
портов), linregression (train → execute, apply без коммита wizard).
Собственные binning-{node,parameters,procedure,context,readback}.mjs и адресные тесты;
аддитивная регистрация типа, режима, схемы/readback, наблюдений собственных controls,
обработчика и своего раздела навыка loginom-automation.
Сохранять существующие записи/валидацию; глобальный рефакторинг не нужен.

W1 имеет trainConfiguredNode и рабочий образец apply. W2/W3 уже поддержаны в
expected-outputs.mjs/cold-check: tolerance, ordered, output_port.
Отдельный новый механизм приёмки не нужен. Предел полной apply-схемы 46000 Б —
не стоп этапа 0; измеренное приращение этого типа ≤1050 Б, воспроизводится в discovery.
Общая компрессия состава типов — отдельная карточка.

До отчёта list/verify scripts/node-acceptance/required-checks.py по фактическому diff.
Для будущего runtime — весь client/test с pinned Chromium под nice -n 19,
acceptance-tests при изменении runner, адресная матрица и живой бизнес-прогон.
PASS исполнителя ≥2/3 на одном опубликованном SHA; независимый проверяющий ≥2/3
того же SHA под своим аккаунтом. Чужой/прежний PASS не переносится.

## 5. Следующие срезы и точка продолжения

Наблюдены числовой мастер, схемы двух портов, NULL/empty-string и lifecycle.
Численная/standalone приёмка и реализация отсутствуют; handler=null и not_implemented
не повышаются. ready_for_development означает подготовленный ограниченный план.
Владельцу предлагаются конкретные критерии; изменение их после FAIL запрещено.
Оценка этапа 1 — 3 цикла реализации/бизнес-прогонов плюс независимая приёмка.

Следующие срезы: независимая формула автоматических пределов, DateTime/единицы ширины,
другие tie policies/SD, ручная правка и точечные интервалы, внешние таблицы.
Некратная ширине длина диапазона и неделимые frequency-выборки также не подтверждены
стартовой матрицей. Для расширения — task/oracle/expected до реализации; не переносить сюда
устаревшее обещание поддержки всех методов или всех типов из редакции 1.

## 6. Точка перепроверки

Прежние задания, oracle и критерии выше сохраняются для своих ревизий. Новая приёмка выполняется по назначению на точном SHA; статическая синхронизация документации не утверждает новые критерии и не переносит прежний PASS. Текущая регистрация и ограничения — в [карточке](README.md).

## 7. LAB-1046: расширения v0.4.0, checkpoint этапа 0

07.11.2026, mas2, Loginom 7.4.2, только `https://app.loginom.ai/app/?testable=true`,
worker назначенной пары `01a124e5-1623-7a32-93c7-a3754c7dbdd7`.
Назначение указывало `afaa1f300687501c26b2e0921b05553cd75052f5`; по действующему
регламенту взята текущая голова `v040@9ec18ee987bc16d953f985a173d85e8b08a93020`.
Node 24.19.0; для native discovery использован установленный Chromium 1243.
CLI не собирался, runtime не менялся, run-check/CSV/cold не выполнялись.
**Этап не завершён:** после двух восстановлений разорванного сеанса остановка
по условию назначения. Этот раздел не утверждает новые критерии.

### Наблюдено в UI

Корень опыта `MF;TF-1`, далее B = `WizrdMCF;MethodSettingsWizard-1`.
`B;colDisplayName_2` — DateTime When, `colMethodType_2` открывает те же методы,
что и numeric: ширина, количество, плитка, коэффициенты СКО.
Нужна стабилизация выбранной строки/редактора до следующего действия.

- DateTime/count: `MethodSettingFrame;cbbCountBins;ValueControl`,
  `chkStrictLowerLimit`/`chkStrictUpperLimit`, границы в
  `edtLowerLimit;ValueContainer;datetimefield` и соответствующем edtUpperLimit.
  Не искать их numeric num/Int64Field-путями. Флаги округления/открытых краёв видны.
- SD: `cbbSDBinsMode;ValueControl` предлагает ±1/±2/±3 СКО; ±1 показывает три класса.
  На Integer X получены численные границы -3/1/11/15 и открытые хвосты;
  это не подтверждение Real-округления или универсальной формулы СКО.
- Frequency: `cbbMatchingObservationsMode;ValueControl` содержит next/current/
  random/unchanged/equal tiles; `chkSummTile;ValueControl` включается, current
  читается обратно как «Сохранять в текущем». Вычисления этих расширений не выполнены.
- После Train `B;grdBins` содержит materialized intervals.
  `colUpperBoundValue_0` — редактируемый DateTime; перенос Jan 2 12:00 → Jan 2 00:00
  одновременно изменил `colLowerBoundValue_1`. `colBinLabel_0/1` изменены на Early/Late.
  После Done/Execute без нового Train метки и ручные границы сохранились в выходах.

Повторяющиеся `MethodSettingFrame` принадлежат разным полям/скрытым страницам:
сначала подтвердить выбранное поле и единственный видимый owner, не брать first().
Второй выход при одном DateTime-поле имеет datetime LowBound/UppBound/LowDev/UppDev,
BoundsDataType=2; при одновременно настроенных numeric/DateTime границы становятся
Variant. Предлагаемый контракт пока сохраняет **одно** обрабатываемое поле.

По modes.csv оба полных выхода DateTime/manual сверены с независимым календарным
oracle: схемы, порядок и все 146 значений совпали. Когда When=NULL, BinsID=When,
номер/метка/границы/OutOfBins=NULL, флаги open=false. Исходные X/Target/Segment и
их NULL сохранены. Это native discovery, не PASS production reader или run-check.

### Предложение и оставшаяся работа

[Комплект и статусы](acceptance/modes/README.md),
[oracle](acceptance/modes/oracle.py), [схема](acceptance/modes/parameter-schema.proposal.json),
[карточка](acceptance/modes/node-card.proposal.json).
DateTime/manual — точные даты, два порта, ручные метки, без повторного Train.
Auto/count и population-SD на Real — отдельные численные предложения, ещё без UI-сверки.
Все task/oracle/expected отделены; модели только выбранный task и CSV.
Random исключён из схемы до решения о критерии. Остальные непроверенные ветки
перечислены в README комплекта, их нельзя считать покрытыми наличием контролов.

Оценка — **3–4 цикла** после завершения исследования и утверждения критериев:
DateTime/auto/SD; deterministic ties/sums; materialized edits и lifecycle;
округление/open-края и persistence. Затронутся существующие
`client/lib/binning-{parameters,context,procedure,node,output,readback}.mjs` в
packages/loginom-runtime. Сейчас context принимает метод 5 в inventory, но его
settings не декодирует; интервалы требуют Number.isFinite и отвергают Date.
Readback пока жёстко пишет rounding=false/open_ends=false/ties-next.
До manual-edit нельзя сохранять текущий порядок «правка → автоматический Train».

Общая работа по текущей оценке — аддитивные схемы/регистрация собственных параметров
в node-api/node-contracts и расширение справки; новый общий verifier не нужен.
Необходимость иной общей правки не доказана. Если она появится — отдельный стоп.

### Модельный бюджет предложения

Измерение: `node .../preprocessing-binning/fixtures/measure-modes.mjs --write`;
карта получена из настоящего userActionInventory/describe с нулевыми hash-полями.
Учитываются реальные pins, не пустая вручную собранная карточка.
Общие размеры и команда model-schema-budget приведены в [smoothing-подплане](../preprocessing-smoothing/plan.md#7-lab-1046-вейвлеты-checkpoint-этапа-0).
Точные актуальные байты воспроизводит скрипт; таблица фиксируется перед PR.
