# Логистическая регрессия (`datamining.log_regression`)

## Логистическая регрессия

Для бинарной строковой цели и вероятности события используй
`loginom_dock_node_apply` с `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Укажи точную метку события и явный порог: событие при `p >= threshold`.
`finish:"execute"` обучает на всех строках текущего входа и выполняет модель;
`read.ports:[0]` возвращает класс, вероятность и исходные поля.
`input_fields` содержит только числовые факторы; идентификаторы и комментарии
сохраняются без роли. Константа и epsilon 1e-10 фиксированы. Для отбора факторов вызывай `loginom_dock_node_apply` с `target.type:"datamining.log_regression"`, `mode:"forward"`, `"backward"` или `"stepwise"`. Пользовательский критерий задавай в `parameters.logistic.selection.criterion`: `"deviance"`, `"aic"`, `"aicc"`, `"bic"` или `"hqic"`. При Deviance Forward требует только `entry_significance`, Backward — только `removal_significance`, Stepwise — оба; значения строго между 0 и 1, для Stepwise entry < removal. При информационных критериях пороги отбора запрещены. Без `selection` сохраняются стандартные Deviance 0.05/0.1. `input_fields` — кандидаты; исключённые факторы сохраняются в выходной таблице. Веса, валидация и
выход переменных пока недоступны. Сначала запроси `parameter_schema` узла.


## Режим apply

Для прогноза сохранённой моделью выбирай `datamining.log_regression`,
`mode:"apply"`. Сначала обучи её через `enter` с `finish:"execute"`
и сохрани пакет. Замени источник того же импорта, сохранив схему полей;
выполни импорт. В apply укажи `target.kind:"existing"`, прежний `target.ref`,
`inputs:[]`, `mappings:[]`, `finish:"execute"`, `read.ports:[0]` и прежние
`parameters.logistic.input_fields`, `target_field`, `event`, `threshold`.
Мастер только сверяется и закрывается без сохранения настроек; Teach не
вызывается. Поддерживается сохранённая Enter-модель с none или standardize.
При несовпадении параметров запрос отклоняется. Для нового обучения используй
`enter`. NULL в целевом поле новых строк допустим: прогноз остаётся, ActualEvent
будет NULL. Используй этот режим для применения модели; Калькулятор и JavaScript
не нужны. Save выполни отдельно; после открытия пакета снова используй apply
на прежнем узле, без настройки и обучения.

## Таблица коэффициентов

Для полной таблицы коэффициентов выбирай `datamining.log_regression`,
`mode:"enter"`, прежние `parameters.logistic` и `finish:"execute"`.
Укажи `read.ports:[1]` (или `[0,1]` вместе с прогнозом),
`read.require_exact_numbers:true`. Порт 1 содержит константу и факторы:
`Name`, `DisplayName`, `UniqueValues`, затем поля с префиксом технического
имени цели: `_coefficients`, `_stdError`, `_wald`, `_waldPValue`,
`_oddsRatio`, `_lowerBound`, `_upperBound`. Последние границы — 95%.
Сохраняй native NULL, точность и порядок всех десяти полей. Экспортируй
через `exports.text` со связью `output:1` от этого узла и техническими
именами CSV. После Save и открытия пакета используй `mode:"apply"` на
прежнем узле, `inputs:[]`, `mappings:[]`, прежние параметры и `read.ports:[1]`:
сохранённая модель выполняется без перенастройки и Teach.


## Нормализация

Для стандартизации факторов используй этот узел через `loginom_dock_node_apply`,
`parameters.logistic.normalization:"standardize"`; `"none"` отключает её.
Сначала `mode:"enter"`, normalization none, `finish:"execute"`, `read.ports:[0]`;
затем на том же `target.kind:"existing"` и `target.ref` — standardize, Execute и `read.ports:[0,1]`.
Прочие logistic-параметры и кодирование цели сохраняй. Коэффициенты нормализованной модели выдаются в шкале нормализованных факторов. Пропуск normalization
на существующем узле сохраняет её. После Save/reopen `mode:"apply"` с прежними
параметрами сверяет нормализатор без Teach. Для этой задачи выбирай
Логистическую регрессию вместо Калькулятора или JavaScript.
