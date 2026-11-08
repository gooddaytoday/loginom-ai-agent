# variables.user / values — предложение LAB-1038

Проект node reference после утверждения и реализации, не текущая возможность.
Найди существующий builtin «Переменные сценария» на root-графе.
Новый черновик получает его автоматически; отдельный второй builtin
в палитре не обнаружен. Не создавай заменяющий Калькулятор/JavaScript.
`target.ref` составляется из node_id свежего графа и выданных подготовкой
document_id/workflow_id. Не угадывай GUID и не используй legacy caption ref.

`dock_node_apply`: type `variables.user`, mode `values`, target.kind
`existing`, `inputs:[]`, `mappings:[]`, `read.ports:[]`, finish `done`/`close`.
`parameters:{variables:[{name:"amount",type:"real",value:7.5}]}` патчит только
точно перечисленные имена. Не задавай label/position, связи или Execute.
Новые метки равны именам; существующие IDs, метки, порядок и неприсланные
значения сохраняются. Предлагаемая смена типа существующей переменной
требует явных новых type и value и независимого повторного readback.

Типы: safe integer, finite binary64 real, boolean, string, civil datetime;
явный JSON null — typed NULL, отличен от нуля, false и пустой строки.
Дата `YYYY-MM-DDTHH:mm:ss`, optional `.000`. Предлагается также date-only
`YYYY-MM-DD`, нормализуемая в начало **того же** гражданского дня.
Непустые миллисекунды и timezone-суффиксы пока отклонять до изменения:
UI обрезает миллисекунды и переводит timezone в часовой пояс браузера.
Пустая real/datetime не означает NULL или текущее время и запрещена.
Сохранённые даты читать до миллисекунд, не округляя no-op patch.

Только пользовательский выход 4 имеет наблюдённый редактор значений.
Выходы 0/1/2/3 не становятся writable по номеру; при отсутствии мастера
объясни ограничение без записи в другой набор. Системные/сеансовые значения
не включать в ответ или fixtures. Семантика записи туда требует решения.

Done применяет без Save/выполнения; Close отменяет. Сохрани через
`package.save_checkpoint`, затем `dock_node_read` с НОВЫМ operation_id и
source_operation_id успешного values: `read:{ports:[],variable_ports:[4]}`.
Snapshot требует чистый пакет, открывает мастер только для чтения и Cancel.
Результат полный typed, execution_id null; integer value — десятичная строка.
Проверь IDs/типы/значения, включая неизменённые переменные, в новом readback.

После Save As/reopen получи `dock_prepare` с новым operation_id; используй
новые workflow/node refs. Для исходного snapshot новой подготовки выполни
пустой patch `variables:[]`, Done, Save, затем новый read от этого patch.
Не переноси source_operation_id через подготовки. Для вычислений с real/date
используй существующий Калькулятор с Var.name; фильтр variable operand
ограничен integer/string. Не обещай сохранение или cold по одному Done.
