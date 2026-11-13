# Логистическая регрессия (`datamining.log_regression`)

<!-- mode: enter forward backward stepwise apply -->
## Обучение и прогноз

`loginom_dock_node_apply`, `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Цель — два строковых класса. Событие: `p >= threshold`.
Числовые факторы — в `input_fields`;
остальные поля сохраняются без роли.
`finish:"execute"` обучает на текущем входе и прогнозирует; `read.ports:[0]`
возвращает прогноз и исходные поля. Константа, epsilon=1e-10.
Без валидации и переменных. Запроси `parameter_schema`.

## Частотные веса Real

Enter: `parameters.logistic.weight_field:"Weight"` — положительные частотные
веса Real. Исключи поле из input_fields; оно сохраняется в прогнозе, без
нормализации. Integer — отказ до редактирования ролей, без конвертации.
После открытия apply с прежним weight_field проверяет роль без Teach.

## Отбор факторов

`forward`, `backward`, `stepwise`; критерий:
`parameters.logistic.selection.criterion`: `deviance`, `aic`, `aicc`, `bic`, `hqic`.
Для Deviance Forward требует `entry_significance`, Backward — `removal_significance`,
Stepwise — оба, 0 < entry < removal < 1. Для прочих критериев пороги запрещены.
Без selection сохраняются стандартные Deviance 0.05/0.1. input_fields — кандидаты;
исключённые факторы остаются в выходной таблице.

## Сохранённая Enter-модель

`mode:"apply"` — только для ранее обученной Enter-модели с none или standardize.
Сохрани пакет, замени источник прежнего импорта с той же схемой и выполни импорт.
На прежнем узле: `target.kind:"existing"`, свежий `target.ref`, `inputs:[]`,
`mappings:[]`, прежние logistic-параметры, `finish:"execute"`, `read.ports:[0]`.
Apply сверяет настройки, закрывает без Save/Teach; несовпадение — отказ.
Обучение: enter. NULL Target даёт NULL ActualEvent.
После Save/reopen обнови refs наблюдением графа и повторяй apply без перенастройки.

## Коэффициенты

На этом узле `mode:"enter"`, прежние параметры, `finish:"execute"`, `read.ports:[1]`
(или [0,1]), `read.require_exact_numbers:true`. Порт 1: Name, DisplayName,
UniqueValues, затем поля с префиксом цели: _coefficients, _stdError, _wald,
_waldPValue, _oddsRatio, _lowerBound, _upperBound (последние — 95%).
NULL, точность и порядок сохранены. CSV: `exports.text`, output:1, технические имена.
После Save/reopen Enter-модель
читай через apply с прежними параметрами и read.ports:[1], без Teach.

## Нормализация

`parameters.logistic.normalization:"standardize"` стандартизует числовые факторы,
`"none"` отключает её. Сначала enter/none, Execute, read.ports:[0]; затем тот
же existing target/ref, standardize, Execute, read.ports:[0,1]. Остальное сохраняй. Коэффициенты нормализованной модели выдаются в шкале
нормализованных факторов. Пропуск normalization на существующем узле сохраняет её.
После Save/reopen apply с прежними параметрами сверяет нормализатор без Teach.

<!-- /mode -->

<!-- mode: ridge lasso -->
## Ручные Ridge (L2) и LASSO (L1)

`mode:"ridge"`: `parameters.logistic.regularization:{lambda_ridge:1}`.
`mode:"lasso"`: `parameters.logistic.regularization:{lambda_lasso:1}`.
λ>0; прочие logistic-параметры обязательны, selection запрещён.
Задай input_fields, target_field, event и threshold; read.ports:[0] — полный прогноз.
normalization none/standardize задаёт факторы; пропуск на существующем узле сохраняет её.
λ ручной, константа не штрафуется; Execute обучает и прогнозирует. Повтор —
тот же existing target/ref, inputs:[], прежние параметры. Save отдельно.
После открытия обнови refs наблюдением графа.
Apply — только Enter. После reopen на прежнем узле — прежний ridge/lasso,
прежние параметры, inputs:[], mappings:[], `finish:"done"`, `read.ports:[]`, без Teach.
После reopen CSV: новый exports.text от output:0, Execute, технические имена
и сохранённый порядок. Проверь CSV, сохрани пакет.
<!-- /mode -->
