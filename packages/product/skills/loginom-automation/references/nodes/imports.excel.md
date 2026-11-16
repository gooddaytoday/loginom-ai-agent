# Excel файл (`imports.excel`)

<!-- mode: xlsx -->
## Режим XLSX: импорт из Excel

Для исходной XLSX-книги используй `imports.excel`, `mode:"xlsx"`.
`parameters.source` и `excel.source_path` возьми из проверенной доставки;
в `excel.sheet_name` передай точное имя выбранного листа (включая пробелы и регистр;
без него — первый лист, при `source_switch` — прежний). `header_rows` — 1–1000, `columns` — полный список из 1–64
полей в исходном порядке с явными `name`, `label`, `type`.
Техническое имя — ASCII identifier,
для другого исходного заголовка укажи `source_name`. Поля справа от видимой
области тоже включай: мастер прокручивает сетку. NULL сохраняются. Ни для диапазона,
логического поля, широкой книги или списка не добавляй Калькулятор/JavaScript.

Именованный диапазон: тот же `dock_node_apply`, `mode:"xlsx"`,
`parameters.excel.named_range:"SalesRange"` — точное имя, без `sheet_name`.
`extend_range:false` (default) — строго его границы; `true` — только его
столбцы до последней заполненной строки. Задай `header_rows` и `columns`
этого диапазона. Затем `target.kind:"existing"`, прежний `node_id`, те же
source/настройки и другое `extend_range`: выполни тот же узел. Первый CSV
выгрузи до изменения. Читай свежий выход: скан листа не доказывает N диапазона.
Не заменяй диапазон листом.

Логическое поле импортируй тем же `dock_node_apply` (`imports.excel`, `xlsx`):
в `parameters.excel.columns` укажи `type:"boolean"` и
`data_kind:"Дискретный"` (также выбирается по умолчанию). Это нативный тип
«Логический»: сохрани `false`, `true` и `NULL` раздельно. В `exports.text` задай `null_marker:"NULL"`,
чтобы незаполненное значение в CSV отличалось от ложного.

XLSX-профиль показывает листы и видимость, declared и наблюдённую размерность,
систему дат, формулы и cached values; declared dimension не доказывает N.
`loginom_file_sample` создаёт XLSX с теми же типами и форматами: доставляй как XLSX,
настраивай по `settings.excel` профиля. Не преобразуй книгу в CSV. Формулы — cached
values без пересчёта; нет cache — уточни исходник. `settings_complete=false`:
настройки не готовы; узел поддерживает импорт пустых строк.

Широкую книгу (>12 столбцов) или >10 строк заголовка настраивай так же, полным
`columns` и фактическим `header_rows`: данные идут после всех строк заголовка, имя
поля — непустые части заголовка через `_` (в `source_name`, или `name`, если оно
допустимо). Пагинацию `loginom_file_profile` дочитай
через continuation. Сверх 64 полей или 1000 строк заголовка сообщи предел и
запроси нужную область.

При `source_switch` ([переключение на полный файл](../large-files.md#переключение-на-полный-файл))
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
