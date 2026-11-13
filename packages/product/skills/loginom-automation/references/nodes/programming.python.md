# Python (`programming.python`)

<!-- mode: script -->
## Код Python в узле Loginom

Выбирай этот узел, когда пользователь просит узел «Python» или даёт файл `.py`
для узла; не заменяй его Калькулятором или JavaScript. Код выполняет Loginom:
Python 3.13 на сервере, в отдельном процессе (`execution_mode`
`external_process`, флажок мастера включён и недоступен). Сам значения не считай
и не выдумывай; при ошибке передай точный текст ошибки Loginom.

`dock_node_apply`: `target.type:"programming.python"`, `mode:"script"`,
таблица — к входу 0 (`inputs`), `finish:"execute"`, `read.ports:[0]`,
`read.sample_rows` до 100. Параметры:
- `source_text` — весь код дословно, строки LF; файл `.py` передай без
  изменений (до 2048 символов и 128 строк);
- `schema_mode:"code"` — включает «Разрешить формировать выходные столбцы из
  кода»: столбцы создаёт сам код (`prepare_compatible_table`, `AddColumn`)
  до первой строки; `columns` не передавай;
- `schema_mode:"declared"` — столбцы выхода заданы в мастере: `columns` в
  порядке выхода, у каждого `name`, `label`, `type` (`integer`, `real`,
  `string`, `boolean`, `datetime`), `data_kind` по схеме карточки и `usage`
  только «Не задано»; код только `OutputTable.Append()` и `Set(имя, значение)`.

`Set` в поле другого типа не падает, а приводит значение (в строковое поле
пишет `'1'`, `'True'`), поэтому тип каждого объявленного поля задавай явно.
Readback содержит `source_sha256` — SHA-256 сохранённого кода; сверь его с
SHA-256 файла пользователя. Текст кода в ответ не возвращается.

API: `from builtin_data import InputTable, OutputTable`; `InputTable` — None без
связи; `InputTable.RowCount`, `Get(row, имя|индекс)` даёт `int`, `float`, `str`,
`bool`, `datetime.datetime` или `None`; `IsNull` отличает пропуск от `''`.
pandas 2.2.3 и numpy 2.2.4 установлены: `from builtin_pandas_utils import
to_data_frame, prepare_compatible_table, fill_table`. Для целых и логических с
пропусками используй `to_data_frame(InputTable, True)`, иначе они станут
вещественными; логический столбец без пропусков `to_data_frame` отдаёт как
int8, и выход станет целым — приведи его `astype("boolean")`. `fill_table` пишет
None/NA/NaT/NaN как пропуск.

Существующий узел: `parameters:{}` с `finish:"execute"` выполняет сохранённый
код; замена кода — `source_text` и `expected_source_sha256` из readback.

Не поддержано: установка пакетов, сеть, файлы, подпроцессы, окружения (PY_ENV,
venv), входные переменные, дополнительные порты, `read.coverage:"full"`.
Импорт — только builtin_data, builtin_pandas_utils, pandas, numpy и
вычислительные модули стандартной библиотеки (math, cmath, datetime, decimal,
fractions, statistics, re, json, itertools, functools, collections, random).
Отклоняются известные опасные имена в любом месте кода, в том числе после
`from … import`: `open`, `eval`, `exec`, `__import__`, `read_*`, `to_csv`,
`to_string`, `load`, `dump`, `io`, `lib` и подобные; dunder-имена — и внутри
строк; не-ASCII символы вне строк и комментариев. Это список известных
запретов, не песочница. Такой код отклоняется до изменения узла: сообщи
пользователю, что этот режим пока не поддерживается.
<!-- /mode -->
