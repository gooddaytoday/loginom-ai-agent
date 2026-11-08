# Группировка (`transform.group_data`)

<!-- mode: aggregate -->
## Группировка

Меняя `measures` existing Группировки, задай полный `group_by` и связь входа 0 в `inputs`.
Удаление полных дублей = Группировка по всем полям без мер (`measures: []`).

## Медиана

Медиана группы — `function: "median"` в `measures` этого же узла Группировки (не Калькулятор и не JS). Поле-источник — целое (integer); результат вещественный (real). NULL пропускаются, группа только из NULL даёт NULL. Выходное имя и метку задай в `name`/`label` меры. Для пары «исходное поле + медиана» используй две меры на одно поле с разными `name`.

## Мода, стандартное отклонение, пропуски

В `dock_node_apply` выбирай `type: "transform.group_data"`, `mode: "aggregate"` и `parameters.measures`:
- мода — `function: "mode"`, вход integer/string, выход того же типа; NULL не участвуют, полностью NULL даёт 0 для integer и пустую строку для string;
- стандартное отклонение — `function: "stddev"`, вход integer, выход real; выборочное, без NULL; одно непустое значение даёт 0, полностью NULL — NULL;
- число пропусков — `function: "null_count"`, вход integer/string, выход integer; пустая строка не считается пропуском.

Эти агрегаты выполняй Группировкой. Для каждой меры укажи `field: {kind: "input_field", name: "имя источника"}`, `function`, выходные `name` и `label`. Перед применением прочитай актуальную карточку через `dock_action_describe`. Для повторной настройки того же узла передай полный `group_by`, полный `measures` и связь входа 0 в `inputs`; `parameters: {}` сохраняет поддержанные настройки. Native-суффиксы нескольких функций — Mode, Std и Null.
Управление sort_result переменной выполняй этим же узлом, режим `aggregate`. В `dock_node_apply` добавь верхнеуровневый `bindings: [{parameter: "/sort_result", variable: {kind: "control", input: 0, name: "Flag"}}]`, а literal `sort_result` из `parameters` убери. Подключи `variables.user` выход 4 через `variable_inputs` к control input 0. Flag — boolean, не NULL; другой тип → `BINDING_TYPE_MISMATCH`, NULL → `BINDING_NULL_UNSUPPORTED`, literal вместе с binding → `BINDING_CONFLICT`. После изменения только Flag в источнике выполни прежний GUID с `parameters: {}`, `inputs: []`, `mappings: []`, `finish: "execute"`; настройки узла не применяй заново. Проверяй `configuration.bindings`, полный результат, Save и повторное открытие.
<!-- /mode -->
