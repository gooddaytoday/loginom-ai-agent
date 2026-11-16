# Подмодель

Используй `control.supernode`; запроси `dock_action_describe` с этим node_types
и нужным mode: `tabular_boundary` или `variable_boundary`. Один уровень.
Новый узел: `inputs:[]`, `mappings:[]`, `finish:"done"`, без чтения,
полная `parameters.boundary`. Имена портов — ASCII-идентификаторы, метки отдельно.
Существующий `parameters:{}` сохраняет границу. Не создавай второй контейнер.
Изменение, удаление и перестановка сохранённых портов/определений запрещены.

Вход: `dock_prepare`, `intent:"existing_workflow"`, текущий `workflow_ref`,
`graph_navigation:{direction:"enter",node_ref:<Подмодель>}`. Сразу наблюдай граф
по свежему workflow_ref. Найди InputNode/OutputNode по `boundary_role:"input"`
и `boundary_role:"output"`: зеркальные GUID внешних портов, refs внутреннего workflow.
OutputNode имеет табличный input 0. Каждая связь локальна текущему workflow:
внешний источник нельзя подключать прямо к внутреннему Calculator/OutputNode.
Неизвестную мутацию навигации не повторяй; сверяй тот же operation_id.

Внутренний Calculator сначала заверши с `finish:"done"`, без чтения
(`read.ports:[]`, `sample_rows:0`). Формулы — только ему. Сначала дострой тело
до OutputNode; выполняй и читай родительскую Подмодель после выхода.
Для порядка полей задай полную output mapping, `autosync:false`: configured_field
всех сохраняемых полей, включая новое, в нужном порядке.
Связь выхода: запроси `control.supernode_output`, mode `tabular_boundary`;
apply на ЕГО существующий ref, `inputs:[{source:<Calculator>,output:0,input:0}]`,
`parameters:{}`, `mappings:[]`, `finish:"done"`, без чтения. Этот тип не создаётся,
не выполняется и не принимает внешний источник. Снова наблюдай границы и связи.

Выход: `dock_prepare` с текущим workflow_ref и
`graph_navigation:{direction:"leave"}`. Наблюдай родительский граф: прежние refs
больше не действуют. Выполни ТУ ЖЕ Подмодель с её mode, `parameters:{}`,
`inputs:[]`, `mappings:[]`, `finish:"execute"`, `read.ports:[0]`.
`dock_node_read` перечитывает по локальной квитанции. Save — после последнего чтения.
Не поддержаны вложенные/рекурсивные Подмодели, compose/expand, лишние порты,
деревья, выходные переменные, смешанная граница, Условие/Цикл, service links, обучение.

<!-- mode: tabular_boundary -->
Один обязательный табличный input 0 и табличный output 0:
`boundary.input:{kind:"table",name:"Input",label:"Исходные данные",requirement:"required"}`,
`boundary.output:{kind:"table",name:"Output",label:"Результат"}`.
Вторым apply на ТОМ ЖЕ узле с `parameters:{}`, `finish:"done"` подключи внешний
импорт к input 0. Необязательные входы не поддержаны.
Внутри InputNode table output 0 → Calculator table input 0 → OutputNode.
За InputNode проверка mapping откладывается до мастера: после отказа apply
перенастраивай тот же существующий Калькулятор по свежему ref; не создавай новый. Исходные поля оставь в исходном порядке,
новое — в конце. При смене источника меняй только файл прежнего импорта,
затем выполняй ту же Подмодель. Переменные в этом mode не поддержаны.
<!-- /mode -->

<!-- mode: variable_boundary -->
Один переменный input 0, один табличный output 0, без табличного входа:
`boundary.input:{kind:"variables",name:"Params",label:"Параметры",definitions:[{name:"Page",type:"integer",value:99},{name:"Limit",type:"integer",value:2}]}`;
`boundary.output` — таблица, как выше. Только непустые integer-определения без NULL;
имя переменной также её метка. Внешний источник не нужен.
InputNode variable output 0 → «Переменные в таблицу» (columns) и обычный вход
переменных Calculator через `variable_inputs` (kind:variables,input:0).
Таблица преобразователя → Calculator table input 0 → OutputNode.
Формула читает `Var.Page`, а не поле Page. Readback: GUID входного порта,
ID, порядок, имена, типы и значения сохранённых определений.
<!-- /mode -->
