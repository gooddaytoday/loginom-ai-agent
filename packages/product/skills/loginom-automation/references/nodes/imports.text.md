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
искажённый текст не считай данными файла. Preview (≤25 строк)
не доказывает N и редкие типы. После скачивания и выборки
переиспользуй ref: закрытому пустому узлу нужны полные настройки импорта выборки
из локального профиля.

Если подготовленная таблица — прямой выход текстового Import и нужны лишь
переименования/типы полей, меняй `settings.columns` этого Import, не добавляй Reform.
«Не перенастраивать загрузку CSV» означает сохранить `settings.source`,
`settings.format`, остальные поля и порядок; запрошенные имена/типы и необходимые
output mappings меняй на том же Import. Доставь исходное вложение текущей сессии
с `overwrite=reject`: повтор пути допустим только после сравнения серверных байтов.
При `UPLOAD_PATH_CONFLICT` не меняй путь или политику перезаписи для обхода,
даже для активации сохранённого узла.

Неизменённый существующий Import выполняй с `mode=delimited`,
`parameters:{settings:{}}`, `inputs:[]`, `mappings:[]`, `finish=execute`,
`read:{ports:[0]}`: текущая конфигурация без мастера. Не передавай `source`/старый
`upload_operation_id`, CSV заново не доставляй.

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
с `output`. `all`: поля появятся лишь после Execute, типы задаёт Loginom;
не передавай `columns` и output `mappings`, для управления полями — `new`/`none`. `new`:
ручные типы (отдельным вызовом того же узла) остаются при смене `source_path`.
`refresh` стирает ручные типы: только по просьбе.
<!-- /mode -->
