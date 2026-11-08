# variables.column_union / append_variables

<!-- mode: append_variables -->
Для соединения наборов параметров используй native «Соединение (переменные)»:
`dock_node_apply`, `target.type:"variables.column_union"`,
`mode:"append_variables"`, `inputs:[]`, `mappings:[]`, `parameters:{}`.
Не подменяй Соединение Калькулятором или JavaScript.
В `variable_inputs` передай разные источники из свежего графа:
`{source:NodeRef,output:наблюдаемый_порт,input:0,kind:"variables"}`,
аналогично вход 1. Не переноси refs из другого документа.
При создании можно опустить target.label: runtime назначит устойчивую подпись.
После AMBIGUOUS используй inspect, не повторяй создание узла или связей.

`finish:"execute"`, `read:{ports:[],variable_ports:[0],sample_rows:0,
require_exact_numbers:true}` возвращает полный native VariablesForm: имя,
метку, объявленный тип и типизированное значение каждой переменной.
Порядок: все переменные входа 0, затем 1, затем подключённого 2.
Повторные имена получают native уникальные имена: a0/a0/a1 → a0/a1/a2,
title → title_1. Читай фактические имена; метки не нумеруются.
Integer/real/string/boolean, до 128 переменных. NULL сохраняет тип и отличается
от пустой строки, false и нуля. Сохрани пакет через package.save_checkpoint.

Обновляй источник его собственным типом. Для variables.calculator patch:
в parameters.expressions только изменяемое выражение с
`target:{kind:"existing",name:"saved_name"},formula:"новое_выражение"`.
Затем Execute того же Соединения: existing NodeRef, `parameters:{}`,
`variable_inputs:[]`, `inputs:[]`, `mappings:[]`. Это сохраняет все связи,
автоматическое или ручное соответствие; fields повторно не передавай.

Ручной выбор, порядок, имена и метки без преобразования типов:
`parameters:{column_union:{mapping:"manual",fields:[
{input:1,source:"amount",name:"right_amount",label:"Правая сумма",type:"integer"},
{input:0,source:"amount",name:"left_amount",label:"Левая сумма",type:"integer"}
]}}`. Fields — ВЕСЬ выход в нужном порядке, неуказанные переменные исключаются.
Input — 0 или 1; source — исходное техническое имя этого входа.
Имена результата и пары input/source уникальны. Type равен исходному типу.
Loginom 7.4.2 не преобразует integer→string: preflight отказывает до изменения
источников, узла и связей. Предложи Калькулятор переменных после Соединения;
создавай его только в рамках согласованной задачи.
Для независимых констант используй отдельные variables.calculator с точными
name/label/type/константами из входного JSON; выполни и прочитай каждый источник.

Третий вход и его отсоединение: сначала создай Соединение на входах 0,1 и
прочитай полный output 0. На ЭТОМ ЖЕ existing NodeRef передай три
variable_inputs в порядке 0,1,2, kind:"variables", и
`parameters:{column_union:{mapping:"automatic"}}`.
Runtime сам нажмёт Input_Add ровно один раз и подключит вход 2, сохранив GUID
узла, первые порты и связи. Execute и полное чтение output 0 обязательны.
Для отсоединения ТОЛЬКО третьего источника: тот же existing NodeRef,
`parameters:{column_union:{mapping:"automatic",disconnect_input:2}}`,
`variable_inputs:[]`, `inputs:[]`, `mappings:[]`, `finish:"execute"`,
`read:{ports:[],variable_ports:[0],sample_rows:0,require_exact_numbers:true}`.
Удаляется только наблюдаемая связь входа 2; порт остаётся. Прочитай весь новый
вывод и сохрани пакет. Пустой список БЕЗ disconnect_input сохраняет все связи.
Смена входов — только automatic; максимум три разных источника.
Управляющего порта нет: объясни ограничение, не подключай control как вход 2.
Четвёртый вход, builtin-создание и отдельные редакторы портов не поддерживаются.
<!-- /mode -->
