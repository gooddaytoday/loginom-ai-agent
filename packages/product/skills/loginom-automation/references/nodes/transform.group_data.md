# Группировка (`transform.group_data`)

<!-- mode: aggregate -->
В `dock_node_apply` выбирай `transform.group_data`, режим `aggregate`. При изменении `measures` existing узла передай полный `group_by`, `measures` и связь входа 0 в `inputs`. `parameters: {}` сохраняет настройки. Полные дубли: ключи по всем полям, `measures: []`; NULL отличается от пустой строки.

В output mapping `configured_field.name` — текущее выходное имя: после apply с `measures` это `name` меры (например `Metric`) или имя ключа; не составляй имя из поля и функции (`Amount_Median`), если узел его не выдал.

Для каждой меры задай `field: {kind: "input_field", name: "имя"}`, `function`, выходные `name`/`label`. Две меры одного поля могут иметь разные имена. Прочитай карточку через `dock_action_describe`. Агрегаты выполняй Группировкой, не Калькулятором/JS.

- `median`: integer/real → real; без NULL, полностью NULL → NULL.
- `mode`: integer/string/real → тот же тип; без NULL, полностью NULL → 0/пустая строка. При ничьей — наименьшее значение (для строк порядок кодовых точек, например Beta < alpha).
- `stddev`: integer/real → real; выборочное без NULL, одно значение → 0, полностью NULL → NULL.
- `null_count`: integer/string/real → integer; считает NULL, не пустые строки.
- `unique_count`: integer/string/real → integer, без NULL; пустая строка считается один раз.
При нескольких функциях native-суффиксы: Mode, Std, Null.

## Первое, последнее, единственное, список

В том же узле `first`/`last` — первое/последнее в исходном порядке, включая крайний NULL; `only` — единственное различное значение (повторы допустимы), иначе NULL; `concat` — список без NULL, пустой текст сохраняется, полностью NULL → пустая строка. Для first/last/only вход integer/string/real; тип сохраняется. Для concat — только integer/string → string. Вход перед first/last не сортируй.

Только `concat` требует `concat: {separator: "|", wrapper: "\"", unique: false, order: "none"}`. `wrapper`: пустая строка, двойная или одинарная кавычка; для чисел без ограничителя — пустая. `none` сохраняет порядок, `ASC`/`DESC` сортируют значения; `unique:true` удаляет повторы. Настройки одного поля. Для нескольких состояний перенастраивай тот же узел полными ключами, мерами, входом 0; после каждого Execute читай весь результат и отдельный CSV. Save сохраняет финальное состояние.

## Кэш и сортировка

`parameters.cache_groups:true/false` кэширует значения групп, не доказывает свежесть источника. `parameters.sort_result:true/false` сортирует по ключам `group_by` по возрастанию, не агрегатам; при false порядок не задан. На existing передай только нужный переключатель: пропуск сохраняет значение, ключи, меры и mapping. С `inputs:[]`, `mappings:[]`, `finish:"execute"` проверь `configuration.readback.options.pedDimCache.value` / `pedSortResult.value` и весь результат. Для сравнения выгрузи оба состояния того же узла. При полной перенастройке сохрани итоговый переключатель. Save и последующий Execute с `{}` используют сохранённое состояние.

## Привязка

Верхний `bindings:[{parameter:"/sort_result",variable:{kind:"control",input:0,name:"Flag"}}]`: `variables.user`/4 через `variable_inputs` control input 0. Flag boolean, не NULL; literal sort_result убери. Проверяй `configuration.bindings`; omit/[] сохраняет привязку. Измени только Flag в источнике, затем тот же GUID с `parameters:{}`, `inputs:[]`, `mappings:[]`, `finish:"execute"`; не перенастраивай узел. Тип/NULL/конфликт: `BINDING_TYPE_MISMATCH`/`BINDING_NULL_UNSUPPORTED`/`BINDING_CONFLICT`. Сверь весь результат, Save/reopen и порядок полей.
<!-- /mode -->
