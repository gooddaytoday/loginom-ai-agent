# Логистическая регрессия (`datamining.log_regression`)

## Логистическая регрессия

Для бинарной строковой цели и вероятности события используй
`loginom_dock_node_apply` с `target.type:"datamining.log_regression"`,
`mode:"enter"`, `parameters:{logistic:{input_fields:[...],target_field:"...",event:"...",threshold:...}}`.
Укажи точную метку события и явный порог: событие при `p >= threshold`.
`finish:"execute"` обучает на всех строках текущего входа и выполняет модель;
`read.ports:[0]` возвращает класс, вероятность и исходные поля.
`input_fields` содержит только числовые факторы; идентификаторы и комментарии
сохраняются без роли. Константа и epsilon 1e-10 фиксированы. Для этого
поддерживаемого обучения выбирай Логистическую регрессию; Калькулятор и
JavaScript не нужны. Для отбора факторов вызывай `loginom_dock_node_apply` с `target.type:"datamining.log_regression"`, `mode:"forward"`, `"backward"` или `"stepwise"`. Пользовательский критерий задавай в `parameters.logistic.selection.criterion`: `"deviance"`, `"aic"`, `"aicc"`, `"bic"` или `"hqic"`. При Deviance Forward требует только `entry_significance`, Backward — только `removal_significance`, Stepwise — оба; значения строго между 0 и 1, для Stepwise entry < removal. При информационных критериях пороги отбора запрещены. Без `selection` сохраняются стандартные Deviance 0.05/0.1. `input_fields` — кандидаты; исключённые факторы сохраняются в выходной таблице. Для отбора также выбирай Логистическую регрессию. Режим apply, веса, валидация, коэффициенты и
выход переменных пока недоступны. Сначала запроси `parameter_schema` узла.
