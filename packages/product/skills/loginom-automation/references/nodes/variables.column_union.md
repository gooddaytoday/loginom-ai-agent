# variables.column_union / append_variables

Для объединения двух наборов параметров используй `dock_node_apply`:
`target.type:"variables.column_union"`, `mode:"append_variables"`.
Это native «Соединение (переменные)» в группе «Переменные».
Передай `inputs:[]`, `mappings:[]`, `parameters:{}` либо
`parameters:{column_union:{mapping:"automatic"}}`.

В `variable_inputs` укажи два разных источника из свежего графа:
`{source:NodeRef,output:наблюдаемый_порт,input:0,kind:"variables"}`
и такой же объект с `input:1`. Слева — вход 0, справа — вход 1.
Не переноси refs из другого документа. Не создавай дополнительные входы.
`finish:"execute"`, `read:{ports:[],variable_ports:[0],sample_rows:0,
require_exact_numbers:true}` возвращает полный native VariablesForm:
имя, метку, объявленный тип и типизированное значение каждой переменной.
Сначала идут все переменные входа 0, затем входа 1. Повторяющиеся имена
получают native уникальные имена: a0/a0/a1 → a0/a1/a2, title → title_1.
Читай фактические имена результата. Метки сохраняются без нумерации.
NULL сохраняет исходный тип и отличается от пустой строки, false и нуля.
Поддерживаются integer, real, string, boolean; максимум 128 переменных.

Для обновления источника используй его собственный тип и параметры.
У Калькулятора переменных patch существующего выражения:
`target:{kind:"existing",name:"saved_name"},formula:"новое_выражение"` внутри
`parameters.expressions`; остальные выражения не передавай.
Затем повтори `dock_node_apply` на том же Соединении с
`target.kind:"existing"`, прежним NodeRef, `variable_inputs:[]`,
`inputs:[]`, `parameters:{}`, `mappings:[]` и `finish:"execute"`.
Пустой список сохраняет связи; автоматическое соответствие сохраняется.
Не заменяй узел Калькулятором или JavaScript. Ручные mappings,
преобразования типов, управляющий и третий входы пока не поддерживаются.
После чтения сохрани пакет через `package.save_checkpoint`.
