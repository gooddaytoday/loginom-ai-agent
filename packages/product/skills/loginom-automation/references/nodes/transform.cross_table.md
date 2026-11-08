# Кросс-таблица (`transform.cross_table`)

<!-- mode: pivot -->
Агрегаты: transform.cross_table, mode:pivot. Без колонок:
columns:[], row_keys, facts с functions, category_mode:fixed,
include_null:false, include_other:false. Колонки — дискретные;
ключи строк — дискретных string/integer/real/boolean/datetime либо непрерывных
integer/real. Непрерывные и дискретные ключи сочетаются в fixed и sliding.
Не округляй real-ключи; 0 и −0 равны, NULL — отдельная группа.
Перенастройка: полные row_keys, column/columns, facts, category_mode
и явный вход 0. Сверяй configuration.readback.

Числа: sum/count/min/max/avg/stddev/sum_squares/unique_count/null_count/first/last.
Строка, Boolean, Variant: count/min/max/unique_count/null_count/first/last.
DateTime: те же плюс avg/stddev.
sum integer → real; счётчики → integer; min/max/first/last сохраняют тип,
Variant — subtype. avg → real либо DateTime; stddev → real, для дат в днях.
Count включает NULL, unique_count исключает NULL. All-NULL: счётчики n/0/n,
остальные NULL. Нет пересечения — все NULL, включая Count.
First/Last учитывают порядок и NULL. Variant Min включает NULL, скалярный — нет.
Stddev выборочное; одно непустое значение → 0.

После Done или осмотра мастера выход деактивирован: перед следующим узлом или экспортом
снова выполни и прочитай ту же Кросс-таблицу через loginom_dock_node_read,
используя source_operation_id последней успешной настройки с finish=execute.
Если Execute ещё не было, примени существующий узел с parameters:{} и finish=execute.
После смены источника читай тот же узел с исходным source_operation_id:
sliding обновляет схему и соответствие категории/факта/функции полю без
перенастройки; fixed сохраняет начальный состав. min_values резервирует колонки,
limit ограничивает число. limit/unique_names/separator: local_variables и bindings;
меняй значения на том же узле. Переименование, порядок, автосинхронизация выхода —
finish=execute. Required-источники исключать нельзя; используй downstream
transform.reform_columns. После отказа исправь запрос с новым operation_id.

Точное full-чтение: read.coverage="full", require_exact_numbers:true. Лимиты:
50 строк, 8 полей, 1 MiB. Нужны своя завершённая статическая цепочка import→CrossTable
либо import→Collapse→CrossTable, подтверждённые байты исходника, неизменные
схема/топология/исполнение. Проверяются readonly protocol 321, subtype, native DateTime.
Строка Variant не доказывает значение. Для широких скалярных отчётов — без coverage="full":
read:{ports:[0],sample_rows:100,require_exact_numbers:true}; проверь sample_complete
и весь состав схемы. После отказа full не обходи его обычным чтением Variant.
<!-- /mode -->
