# Конечные классы: подплан

Статус: `ready_for_development` для среза LAB-775. Редакция 2, 03.11.2026.
Приёмочный комплект подготовлен; конкретные критерии ниже ожидают утверждения
оркестратором **до этапа 1**. Этот статус не означает разрешения начать реализацию
или успешной модельной/независимой приёмки.

Component ID `component.preprocessing.CoarseClasses`, slug `preprocessing-coarseclasses`.
Runtime proposal `preprocessing.coarse_classes`, modes `internal` / `apply`.
База этапа 0: `origin/v040@2910b8782c1ad8c016c6fc478369ddd179457e3e`.
Loginom 7.4.2, native engine `TBGCoarseClassesEngine`; mas, Linux x64.

[Карточка узла](README.md) · [Discovery](discovery.md) ·
[Приёмочный комплект](acceptance/README.md) · [Реестр](../../registry.json).

## 0. Назначение и границы

Действует регламент сквада из Multica и описание текущего назначения; прежний
§0 заменён. Новая карточка на пакет работ, отчёт одним комментарием;
закрывает карточку оркестратор. Этап 0 — docs-PR в v040, без runtime и сборки CLI.
Пара после уточнения назначения:
`~/.config/loginom-multica/cards/412fbafd-e49a-427b-bcbb-c107ebe51b8a/`.
Работать только в своих пакетах на `https://app.loginom.ai/app/?testable=true`,
через data-tid. Отказ мастера читать из btnError.

Модель будущей приёмки `openai/gpt-6.1-sol`, medium, 1800 с; запуск через
run-check start, затем wait одной foreground-командой. Ограничения нагрузки,
повторов, OAuth, cleanup и обязательных проверок — по регламенту сквада.
Не менять packages/agent, общий публичный контракт, бюджеты и deadlines.
Если нужна общая правка сверх разрешённых аддитивных регистраций, собственного
раздела навыка и своего сценария run-check — blocked с одним вопросом.
Отсутствие компонента, дополнительный режим или новый критерий вне объёма —
также стоп по карточке. Превышение model-visible бюджета в этапе 0 — пункт отчёта.

## 1. Решение по объёму

Решение v040-scope: один бинарный пример — роли полей, разбиение признака,
WoE/IV и применение сохранённых классов, независимый oracle WoE/IV.
Текущий конкретный вариант: **один дискретный string Segment**, бинарный
string Target, событие yes; RowID/Note unused и без изменений.
Автоматическое разбиение: минимум 5%, максимум 2 класса, равномерность 0%,
начальные классы как готовое разбиение выключены. Три табличных выхода.

Этап 0 подтвердил возможность обучения, применения после смены того же импорта,
сохранения и повторного открытия модели. Подробности UI, границы выводов и
незакрытые варианты — в discovery; старые предположения про отсутствующие
W1/W2/W3 к этой базе не относятся.

## 2. Этап 0 — выполнено в native UI, не модельная приёмка

- Палитра, fulltype из штатного сохранения, vendor, страницы, порты и controls.
- Роли unused/input/target, событие, параметры и max_classes=0 с причиной btnError.
- Полные схемы 0/1/2, порядок, nullable Boolean/Variant, NULL отдельно от empty.
- Явное обучение, apply без Train на holdout с NULL-целью, save/reopen/apply.
- Fixtures, пользовательские task, независимый Decimal oracle и два expected.
- Semantics, descriptions/строковые enum, компактный readback и оценка байтов.

Модельные прогоны, CSV и cold пока **не выполнены**, 0/3. Oracle/expected не
передаются модели. Квитанции, execution logs и сырые пакеты не включаются в PR.

## 3. Предлагаемые критерии для утверждения перед этапом 1

| Проверка | Ожидание |
|---|---|
| Обучение | 20 строк; A: 2/8, B: 8/2; E=N=10 |
| Разбиение | B=0, A=1; исходный row order сохранён |
| WoE B/A | -ln(4), +ln(4) |
| IV класса | 0.6*ln(4) = 0.8317766166719345 |
| IV признака | 1.2*ln(4) = 1.663553233343869; Высокая |
| Порты | train: 20×7 / 2×17 / 1×9; apply: 3×7 / 2×17 / 1×9 |
| Apply | тот же импорт/узел, holdout RowID 101…103, class [0,1,0], без Train |
| Статистика apply | прежняя модель 20 строк, 10/10 и IV, не fit по holdout |
| Точность | Real abs=rel=1e-12; всё остальное точно |
| Структура | ordered=true, exact column order, output_port 0/1/2; label_any |
| Персистентность | Save, cold reopen и повторное выполнение без обучения |
| CSV | rows.csv / classes.csv / significance.csv в порядке портов |

Числа вычисляются из fixtures; schemas/метки — зафиксированные discovery bindings.
ClassSignificant на порте 0 — частный IV, EventRate порта 1 — доля внутри класса.
Для каждого из train/apply: исполнитель ≥2 PASS из 3 и независимые ≥2/3 на том
же опубликованном SHA с другим аккаунтом; обязательные тесты затронутых путей.
Отказы до мутации и исключённые данные — в acceptance/README.md.

## 4. Этап 1 — только после утверждения критериев

Оценка: **2 цикла реализации**, затем модельная матрица и независимая приёмка.

1. Собственный handler coarse-classes: параметры/валидация, live context и writer
   ролей/настроек, explicit train, три выхода, описание ошибок и readback.
2. Saved-model apply без коммита draft/Train, сохранение и cold reopen.

Образцы: preprocessing.binning internal/apply, datamining.log_regression roles,
datamining.lin_regression apply. Использовать существующие trainConfiguredNode,
табличный reader, expected-outputs и cold-check, включая tolerance/ordered/ports.
Новые coarse-classes модули/адресные тесты, аддитивная регистрация в существующих
node contracts/support/procedure/results/observe, собственный файл навыка и
строка маршрутизации; свои train/apply сценарии существующего run-check.
Общие алгоритмы не менять без нового решения. Наблюдение каждого отказа,
red→green на production-пути и required-checks list/verify обязательны этапу 1.

parameter-schema.json вкладывается под parameters.coarse_classes.
Поле partition — строковый enum automatic; public mode — internal/apply.
Семантика, readback, null-контракт и размер proposal подробно в discovery.
Пока не подтверждены numeric/continuous, NULL/новые predictor categories,
нулевые частоты/сглаживание, внешние/ручные/замороженные классы и variables.
Не обещать их поддержку по единственному бинарному примеру.

## 5. Model-visible бюджет

| Объект | Предложение, UTF-8 Б | Лимит |
|---|---|---|
| Сжатая apply inputSchema | 11964 | 20000 |
| Карточка типа describe с пустыми pins | 3603 | 12000 |
| Строка маршрутизации | 162 | ~200 |
| Файл references/nodes/coarse-classes.md | 3537 | 6000 |
| Основной SKILL.md + строка | 49687 (база 49525) | 40000 |
| Полная apply inputSchema | 42009 (база 40219) | Только измерение |

Основной skill уже превышает бюджет базы; это передаётся в отчёт без общего
рефакторинга в данной карточке. Повторно измерить итоговые схемы/карточку и
readback с реальными pins на этапе 1. Измеритель acceptance/schema-size.mjs
ничего не регистрирует в runtime.

## 6. Следующие срезы — отдельные назначения

- Непрерывный признак: предквантование, границы и включение верхнего предела.
- Внешнее разбиение и таблицы диапазонов/категорий.
- Ручная корректировка, freeze/retrain, графики/детализация и инварианты ties.
- Пропущенные/новые категории predictor, нулевые частоты и smoothing.

Прежняя широкая матрица не является назначением этапа 1 этого среза.
Каждый новый критерий и oracle фиксируются до соответствующих прогонов.

## 7. LAB-1046: непрерывные/внешние/ручные классы, checkpoint этапа 0

07.11.2026, mas2, worker назначенной пары `01a124e5-1623-7a32-93c7-a3754c7dbdd7`,
только `https://app.loginom.ai/app/?testable=true`, Loginom 7.4.2.
База текущей v040 по регламенту: `9ec18ee987bc16d953f985a173d85e8b08a93020`
(назначенная точка afaa1f3). Runtime не менялся, CLI не собирался, run-check нет.
**Checkpoint:** исследование остановлено после двух восстановлений сеанса;
критерии не утверждены, continuous/external/manual/frozen не объявлены принятыми.

### Наблюдение и границы доказательства

В UI узел называется «Конечные классы», а не «Крупные классы».
`Graph;Конечные_классы` содержит Input_Data-0, Input_Add и три Output_Data-0/1/2.
Связь с исходным смешанным источником не зафиксировалась; отдельный источник
continuous.csv с тремя проверенными полями также не дал подтверждённой связи.
Причина не установлена. Не считать это отказом будущего обработчика или модели.
Данные/схемы чужих аккаунтов не использовались.

Для осмотра настроек в собственном draft вручную объявлены X Integer/continuous
и Target String/discrete через `TuneDataSourceInputPortWizard;btnAddMappingColumn`
и `EditTuneColumnDefForm`. Это **объявленная схема без подключённых данных**.
На `CoarseClassesWizard-1` назначены X=input, Target=target, event=yes.
У numeric поля меню роли предлагает unused/input; у дискретной цели дополнительно target.
Переход на `CoarseClassesWizard-2` возможен без вычисления классов.

В `CoarseClassesWizard-1;CoarseClassesSettingsFrame` подтверждены:

| TID | Наблюдение |
|---|---|
| chkPreQuanting;ValueControl | Предварительное квантование, default=false |
| edtPreQuantingCount;ValueControl | default=0, UI 0…9007199254740991 |
| chkIncludeHighBounds;ValueControl | Включение верхней границы, default=false |
| edtMinimalClassRate;ValueControl | default=5, UI 0…50 |
| edtDesiredClassCount;ValueControl | default=5, UI 1…1000 |
| edtUniformityCoefficient;ValueControl | default=0, UI 0…100 |

На странице классов `CoarseClassesEditor;btnAllowClassModifying` имеет tooltip
«Редактировать разбиение», рядом btnMergeWithLeft/Right, btnCalculateIV,
таблица с границами и WoE/IV. Наличие кнопок при пустых классах **не доказывает**
успешную ручную правку, freeze, подключение внешних диапазонов или сохранение модели.
Они, новые/NULL-категории и нулевые частоты остаются следующим шагом исследования.
Второй разрыв произошёл до завершения этого мастера; draft закрыт без коммита.

### Приёмочное предложение и оценка

[Статусы и математические допущения](acceptance/modes/README.md),
[oracle](acceptance/modes/oracle.py), [схема](acceptance/modes/parameter-schema.proposal.json),
[карточка](acceptance/modes/node-card.proposal.json).
Continuous/manual: явные границы 0/7/14, независимые частоты 3/1 и 1/3,
WoE ±ln(3), общий IV=ln(3), три полных выхода, исходный порядок.
Unknown→NULL и additive alpha=0.5 — карантинные гипотезы, не native-факты.
Задания позволяют сообщить нативный отказ; ожидаемый JSON этих гипотез пока
не является обязательным результатом. Матрица external/frozen ещё не подготовлена.

Оценка — **3 цикла** после завершения этапа 0: continuous + external mapping;
manual/frozen и saved-model lifecycle; unknown/NULL/zero-frequency с подтверждённой
формулой. Собственные модули packages/loginom-runtime/client/lib:
`coarse-classes-{parameters,context,procedure,node,output,readback}.mjs`.
Текущий validator допускает только discrete String и automatic partition;
context не читает continuous-controls, output/readback рассчитаны на прежний срез.

Численные LowerBound/UpperBound отчёта остаются Variant. Для них уже существует
`typedVariants:true` в makeNodePortOutputCode; его можно передать из собственного
coarse-classes-output, channel не запрещает флаг. Не требуется копировать private
Collapse-guard или менять общий reader. Это оценка по production-коду, ещё не живой PASS.
Допустимая общая работа — аддитивная регистрация схем/метаданных типа, включая
дополнительный табличный вход. Иная общая необходимость пока не доказана.
Размеры карточки, справки и оглавления воспроизводятся общим measure-modes.mjs;
сводная таблица находится в новом разделе [smoothing-подплана](../preprocessing-smoothing/plan.md).


## 8. LAB-1055 checkpoint

07.11.2026, mas3: **blocked после второго разрыва связи**, по лимиту назначения.
Живое исследование остановлено. Оба восстановления выполнены штатно;
второе использовано только для Save/закрытия собственного пакета/logout.
Назначенная база `v040@3ff0d88e486057228eea87935cf5aed11e9f46be` включена
в ветку от открытого #851 (`coverage-binning-modes@266c9a0ab`).
Только docs/fixtures/oracle; runtime/публичный SKILL.md не менялись, CLI не собирался.
Ранее утверждённые назначением случаи повторно не принимались.
[Актуальные задания и статусы](acceptance/modes/README.md), TID и ограничения —
последний раздел [discovery](discovery.md). Предложения не зарегистрированы
в run-check, критерии требуют утверждения владельцем до этапа 1.

Frozen: IsLocked выбран штатно; после замены источника и явного Train сохранились
B=0/A=1, частоты пересчитаны. На pure N=4 WoE=±ln(8), общий IV=(7/4)ln(8).
Alpha=0.5 с перенормировкой не согласуется с этим опытом. Epsilon=1/(2N) —
предложение только для N=4; другой N not_checked. External готового разбиения
связан native дополнительным портом2 (логический табличный индекс1),
auto-map принят, исполнение успешно: A=0/B=1 перенумерованы по новому WoE.
Три численные таблицы совпали с Decimal oracle (max abs 4.45e-16), однако
source имел технический alias вместо RowID: полного task-PASS нет.
Минимальный 3-польный external CSV — предложение, live использовал native17;
нужен контрастный класс с несколькими категориями. Mixed A/Z/NULL с NULL-целью
дал native отказ уникальных значений: отдельные факторы не изолированы.
Раздельные Unknown/NULL, другой N, external оптимизация и persistence —
not_checked по лимиту переподключений, старые expected в карантине.

Оценка — **3 цикла** после завершения исследования/утверждения: external
column mapping и готовое разбиение; frozen и сохранение/повторное открытие;
изолированные Unknown/NULL/zero-frequency и стандартная приёмка всех трёх портов.
Собственные `client/lib/coarse-classes-{parameters,context,procedure,node,output,
readback}.mjs` в packages/loginom-runtime, адресные тесты. Общая работа — только
аддитивные schema/readback, additional input metadata, inventory собственного
мастера, справка/сценарии; необходимости менять общий reader/verifier не установлено.

Актуальные размеры всех трёх предложений — [общая таблица LAB-1055](../preprocessing-smoothing/plan.md#актуальный-бюджет-lab-1055).
