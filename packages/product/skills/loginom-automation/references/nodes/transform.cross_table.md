# Кросс-таблица (`transform.cross_table`)

<!-- mode: pivot -->
## Кросс-таблица

Строки × категории × агрегаты скалярных и Variant-фактов. Ключи строк допускают дискретные
string/integer/real/boolean/datetime и непрерывные integer/real; сохраняй исходный
вид данных. Колонки требуют дискретных полей. Равные числовые ключи, включая
0 и −0, объединяются; разные real не округляй. NULL-ключ образует отдельную
группу. Непрерывные и дискретные ключи сочетаются в fixed и sliding.
Перенастройка ролей требует полного набора row_keys, column/columns, facts,
category_mode и явного входа 0, в том числе для существующего узла.
Настройки сверяй по configuration.readback. После Done
или осмотра мастера выход деактивирован: перед следующим узлом или экспортом
снова выполни и прочитай ту же Кросс-таблицу через loginom_dock_node_read,
используя source_operation_id последней успешной настройки с finish=execute.
Если Execute ещё не было, выполни существующий узел с parameters:{} и finish=execute.
После смены источника читай тот же узел через loginom_dock_node_read с исходным
source_operation_id. Sliding обновляет схему и соответствие категории/факта/функции
полю без перенастройки; Fixed сохраняет начальный состав.
Минимум категорий резервирует пустые колонки; limit ограничивает их число.
limit, unique_names, separator привязываются к локальным переменным через
local_variables и bindings; меняй значения на том же узле. Собственный выход CrossTable допускает переименование,
порядок и автосинхронизацию при finish=execute; его обязательные источники нельзя
исключать. Для исключения добавь отдельный downstream transform.reform_columns.
После отказа исключения Required=true исправь запрос с новым operation_id.

Точное full-чтение: read.coverage="full", require_exact_numbers:true. Только
проверенная статическая цепочка import→CrossTable или import→Collapse→CrossTable,
своё завершённое исполнение, подтверждённые байты исходника, неизменные
схема/топология/исполнение. Лимиты: 50 строк, 8 полей, 1 MiB. Клиент проверяет
readonly protocol 321, subtype и native DateTime. Строка Variant не доказывает
значение. Для широких скалярных отчётов — точное чтение без coverage="full":
read:{ports:[0],sample_rows:100,
require_exact_numbers:true}; проверяй sample_complete и полный состав схемы.
После отказа полного native-чтения не обходи его обычным чтением Variant.
<!-- /mode -->
