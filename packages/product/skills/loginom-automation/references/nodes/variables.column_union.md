# variables.column_union / append_variables

<!-- mode: append_variables -->
Native «Соединение (переменные)»: `dock_node_apply`,
`target.type:"variables.column_union"`, `mode:"append_variables"`,
`inputs:[]`, `mappings:[]`, `parameters:{}`. Не подменяй Калькулятором или JS.
В `variable_inputs` — разные источники свежего графа своего документа:
`{source:NodeRef,output:наблюдаемый_порт,input:0,kind:"variables"}`,
аналогично вход 1. Для Execute: `finish:"execute"`,
`read:{ports:[],variable_ports:[0],sample_rows:0,require_exact_numbers:true}`.
Читается полный native VariablesForm: имя, метка, тип, типизированное значение.
Порядок: вход 0, затем 1, затем подключённый 2. Native имена уникальны:
a0/a0/a1 → a0/a1/a2, title → title_1; читай фактические имена, метки без нумерации.
Integer/real/string/boolean, до 128 переменных; типизированный NULL отличается
от пустой строки, false и нуля. После чтения — `package.save_checkpoint`.
Источник меняй его собственным типом. В patch `variables.calculator` передай
только изменяемые `parameters.expressions`:
`target:{kind:"existing",name:"saved_name"},formula:"новое_выражение"`.
Затем Execute того же existing Соединения: `parameters:{}`, `variable_inputs:[]`,
`inputs:[]`, `mappings:[]`; настройки и связи сохраняются.

Для ручного выбора и порядка, переименования с меткой без смены типа
используй этот же `variables.column_union`, `mode:"append_variables"`:
При создании можно опустить `target.label`: будет назначена устойчивая подпись.
После AMBIGUOUS используй inspect; не повторяй создание узла или связи.
`parameters:{column_union:{mapping:"manual",fields:[
{input:1,source:"amount",name:"right_amount",label:"Правая сумма",type:"integer"},
{input:0,source:"amount",name:"left_amount",label:"Левая сумма",type:"integer"}
]}}`. `fields` — весь выход в требуемом порядке; неуказанные переменные исключаются.
`input` — 0 или 1, `source` — исходное техническое имя из этого входа,
`name/label/type` — выход. Имена результата и пары input/source уникальны.
Допустим только исходный тип. В Loginom 7.4.2 ручное соответствие не
преобразует integer→string: не обещай такое преобразование. При несовпадении
типов preflight отказывает до изменения источников, узла и связей.
Предложи Калькулятор переменных после Соединения для преобразования типа;
создавай его только в рамках согласованной пользователем задачи.
Для двух независимых наборов констант создай два `variables.calculator`
(отдельный узел для каждого набора), выполни и прочитай их outputs; это источники,
а ручное соответствие выполняет только native Соединение переменных.
Перед ручным Соединением выполни источник после его правки.
После patch только правого источника повтори Execute того же Соединения с
`parameters:{}`, `variable_inputs:[]`, `mappings:[]`: сохранённые ручные
поля, типы, порядок и связи остаются. Не повторяй fields для обновления данных.

Третий вход — только automatic: сначала создай Соединение на 0,1 и прочитай
output 0. На ТОМ ЖЕ existing NodeRef передай три `variable_inputs` в порядке
0,1,2, `kind:"variables"`, `parameters:{column_union:{mapping:"automatic"}}`.
Runtime один раз нажмёт Input_Add, подключит вход 2, сохранив GUID узла,
первые порты и связи. Выполни Execute и полное чтение output 0.
Отсоединение только третьей связи: тот же existing NodeRef,
`parameters:{column_union:{mapping:"automatic",disconnect_input:2}}`,
`variable_inputs:[]`, `inputs:[]`, `mappings:[]`, `finish:"execute"` и read выше.
Порт остаётся; пустой список БЕЗ disconnect_input сохраняет все связи.
Прочитай весь новый вывод и сохрани пакет. Максимум три разных источника;
control, четвёртый вход, builtin-создание и отдельные редакторы портов запрещены.
При смене входов runtime один раз выбирает «Удалить и продолжить» для точного
native-вопроса; после того же Yes и точного предупреждения «Всё равно далее»
возможен один повтор Next. Чтение/readback удаление не подтверждает.
Порты, GUID, связи и полный ordered output проверяются; расхождение — FAIL
с журналом, без повтора.
<!-- /mode -->
