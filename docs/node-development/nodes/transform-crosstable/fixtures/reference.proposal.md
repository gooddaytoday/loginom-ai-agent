# Кросс-таблица (`transform.cross_table`)

<!-- mode: pivot -->
Строки × категории × агрегаты. Ключи строк: дискретные string/integer/real/boolean/datetime
или непрерывные integer/real. Колонки только дискретные. Не округляй ключи;
0 и −0 равны, NULL — отдельная группа. Роли задавай полными row_keys,
column/columns, facts, category_mode и входом 0; сверяй configuration.readback.

Числа: sum/count/min/max/avg/stddev/sum_squares/unique_count/null_count/first/last.
Строка, Boolean, Variant: count/min/max/unique_count/null_count/first/last.
DateTime: те же плюс avg/stddev. Медиана, мода, «Единственного» недоступны в 7.4.2.
Сумма integer → real; счётчики → integer; min/max/first/last сохраняют тип,
у Variant — subtype. avg → real либо DateTime; stddev → real, для дат в днях.
Count включает NULL, unique_count исключает NULL. В all-NULL группе счётчики
дают n/0/n; прочие функции NULL. У отсутствующего пересечения все функции NULL,
включая Count. First/Last учитывают порядок и NULL. Variant Min включает NULL,
скалярный Min его пропускает. Stddev выборочное; единственное непустое значение → 0.

Fixed сохраняет категории, sliding обновляет их после смены источника.
Для обновления читай тот же узел через loginom_dock_node_read с исходным
source_operation_id, не перенастраивай его. После Done или осмотра мастера
нужно свежее Execute. Если Execute ещё не было, примени существующий узел
с parameters:{} и finish=execute. min_values резервирует колонки, limit
ограничивает их число. limit/unique_names/separator поддерживают local_variables
и bindings. Переименование, порядок, автосинхронизация выхода — finish=execute.
Required-источники выхода исключать нельзя; используй downstream
transform.reform_columns. После отказа исправленный запрос имеет новый operation_id.

Точное full-чтение: coverage="full", require_exact_numbers:true; до 50 строк,
8 полей и 1 MiB. Это cap клиента. Нужны своя завершённая статическая цепочка
import→CrossTable либо import→Collapse→CrossTable, подтверждённые байты исходника,
неизменные схема/топология/исполнение. Проверяются protocol 321, subtype,
native DateTime. Для широких скалярных отчётов — без coverage="full":
read:{ports:[0],sample_rows:100,require_exact_numbers:true}; проверь sample_complete
и всю схему. После отказа full не обходи его обычным чтением Variant.
<!-- /mode -->
