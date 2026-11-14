# Подмодель

Если пользователь просит Подмодель, используй `control.supernode`, а внутри неё —
поддержанный обработчик. Сначала запроси карточку режима через
`dock_action_describe` с `node_types:["control.supernode"]`, `modes:["tabular_boundary"]`.

<!-- mode: tabular_boundary -->
`control.supernode`, mode `tabular_boundary`: один уровень, обязательный табличный
вход 0 и табличный выход 0. Новый узел создавай с `inputs:[]`, `mappings:[]`,
`finish:"done"`, без чтения; полностью задай `parameters.boundary`:
`input:{kind:"table",name:"Input",label:"Исходные данные",requirement:"required"}`,
`output:{kind:"table",name:"Output",label:"Результат"}`. Имена — ASCII-идентификаторы.
Вторым apply на ТОМ ЖЕ существующем узле, с `parameters:{}`, подключи внешний
импорт к input 0; `finish:"done"`. Не создавай второй контейнер. Существующий
boundary сохраняется; изменение подключённых портов не поддерживается.

Вход: `dock_prepare` с `intent:"existing_workflow"`, текущим `workflow_ref`,
`graph_navigation:{direction:"enter",node_ref:<наблюдённая Подмодель>}`.
Используй выданный свежий workflow_ref и сразу `dock_workspace_observe`.
Найди служебные узлы по `boundary_role:"input"` и `boundary_role:"output"`.
У InputNode табличный output 0, у OutputNode табличный input 0; их GUID
зеркальны внешним портам, но refs принадлежат внутреннему workflow.

Создай Калькулятор внутри текущего workflow с источником InputNode output 0,
`finish:"done"`, `read.ports:[]`, `sample_rows:0`. Сначала заверши внутренние
связи до OutputNode; выполнение и чтение выполняй у родительской Подмодели
после выхода во внешний workflow.
Для исходных полей в исходном порядке и нового поля в конце задай полную
output mapping, `autosync:false`: все исходные configured_field по порядку,
затем новое поле. Формулы и вычисления задаются только Калькулятору.
Подключи его результат к служебному OutputNode: запроси карточку
`control.supernode_output`, mode `tabular_boundary`; затем apply на ЕГО
существующий ref с `inputs:[{source:<Calculator>,output:0,input:0}]`,
`parameters:{}`, `mappings:[]`, `finish:"done"`, без чтения. Этот тип разрешает
только локальную связь существующей выходной границы. После связи снова
`dock_workspace_observe` — нужны обе границы, Калькулятор и две связи.

Выход: `dock_prepare` с текущим workflow_ref и
`graph_navigation:{direction:"leave"}`. Снова наблюдай родительский граф:
старые refs до входа/выхода больше не действуют. Выполни существующую
Подмодель с `parameters:{}`, `inputs:[]`, `mappings:[]`, `finish:"execute"`,
`read.ports:[0]`; `dock_node_read` перечитывает по локальной квитанции.
При смене источника меняй только файл прежнего импорта, затем выполняй ту же
Подмодель. Сохраняй пакет штатным Save после последнего чтения.

Каждая связь строго локальна текущему workflow. Внешний импорт нельзя
подключать прямо к внутреннему Calculator или OutputNode. После потери ответа
навигации сверяй тот же operation_id; неизвестную мутацию не повторяй.
Не поддержаны рекурсивные Подмодели, compose/expand, несколько/необязательные
портов, переменные, деревья, Условие/Цикл, service links и обучение.
<!-- /mode -->
