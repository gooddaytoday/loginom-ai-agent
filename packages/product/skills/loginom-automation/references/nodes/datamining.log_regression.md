# Логистическая регрессия (`datamining.log_regression`)

<!-- mode: enter forward backward stepwise apply -->
## Обучение и прогноз

`loginom_dock_node_apply`, `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Цель: два String-класса; событие `p >= threshold`.
input_fields — числовые факторы; прочие поля сохраняются без роли.
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
Deviance: Forward — `entry_significance`, Backward — `removal_significance`,
Stepwise — оба, 0 < entry < removal < 1. Прочие критерии запрещают пороги.
Без selection: Deviance 0.05/0.1. input_fields — кандидаты; исключённые
факторы остаются в выходе.

## Enter apply

`mode:"apply"` — только для ранее обученной Enter-модели с none или standardize.
Сохрани пакет; замени файл прежнего импорта с той же схемой, выполни импорт.
На прежнем узле: `target.kind:"existing"`, свежий `target.ref`, `inputs:[]`,
`mappings:[]`, прежние logistic-параметры, `finish:"execute"`, `read.ports:[0]`.
Apply сверяет настройки; несовпадение — отказ. Закрывает без Save/Teach.
Обучение: enter. NULL Target → NULL ActualEvent.
Save/reopen: обнови refs графом, apply без перенастройки.

## Коэффициенты

`mode:"enter"`, прежние параметры, `finish:"execute"`, `read.ports:[1]`
или [0,1], `read.require_exact_numbers:true`. Порт 1: Name, DisplayName,
UniqueValues, затем поля с префиксом цели: _coefficients, _stdError, _wald,
_waldPValue, _oddsRatio, _lowerBound, _upperBound (последние — 95%).
NULL, точность и порядок сохранены. CSV: `exports.text`, output:1, технические имена.
Save/reopen: Enter-модель читай через apply с прежними параметрами,
read.ports:[1], без Teach.

## Нормализация

`parameters.logistic.normalization:"standardize"` стандартизует факторы;
`"none"` отключает нормализацию. Сначала enter/none, Execute, read.ports:[0]; затем тот
же existing target/ref, standardize, Execute, read.ports:[0,1]. Остальное сохраняй. Коэффициенты — в шкале нормализованных факторов.
Пропуск normalization на existing сохраняет её.
После Save/reopen apply с прежними параметрами сверяет нормализатор без Teach.

<!-- /mode -->

<!-- mode: ridge lasso elastic_net -->
## Ridge / LASSO / Elastic Net

`mode:"ridge"`: `parameters.logistic.regularization:{lambda_ridge:1}`.
`mode:"lasso"`: `parameters.logistic.regularization:{lambda_lasso:1}`.
`mode:"elastic_net"`: `parameters.logistic.regularization:{lambda_lasso:1,lambda_ridge:1}`.
λ раздельные ручные; без alpha/автонастройки.
λ>0; прочие logistic-параметры обязательны, selection запрещён.
Обязательны input_fields, target_field, event, threshold; read.ports:[0] — полный прогноз.
normalization none/standardize — факторы; пропуск сохраняет её на existing.
Константа не штрафуется; Execute обучает и прогнозирует. Повтор:
тот же existing target/ref, inputs:[], прежние параметры. Save отдельно;
reopen: обнови refs графом.
Apply — только Enter. После reopen на прежнем узле — прежний ridge/lasso/elastic_net,
прежние параметры, inputs:[], mappings:[], `finish:"done"`, `read.ports:[]`, без Teach.
Reopen CSV: новый exports.text от output:0, Execute, технические имена
и сохранённый порядок; проверь CSV, Save.
<!-- /mode -->
