# Excel файл

<!-- mode: xlsx -->
## Импорт XLSX

Исходная XLSX: `imports.excel`, `mode:"xlsx"`, проверенные `parameters.source` и
`excel.source_path`. `sheet_name` — точное имя листа с пробелами/регистром;
без него первый, при `source_switch` прежний. `header_rows`: 1–1000;
`columns`: все 1–64 поля в исходном порядке с `name`, `label`, `type`.
Имя — ASCII identifier; иной исходный заголовок — `source_name`.
Прокрути к правым полям. Сохраняй NULL.
Не добавляй Калькулятор/JavaScript для диапазона, Boolean, ширины или списка.

Диапазон: `excel.named_range:"SalesRange"` (точное имя, без `sheet_name`).
`extend_range:false` (default) — его границы; `true` — его столбцы до последней
заполненной строки. Задай `header_rows`/`columns` диапазона. Меняя расширение,
используй `existing`, прежний `node_id` и остальные source/настройки.
Первый CSV выгрузи до изменения. Читай свежий выход: скан листа не доказывает
N диапазона. Не заменяй его листом.

Boolean: `columns` с `type:"boolean"`, `data_kind:"Дискретный"` (default).
Нативный «Логический» сохраняет `false`/`true`/`NULL`; `exports.text` с
`null_marker:"NULL"` различает пустое и ложное.

## Схема

`excel.auto_detect`: `none`=«Нет», `new`=«Только новые», `all`=«Все».
None сохраняет позиции/типы, new добавляет позиции с определением типа,
all заново определяет имена/типы: AB→BC при none/new даёт A,B, при all — B,C.
All запрещает `columns`; new допускает их отсутствие. Новый узел: `header_rows`.
Смена файла: ТОТ ЖЕ `existing`, новый verified source,
`excel:{source_path,auto_detect}` без columns/header_rows/mappings сохраняет остальное.
Один буквальный XLSX, без binding/source_switch. Execute/read [0]: новые поля
появляются при исполнении. Проверь `auto_detect`/`dynamic_schema`, свежие типы/CSV.

Профиль: листы/видимость, declared/наблюдённая размерность, система дат,
формулы/cached values; declared dimension не доказывает N.
`loginom_file_sample` сохраняет типы/форматы XLSX; доставляй как XLSX,
настройки — `settings.excel`. Без CSV-конверсии и пересчёта формул;
нет cache — уточни исходник. `settings_complete=false`: настройки не готовы.
Пустые строки импортируются.

>12 столбцов/>10 строк заголовка: полные `columns`/`header_rows`; данные после
заголовков, имя — их непустые части через `_` (в `source_name` либо допустимом
`name`). Дочитай continuation `loginom_file_profile`. Сверх 64 полей/1000 строк
заголовка (`anomalies`: «Excel runtime supports 1–64 columns») сообщи предел и запроси
область до `node_apply`: Import не создавай, книгу без согласия не конвертируй;
запрошенный пакет сохрани без этого узла.

`source_switch` ([полный файл](../large-files.md#переключение-на-полный-файл)):
передай только `excel:{source_path:"<полная книга>",sheet_name:"<выбранный лист>"}`,
без columns/header_rows/mappings. Лист, заголовки и политика пустых строк должны
совпадать с точным XLSX-проходом. Для Excel остаётся отдельный Execute импорта;
проверь `full_import_verification` с expected/actual N и execution_id.

## Имя файла из переменной

`binding_schema`: `/excel/source_path`; `variable_inputs`: `variables.user` 4 → Excel 0.
Сначала выполни `variables.to_table` от выхода 4. Свежий `dock_storage_source`
перед КАЖДЫМ Execute. Новый узел: storage — в `parameters.source`, без `excel.source_path`.
Меняй только переменную, затем ТОТ ЖЕ узел: ровно `parameters:{excel:{}}` (без source),
`bindings:[]`, пустые inputs/mappings, и после Save/reopen. Проверь `configuration.bindings`.

## Несколько книг и маска

Книги одной структуры — ОДИН `imports.excel`, каждой свой storage ref
(`dock_storage_list`): `source:{kind:"verified_sources",sources}`
в порядке `excel.source_paths` (2–16) либо `excel.source_mask:"<каталог>/a-*.xlsx"`
(`*` только в имени, refs ВСЕХ совпадений). Лист, `header_rows`, `columns` общие.
Список→маска: `existing`, тот же `node_id`, всё заново. По умолчанию
последовательно; `parallel_processing:true`, `max_threads` из схемы — без
гарантии порядка строк. Проверь `configuration.readback.source`.
<!-- /mode -->
