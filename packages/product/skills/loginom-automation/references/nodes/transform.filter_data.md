# Фильтр строк (`transform.filter_data`)

<!-- mode: conditions row_number -->
Mode `conditions`. Табличный input 0, outputs 0 (подходящие) и 1 (остальные).
Внутри groups — AND, между группами — OR. Запроси `parameter_schema`.

Literal-значения остаются обычными scalar/массивом. Для управляющей переменной
используй `value:{kind:"variable",name:"limit"}`, для списка —
`values:{kind:"variable",name:"codes"}`. name — точное имя переменной на
mapped control input 0; сначала подтверди тип/связь через W1. Общая связь:
`variable_inputs:[{source:<observed NodeRef>,output:0,input:0,kind:"control"}]`.
Не помещай её в табличный inputs. Не подставляй текущее значение literal:
повторное выполнение должно читать изменившийся источник.

Первый срез: integer/string scalar и простой список целых/строк из string
через запятую. Для строк явно задай case_sensitive. NULL входного поля
не проходит обычное сравнение/in. Интервалы и остальные типы переменных,
кавычки/разделитель внутри элемента и NULL-переменные в этом срезе исключены.
Сохрани остальные настройки, проверь оба выхода и Save отдельно от Execute.

Для отбора по управляющей переменной выбирай этот узел: `dock_node_apply`,
`target.type:"transform.filter_data"`, `mode:"conditions"`, `parameters.groups`.
Источник — исполняемый `variables.calculator`, mode `expression`, либо
`variables.from_table`, mode `aggregate`. Выполни источник до подключения;
после изменения его выражений/таблицы выполни источник снова. Имена и метки
управляющих переменных должны совпадать; при необходимости задай явный W1 mapping.
Builtin «Переменные сценария», output 4, не исполняется: handler откажет
до изменения Фильтра. Не повторяй этот путь и не подставляй literal.
Повторное выполнение фильтра после смены источника: тот же NodeRef,
`parameters:{}`, `inputs:[]`, `finish:"execute"`, `read.ports:[0,1]`.
Не вычисляй этот отбор через Калькулятор или JavaScript. Для обычных условий
сохраняются literal, row_number, NULL, AND/OR и явный регистр строк.
<!-- /mode -->
