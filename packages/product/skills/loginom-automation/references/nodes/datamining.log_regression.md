# Логистическая регрессия (`datamining.log_regression`)

<!-- mode: enter forward backward stepwise apply -->
## Обучение и прогноз

Используй `loginom_dock_node_apply`, `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Цель — дискретная строка с двумя непустыми классами. Укажи точную метку события
и порог: событие при `p >= threshold`. Числовые факторы — в `input_fields`;
идентификаторы, комментарии и остальные поля сохраняются без роли.
`finish:"execute"` обучает на текущем входе и прогнозирует; `read.ports:[0]`
возвращает класс, вероятность и исходные поля. Константа и epsilon 1e-10 фиксированы.
Веса, валидация и выход переменных недоступны. Сначала запроси `parameter_schema`.

## Отбор факторов

Режимы `forward`, `backward`, `stepwise`; критерий —
`parameters.logistic.selection.criterion`: `deviance`, `aic`, `aicc`, `bic`, `hqic`.
Для Deviance Forward требует `entry_significance`, Backward — `removal_significance`,
Stepwise — оба: 0 < entry < removal < 1. Информационные критерии запрещают пороги.
Без selection сохраняются стандартные Deviance 0.05/0.1. input_fields — кандидаты;
исключённые факторы остаются в выходной таблице.

## Сохранённая Enter-модель

`mode:"apply"` — только для ранее обученной Enter-модели с none или standardize.
Сохрани пакет, замени источник прежнего импорта с той же схемой и выполни импорт.
На прежнем узле: `target.kind:"existing"`, свежий `target.ref`, `inputs:[]`,
`mappings:[]`, прежние logistic-параметры, `finish:"execute"`, `read.ports:[0]`.
Apply сверяет настройки и закрывает мастер без сохранения и Teach; несовпадение
отклоняется. Для обучения — enter. NULL в новой цели допустим: ActualEvent будет NULL.
После Save/reopen обнови refs наблюдением графа и повторяй apply без перенастройки.

## Коэффициенты

На этом узле `mode:"enter"`, прежние параметры, `finish:"execute"`, `read.ports:[1]`
(или [0,1]), `read.require_exact_numbers:true`. Порт 1: Name, DisplayName,
UniqueValues, затем поля с префиксом цели: _coefficients, _stdError, _wald,
_waldPValue, _oddsRatio, _lowerBound, _upperBound (последние — 95%).
Сохрани native NULL, точность и порядок всех десяти полей. Экспорт — новый
`exports.text` от output:1, технические имена. После Save/reopen Enter-модель
читай через apply с прежними параметрами и read.ports:[1], без Teach.
Калькулятор и JavaScript не нужны.

## Нормализация

`parameters.logistic.normalization:"standardize"` стандартизует числовые факторы,
`"none"` отключает её. Сначала enter/none, Execute и read.ports:[0]; затем на том
же existing target/ref — standardize, Execute и read.ports:[0,1]. Прочие параметры
и кодирование цели сохраняй. Коэффициенты нормализованной модели выдаются в шкале
нормализованных факторов. Пропуск normalization на существующем узле сохраняет её.
После Save/reopen apply с прежними параметрами сверяет нормализатор без Teach.

<!-- /mode -->

<!-- mode: ridge -->
## Ridge (L2)

`mode:"ridge"`, `parameters.logistic.regularization:{lambda_ridge:1}` (либо λ>0
пользователя); остальные logistic-параметры обязательны, selection запрещён.
Задай input_fields, target_field, event и threshold; read.ports:[0] — полный прогноз.
normalization none/standardize задаёт факторы; пропуск на существующем узле сохраняет её.
λ ручной, константа не штрафуется; Execute обучает и прогнозирует. Повтор —
тот же existing target/ref, inputs:[], прежние параметры. Save отдельно.
После открытия обнови workflow_ref и target.ref наблюдением графа.
Не используй Enter-only mode apply для Ridge. На прежнем узле — ridge,
прежние параметры, inputs:[], mappings:[], `finish:"done"`, `read.ports:[]`, без Teach.
Первый CSV после открытия — новый exports.text от актуального output:0,
Execute, технические имена и порядок сохранённого порта. Проверь CSV и сохрани пакет.
<!-- /mode -->
