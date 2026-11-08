# Текстовый файл (`imports.text`)

<!-- mode: delimited -->
Перед изменением существующего Импорта получи подтверждённый исходный CSV.
Без него запроси файл до Execute/чтения: чтение добавляет таблицу визуализатора
в пакет даже при отказе настройки. После `NOT_APPLIED` с `effect_possible=false`
не делай baseline/Save ради cleanup: сообщи отказ и запроси CSV.

Серверный текст сначала открой через `dock_node_apply` для `imports.text`:
`parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}`. Мастер вернёт
`output.server_profile` и закроет черновик без Execute. Известную кодировку задай
в `settings.source.encoding`, например `CP1251`. При искажении кириллицы с UTF-8
заново найди путь через `dock_storage_source` и повтори preview с `CP1251`;
искажённый текст не считай данными файла. Preview содержит не более 25 строк
и может быть неполным: он не доказывает N и редкие типы. После скачивания и выборки
переиспользуй ref: закрытому пустому узлу нужны полные настройки импорта выборки
из локального профиля.

Если подготовленная таблица — прямой выход текстового Import и нужны лишь
переименования/типы полей, меняй `settings.columns` этого Import, не добавляй Reform.
«Не перенастраивать загрузку CSV» означает сохранить `settings.source`,
`settings.format`, остальные поля и порядок; запрошенные имена/типы и необходимые
output mappings меняй на том же Import. Доставь исходное вложение текущей сессии
с `overwrite=reject`: повтор пути допустим только после сравнения серверных байтов.
При `UPLOAD_PATH_CONFLICT` не меняй путь или политику перезаписи для обхода.

Неизменённый существующий Import выполняй с `mode=delimited`,
`parameters:{settings:{}}`, `inputs:[]`, `mappings:[]`, `finish=execute`,
`read:{ports:[0]}`: текущая конфигурация без мастера. Не передавай `source`/старый
`upload_operation_id` и не доставляй CSV заново; квитанция старой сессии не нужна.
`UPLOAD_PATH_CONFLICT` не разрешает перезапись для активации сохранённого узла.
Изменения источника, колонок, формата или mappings требуют проверенную загрузку
текущей сессии.

В новом Import после доставки source_path можно опустить: Dock берёт путь по
upload_operation_id. Defaults: UTF-8, заголовок в первой строке, пропуск 0,
запятая, десятичная точка, пустой NULL, двойная кавычка; явные значения сохраняются.
Типы и имена колонок задаёшь ты.

При `source_switch` ([переключение на полный файл](../large-files.md#переключение-на-полный-файл))
в `settings` передай только `source:{source_path:"<полный файл>"}`, без columns/format/mappings.
Переключай с `finish:"done"` и `read.ports:[]`, без отдельного Execute импорта.
<!-- /mode -->

<!-- mode: delimited -->
## Путь из переменной

`imports.text`/`delimited`: bind `/settings/source/source_path` to
`{kind:"variables",input:0,name:"CsvPath"}` in `bindings`; connect
`variable_inputs` from `variables.user` output 4 to input 0.
Before configuration, execute `variables.to_table`/`columns`, `parameters:{}`,
source output 4 → variables input 0, `read:{ports:[0]}`.
Do not reopen UserVars values: even Cancel deactivates it.
Import reads active VariablesForm; inactive refuses before mutation.
No Calculator/JS or literal copy.
Verify CsvPath with `dock_storage_source` before each Execute.
For configuration supply verified delivery/storage in `parameters.source`, omit
`settings.source.source_path`. To switch files change only CsvPath, execute the
same Import with `parameters:{settings:{}}`, `bindings:[]`, empty inputs/mappings;
also after Save/reopen. Check `configuration.bindings`.
<!-- /mode -->
