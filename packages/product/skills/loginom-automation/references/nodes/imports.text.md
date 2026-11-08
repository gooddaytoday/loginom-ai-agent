# Текстовый файл (`imports.text`)

<!-- mode: delimited -->
Перед изменением существующего Импорта получи подтверждённый исходный CSV.
Без него запроси файл до Execute/чтения: чтение добавляет таблицу визуализатора
в пакет даже при отказе настройки. После `NOT_APPLIED` с `effect_possible=false`
не делай baseline/Save ради cleanup: сообщи отказ и запроси CSV.

Server text preview: `dock_node_apply` for `imports.text`,
`parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}` returns
`output.server_profile` and closes the draft without Execute. Set known
`settings.source.encoding`, e.g. `CP1251`. If UTF-8 mangles Cyrillic, refresh
`dock_storage_source` and retry `CP1251`; mojibake is not file data.
Preview is at most 25 rows, possibly partial: no proof of N or rare types.
Reuse the ref after download/sampling; a closed empty node needs full sample
Import settings from the local profile.

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
`upload_operation_id`, CSV заново не доставляй.
`UPLOAD_PATH_CONFLICT` не разрешает перезапись для активации сохранённого узла.

В новом Import после доставки source_path можно опустить: Dock берёт путь по
upload_operation_id. Defaults: UTF-8, заголовок в первой строке, пропуск 0,
запятая, десятичная точка, пустой NULL, двойная кавычка; явные значения сохраняются.
Типы и имена колонок задаёшь ты.

При `source_switch` ([переключение на полный файл](../large-files.md#переключение-на-полный-файл))
в `settings` передай только `source:{source_path:"<полный файл>"}`, без columns/format/mappings.
Переключай с `finish:"done"` и `read.ports:[]`, без отдельного Execute импорта.

## Автоопределение типов

Типы «по данным»: `settings.format.auto_detect_columns`
(`none`/`new`/`all`), `settings.analysis`: `rows`, `refresh` (`all` — поля и типы
заново, `types` — только типы). Новому узлу `columns` не нужны: схема читается, сверь
с `output`. `all`: типы задаёт Loginom, `columns` отклоняется. `new`:
ручные типы (отдельным вызовом того же узла) остаются при смене `source_path`.
`refresh` стирает ручные типы: только по просьбе.
<!-- /mode -->

<!-- mode: delimited -->
## Путь из переменной

Use `binding_schema`; `variable_inputs`: `variables.user` 4 → Import 0.
First execute `variables.to_table`/`columns` (source 4 → variables 0),
`parameters:{}`, `read:{ports:[0]}`.
Never reopen UserVars values: Cancel deactivates. No Calculator/JS or literal copy.
Fresh `dock_storage_source` before EACH Execute and bound Import reread.
Configure with verified `parameters.source`, omit literal.
Change only CsvPath; same Import with `parameters:{settings:{}}`, `bindings:[]`,
empty inputs/mappings, also after Save/reopen. Check `configuration.bindings`.
<!-- /mode -->
