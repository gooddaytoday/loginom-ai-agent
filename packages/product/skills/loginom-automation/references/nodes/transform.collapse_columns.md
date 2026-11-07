# Свертка столбцов (`transform.collapse_columns`)

Для transform.collapse_columns, служащего промежуточным источником в расширенном
графе, допускается finish="execute" с read:{ports:[0],sample_rows:0,
require_exact_numbers:false}; это выполняет узел без чтения промежуточной таблицы.
Изолированное native full-чтение Collapse не читает произвольный расширенный граф.

Это unpivot столбцов: каждое транспонируемое поле даёт строку на запись.
Используй этот узел, а не Калькулятор или JS, когда нужно превратить набор
столбцов в строки Names/DisplayNames/Values/DataTypes. В `dock_node_apply`
(режим `unpivot`) задай `information` и `transposed` — полные упорядоченные
списки `{kind:"input_field",name}` по эффективным именам входа, `ignore_empty`
явно и полный input/output mapping со всеми полями и их порядком.

Variant разрешён в `transposed`: поле Variant, в том числе выход другой
Свёртки, можно транспонировать. Сохраняй тип каждой ячейки, не превращай
смешанные значения в строки. Вход Variant в `information` не поддержан.
DataTypes описывает тип входного поля: для Variant это 6, даже если
конкретная ячейка содержит integer или string. Не считай это типом ячейки.
ignore_empty исключает NULL; пустая строка, false и 0 остаются значениями.
All-null и header-only сохраняют схему; при ignore_empty возможны нулевые
строки. Полный input/output mapping должен включать каждое требуемое поле,
порядок и источник Names/DisplayNames/Values/DataTypes. Полный Variant-reader
ограничен 50 строками и 8 полями; недоказанное происхождение не обходи
выборкой.
