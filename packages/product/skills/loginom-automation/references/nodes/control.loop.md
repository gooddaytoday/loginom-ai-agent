# Цикл

`control.loop`, modes `group_rows` и `for`. Читай `dock_action_describe` с
`node_types:["control.loop"],modes:[<mode>]` и карточку `control.supernode`.
Тело — исходная Подмодель текущего родительского workflow по свежему scoped ref,
не её вложенный workflow. Не входи в Цикл: граф принадлежит Подмодели.

<!-- mode: group_rows -->
Тело: `control.supernode` / `tabular_boundary`, обязательный табличный input 0,
табличный output 0. Подключи импорт для схемы. Войди через
`dock_prepare.graph_navigation`, получи свежие refs. Внутри InputNode → обработчик
→ существующий OutputNode (`control.supernode_output`). Для Calculator явно задай
все выходные поля в нужном порядке, `autosync:false` (новое поле native ставит первым).
Для REST API table input 0 означает native порт 2, ответ — output 0;
один запрос на строку. Вернись в родительский workflow, снова наблюдай граф.

Создай Цикл: `target:{kind:"new",type:"control.loop"},mode:"group_rows"`,
`parameters:{body:<ref Подмодели>},inputs:[],mappings:[],finish:"done"`,
`read:{ports:[],sample_rows:0}`. Порты появляются после настройки.
Второй apply — на ТОМ ЖЕ Цикле, с тем же body,
`inputs:[{source:<импорт>,output:0,input:0}],mappings:[],finish:"execute"`,
`read:{ports:[0],sample_rows:100}`. Второй Цикл не создавай.

Фиксированный размер группы 1, единственный табличный input 0. Переменные,
identifiers, parallel, ignore_errors и собственная конфигурация выключены.
Выходы накапливаются по порядку строк. Для трёх страниц три строки;
RequestID REST на каждой итерации начинается с 0. Response сохраняй побайтно,
без разбора/нормализации. HTTP 404 и прочие HTTP-ошибки могут быть данными
дополнительного выхода REST, а не исключением тела.
<!-- /mode -->

<!-- mode: for -->
Тело: `control.supernode` / `variable_boundary`, один вход переменных integer
без NULL, один табличный выход, без табличного входа. Внутри InputNode variable
output 0 → «Переменные в таблицу» (columns) и ordinary variable input 0 Calculator;
таблица преобразователя → Calculator → OutputNode либо REST → OutputNode.
Формула читает `Var.Page`, а не поле Page. До REST выполни Calculator для полной
схемы. Вернись в родительский workflow.

Из readback Подмодели `boundary.input` возьми `port_guid` и `definitions[].id`
выбранной переменной. При потере квитанции выполни ТУ ЖЕ Подмодель с
`mode:"variable_boundary",parameters:{},inputs:[],mappings:[]` для readback.
Выбор по одной метке/имени запрещён.

Создай Цикл: `target:{kind:"new",type:"control.loop"},mode:"for"`,
`parameters:{body:<ref Подмодели>,count:3,variable:{port_guid:<GUID>,definition_id:<id>},iteration_identifiers:true}`,
`inputs:[],mappings:[],finish:"execute"`,
`read:{ports:[0],sample_rows:100,require_exact_numbers:true}`.
Повторная настройка — тот же Цикл с полным parameters.
`count` — положительное целое literal; привязка к переменной и start/step запрещены.
Цикл подставляет только выбранную переменную значениями 0…count−1;
исходное значение (например Page=99) не задаёт старт. Внешний источник и табличный
вход Циклу не нужны. `iteration_identifiers` false/true, по умолчанию false;
при true native добавляет последнее integer-поле IterationId. Не вычисляй его в теле.
Readback: count, GUID/ID, имя/тип переменной, identifiers и сохранённые настройки
после Done. Parallel, ignore_errors и собственная конфигурация выключены.
<!-- /mode -->

Тело живое: правь исходную Подмодель и выполняй тот же Цикл; сам экземпляр тела
при этом не активируется. `parameters:{}` для настройки Цикла не поддержан:
передай полный parameters снова или используй `dock_node_read` с новой operation_id
и source_operation_id успешного Execute. После полного чтения выполни Export,
затем штатный Save. Постусловие/обратное сопоставление, fixed_count/group_keys,
parallel, ignore_errors, внешние компоненты, смешанные/лишние/древовидные порты,
выходные переменные, вложенные Подмодели и тела другого типа не поддержаны.
