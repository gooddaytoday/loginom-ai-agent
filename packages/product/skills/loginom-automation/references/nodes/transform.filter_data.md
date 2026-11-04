# Фильтр строк (`transform.filter_data`)

Mode `conditions`. Табличный input 0, outputs 0 (подходящие) и 1 (остальные).
Внутри groups — AND, между группами — OR. Запроси `parameter_schema`.

Literal-значения остаются обычными scalar/массивом. Для управляющей переменной
используй `value:{kind:"variable",name:"limit"}`, для списка —
`values:{kind:"variable",name:"codes"}`. name — точное имя переменной на
mapped control input 0; сначала подтверди тип/связь через W1. Общая связь:
`variable_inputs:[{source:<observed NodeRef>,output:4,input:0,kind:"control"}]`.
Не помещай её в табличный inputs. Не подставляй текущее значение literal:
повторное выполнение должно читать изменившийся источник.

Первый срез: integer/string scalar и простой список целых/строк из string
через запятую. Для строк явно задай case_sensitive. NULL входного поля
не проходит обычное сравнение/in. Интервалы и остальные типы переменных,
кавычки/разделитель внутри элемента и NULL-переменные в этом срезе исключены.
Сохрани остальные настройки, проверь оба выхода и Save отдельно от Execute.

Для отбора по управляющей переменной выбирай этот узел: `dock_node_apply`,
`target.type:"transform.filter_data"`, `mode:"conditions"`, `parameters.groups`.
Создание/изменение источника — `variables.user`, mode `values`; используй
наблюдённый builtin NodeRef и `parameters.variables` с name/type/value.
Повторное выполнение фильтра после смены источника: тот же NodeRef,
`parameters:{}`, `inputs:[]`, `finish:"execute"`, `read.ports:[0,1]`.
Не вычисляй этот отбор через Калькулятор или JavaScript. Для обычных условий
сохраняются literal, row_number, NULL, AND/OR и явный регистр строк.
