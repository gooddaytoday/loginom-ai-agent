# Excel файл (`exports.excel`)

<!-- mode: xlsx -->
Для выгрузки Excel выбирай `dock_node_apply`, `target.type:"exports.excel"`,
`mode:"xlsx"`, один табличный вход 0 и `parameters.excel_export`:
`destination` — `.xlsx` в выбранном каталоге экспорта; `sheet_name` — имя листа;
`header:"none"|"names"|"labels"`; `overwrite:"reject"` для новой книги.
Эти четыре параметра обязательны для нового узла.
Для числового отображения без округления хранимых чисел задавай
`number_format:"numeric",decimal_count:2,divide_thousands:true` — стиль `#,##0.00`.
Это настройка экспортера: не округляй исходную таблицу Калькулятором или JS.
Другие варианты: `number_format:"general"`, разрядность 0…30, разделитель false.
`overwrite:"replace"` разрешён только при явном согласии пользователя полностью
заменить книгу: удаляются все прежние листы. Append и замена одного листа недоступны.
`finish:"execute"`, `read:{ports:[],sample_rows:0,require_exact_numbers:false}`
возвращают `output.file_artifacts`: доставь книгу. Сохраняй типы и порядок
исходных строк и полей. Пропущенные настройки существующего узла сохраняются;
пропущенный overwrite означает reject. `done` сохраняет настройки без выгрузки,
`close` отменяет черновик. Пакет сохраняй отдельно.

<!-- mode: xls -->
Для Excel 2003 выбирай `dock_node_apply`, `target.type:"exports.excel"`,
`mode:"xls"`, один табличный вход 0 и `parameters.excel_export`:
`destination` — `.xls` в выбранном каталоге экспорта; `sheet_name` — имя листа;
`header:"none"|"names"|"labels"`; `overwrite:"reject"` для новой книги.
Эти четыре параметра обязательны для нового узла. Режим создаёт настоящий XLS,
а не XLSX с другим расширением.
Для числового отображения без округления хранимых чисел задавай
`number_format:"numeric",decimal_count:2,divide_thousands:true` — стиль `#,##0.00`.
Это настройка экспортера: не округляй исходную таблицу Калькулятором или JS.
Другие варианты: `number_format:"general"`, разрядность 0…30, разделитель false.
`overwrite:"replace"` разрешён только при явном согласии пользователя полностью
заменить книгу: удаляются все прежние листы. Append и замена одного листа недоступны.
`finish:"execute"`, `read:{ports:[],sample_rows:0,require_exact_numbers:false}`
возвращают `output.file_artifacts`: доставь книгу. Сохраняй типы и порядок
исходных строк и полей. Пропущенные настройки существующего узла сохраняются;
пропущенный overwrite означает reject. `done` сохраняет настройки без выгрузки,
`close` отменяет черновик. Пакет сохраняй отдельно.
