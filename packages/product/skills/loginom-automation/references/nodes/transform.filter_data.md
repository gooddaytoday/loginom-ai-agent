# Фильтр строк (`transform.filter_data`)

<!-- mode: conditions row_number -->
Mode `conditions`. Табличный input 0, outputs 0 (подходящие) и 1 (остальные).
Внутри groups — AND, между группами — OR. Запроси `parameter_schema`.

Legacy scalar: `value:{kind:"variable",name:"limit"}`, для списка —
`values:{kind:"variable",name:"codes"}`. name — точное имя переменной на
mapped control input 0; сначала подтверди тип/связь через W1. Общая связь:
`variable_inputs:[{source:<observed NodeRef>,output:0,input:0,kind:"control"}]`.
Не помещай её в табличный inputs. Повторное Execute читает источник.

Legacy: integer/string scalar и простой список целых/строк из string через запятую. Для строк явно задай case_sensitive. NULL входного поля
не проходит обычное сравнение/in. Переменные интервалов, кавычки/разделитель внутри элемента исключены.

Для отбора по управляющей переменной выбирай этот узел: `dock_node_apply`,
`target.type:"transform.filter_data"`, `mode:"conditions"`, `parameters.groups`.
Источник — исполняемый `variables.calculator`, mode `expression`, либо
`variables.from_table`, mode `aggregate`. Выполни источник до подключения
и после изменения; имена и метки переменных должны совпадать.
Builtin: `bindings`; сохранённый `{kind:"variable",name}` допустим на прежней позиции с тем же name.
Повторное выполнение фильтра после смены источника: тот же NodeRef,
`parameters:{}`, `inputs:[]`, `finish:"execute"`, `read.ports:[0,1]`.
Не вычисляй этот отбор через Калькулятор или JavaScript.

## Общая привязка scalar-порога

Прочитай `binding_schema` в `dock_action_describe` mode `conditions`. Для Amount > Limit:
`{field:{kind:"input_field",name:"Amount"},type:"integer",operator:">"}`
в `parameters.groups:[[...]]`, без `value`, и top-level
`bindings:[{parameter:"/groups/0/0/value",variable:{kind:"control",input:0,name:"Limit"}}]`.
Binding несовместим с literal и `{kind:"variable"}` в том же слоте.
Подключи W1 `variable_inputs`, kind `control`, input 0. Источник builtin
`variables.user` использует output 4; настрой его mode `values`, finish `done`,
сохрани пакет и прочитай переменные отдельным `dock_node_read`. Builtin не Execute.
Scalar integer/real/datetime/string, без преобразований; string — `case_sensitive`.
Real NULL-порог даёт 0 подходящих и все строки в output 1. Datetime — local ISO.
После Save/cold проверь ссылки MinScore/Since, типы и оба выхода. Проверь `configuration.bindings` после Done.
Без output mappings действует autosync; явные настройки — `mappings`.
Порядок полей бери из schema: после Save/reopen autosync может его менять.
Для существующего условия: `parameters:{}` и `bindings`;
pointer относится к сохранённым groups. Остальные условия и их строки сохраняются.
После смены значений выполни тот же Фильтр: `parameters:{}`, `bindings:[]`,
`inputs:[]`, `mappings:[]`, finish `execute`, read ports `[0,1]`.
Не создавай второй Фильтр.
Первые N строк: `field:{kind:"row_number"},type:"integer",operator:"<="` без
`value`, binding того же pointer к integer TopN. Номер строки 1-based; порядок
исходный. Меняй только TopN, затем Execute того же Фильтра. После cold
проверь `row_number` и ссылку TopN. Последние N отдельным режимом не поддержаны.
Без patch повторное Execute идёт read-only путём для всех Фильтров, включая
legacy: `parameters:{}`, `inputs:[]`, `mappings:[]`, без `variable_inputs` и bindings.
При чтении UI используется единственный видимый корень `FilterDataPanel`.
Пустой bindings сохраняет привязки; снятие не поддержано.
После Save/reopen проверь variable mode и оба результата; binding остаётся ссылкой.

## Продолжение пакета

Save не доказывает активность табличного источника после открытия пакета.
До нового Фильтра подтверди выход источника: `dock_node_read` успешной операции
текущей подготовки либо existing apply с прежними ref/type/mode, пустым patch
по схеме, `inputs:[]`, `finish:execute`; дождись результата.
Примеры — [Граф и узлы](../canvas.md#продолжение-пакета).
`filter preflight requires an active source output` с NOT_APPLIED,
effect_possible=false и cleanup_complete=true: новый Фильтр не создан.
Выполни источник, повтори запрос с новым operation_id. Не повторяй неизвестный
запуск и не запускай REST/JS/экспорт вне просьбы пользователя.
<!-- /mode -->
