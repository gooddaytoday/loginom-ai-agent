# Свертка столбцов (`transform.collapse_columns`)

Для transform.collapse_columns, служащего промежуточным источником в расширенном
графе, допускается finish="execute" с read:{ports:[0],sample_rows:0,
require_exact_numbers:false}; это выполняет узел без чтения промежуточной таблицы.
Изолированное native full-чтение Collapse не читает произвольный расширенный граф.
