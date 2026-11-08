# Фильтр строк (`transform.filter_data`)

<!-- mode: conditions row_number -->
Mode `conditions`. Табличный input 0, outputs 0 (подходящие) и 1 (остальные).
Внутри groups — AND, между группами — OR. Запроси `parameter_schema`.

Legacy scalar: `value:{kind:"variable",name:"limit"}`, для списка —
`values:{kind:"variable",name:"codes"}`. name — точное имя переменной на
mapped control input 0; сначала подтверди тип/связь через W1. Общая связь:
`variable_inputs:[{source:<observed NodeRef>,output:0,input:0,kind:"control"}]`.
Не помещай её в табличный inputs. Не подставляй текущее значение literal:
повторное выполнение должно читать изменившийся источник.

Первый срез: integer/string scalar и простой список целых/строк из string
через запятую. Для строк явно задай case_sensitive. NULL входного поля
не проходит обычное сравнение/in. Интервалы и остальные типы переменных,
кавычки/разделитель внутри элемента и NULL-переменные в этом срезе исключены.

Для отбора по управляющей переменной выбирай этот узел: `dock_node_apply`,
`target.type:"transform.filter_data"`, `mode:"conditions"`, `parameters.groups`.
Источник — исполняемый `variables.calculator`, mode `expression`, либо
`variables.from_table`, mode `aggregate`. Выполни источник до подключения
и после изменения; имена и метки переменных должны совпадать.
Для builtin «Переменные сценария» используй общий `bindings` ниже;
прежний operand API требует исполняемый источник.
Повторное выполнение фильтра после смены источника: тот же NodeRef,
`parameters:{}`, `inputs:[]`, `finish:"execute"`, `read.ports:[0,1]`.
Не вычисляй этот отбор через Калькулятор или JavaScript.

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
Привязка не меняет автосинхронизацию выхода: без output mappings сохраняй
штатные настройки Фильтра. Явные настройки выхода задаются через `mappings`.
Порядок полей бери из последней schema: после Save/reopen autosync может его менять.
Для привязки существующего условия используй `parameters:{}` и `bindings`;
pointer относится к сохранённым groups. Остальные условия и их строки сохраняются.
После изменения только Limit выполни тот же Фильтр: `parameters:{}`, `bindings:[]`,
`inputs:[]`, `mappings:[]`, finish `execute`, read ports `[0,1]`.
Не создавай второй Фильтр.
Без patch повторное Execute идёт read-only путём для всех Фильтров, включая
legacy: `parameters:{}`, `inputs:[]`, `mappings:[]`, без `variable_inputs` и bindings.
При чтении UI используется единственный видимый корень `FilterDataPanel`.
Пустой bindings сохраняет привязки; снятие привязки не поддержано.
После Save/reopen проверяй variable mode и оба результата, не заменяй binding константой.

## Продолжение пакета

Save не доказывает активность табличного источника после открытия пакета.
До нового Фильтра подтверди выход того же источника: `dock_node_read` с успешной
операцией текущей подготовки либо existing apply с прежними ref/type/mode,
пустым patch по схеме, `inputs:[]`, `finish:execute`; дождись результата.
Примеры — [Граф и узлы](../canvas.md#продолжение-пакета).
`filter preflight requires an active source output` с NOT_APPLIED,
effect_possible=false и cleanup_complete=true: новый Фильтр не создан.
Выполни источник, повтори запрос с новым operation_id. Не повторяй неизвестный
запуск и не запускай REST/JS/экспорт вне просьбы пользователя.
<!-- /mode -->
