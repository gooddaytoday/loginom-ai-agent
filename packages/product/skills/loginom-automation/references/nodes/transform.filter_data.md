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
После изменения источника выполни его снова; имена и метки переменных должны совпадать.
Для builtin «Переменные сценария» используй общий `bindings` ниже;
прежний operand API требует исполняемый источник.
Повторное выполнение фильтра после смены источника: тот же NodeRef,
`parameters:{}`, `inputs:[]`, `finish:"execute"`, `read.ports:[0,1]`.
Не вычисляй этот отбор через Калькулятор или JavaScript. Для обычных условий
сохраняются literal, row_number, NULL, AND/OR и явный регистр строк.

## Общая привязка scalar-порога

Запроси `dock_action_describe` с этим типом и mode `conditions`, прочитай
`binding_schema`. Для Amount > Limit задай условие
`{field:{kind:"input_field",name:"Amount"},type:"integer",operator:">"}`
в `parameters.groups:[[...]]`, без `value`, и top-level
`bindings:[{parameter:"/groups/0/0/value",variable:{kind:"control",input:0,name:"Limit"}}]`.
Не совмещай binding с literal или прежним `{kind:"variable"}` в этом слоте.
Подключи W1 `variable_inputs`, kind `control`, input 0. Источник builtin
`variables.user` использует output 4; настрой его mode `values`, finish `done`,
сохрани пакет и прочитай переменные отдельным `dock_node_read`. Builtin не Execute.
Поддержаны точные integer/string scalar-сравнения, без NULL и преобразований;
для string явно `case_sensitive`. Проверь `configuration.bindings` после Done.
После изменения только Limit выполни тот же Фильтр: `parameters:{}`, `bindings:[]`,
`inputs:[]`, `mappings:[]`, finish `execute`, read ports `[0,1]`.
Настройки сохраняются. Не создавай второй Фильтр.
Пустой bindings сохраняет привязки; снятие привязки не поддержано.
После Save/reopen проверяй variable mode и оба результата, не заменяй binding константой.

## Продолжение пакета

В продолжении после открытия пакета сохранение не доказывает активность выхода.
Перед новым `transform.filter_data` подтверди нужный выход того же существующего табличного
источника. Используй `loginom_dock_node_read` с успешной локальной операцией
текущей подготовки; если её нет — existing apply с точным ref, прежним типом/mode,
`inputs:[]`, пустым patch по схеме и `finish=execute`. Дождись подтверждённого
выполнения/чтения источника; примеры пустого patch — [Граф и узлы](../canvas.md#продолжение-пакета).
Отказ `filter preflight requires an active source output` с `NOT_APPLIED`,
`effect_possible=false`, `cleanup_complete=true` означает, что новый узел ещё не
создан: после выполнения источника повтори запрос с новым operation_id, не
пересоздавая источник и не освобождая несуществующий целевой узел. Это не разрешает
повтор неизвестного запуска или автоматический запуск REST/JS/экспорта вне просьбы.
<!-- /mode -->
