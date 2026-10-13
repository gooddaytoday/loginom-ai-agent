Кросс-таблица: смена категорий того же источника

Два точных CSV из исходного manifest. Oracle.py независимо считает sum через Decimal для initial A/B и updated B/C; оба oracle зафиксированы до builder. Строки N затем S, допуск 0.

Один import и одна sliding CrossTable: row key Region, category Category, real Amount/sum, unique_names=true, без фиксированного output mapping начальных категорий. Полное initial execution/read с A/B завершается до начала применения sales-updated.csv к тому же import. Предварительная доставка updated CSV разрешена. Document/workflow/import/CrossTable ID неизменны.

Второе исполнение и полный fresh read — dock_node_read с исходным CrossTable source_operation_id, после completed source-change import receipt. Новое execution_id, новый schema/category_fields B/C: A исчезает, C появляется, B пересчитывается. После первого полного read любой CrossTable node_apply запрещён, включая parameters={} и mapping. Оба CSV delivery/import source proofs должны совпадать с точными bytes/SHA256. Финальный XML содержит updated import source и тот же реальный граф.

Первый полный read требует sample_complete и native exact frames с schema/coverage/owner/port/execution binding. dock_node_read не имеет read.coverage=full: второй read принимается по свежей полной выборке (sample_complete=true, sample_rows=row_count, все строки и типы), numbers_verified, новой completed execution, исходному port_guid и workflow_returned. Значения, schema и category_fields сверяются полностью; native exact_table второго read не заявляется, если API его не возвращает. Fresh output labels/category_fields доказывают категории; равная ширина таблицы и C_n не доказывают identity. Fresh export из окончательного CrossTable output и successful final save после второго read/export. Cold reference проверяет сохранённый updated источник/результат; историю initial → source change → reread проверяют полные events builder/live.

Негативы: altered second CSV, early source change/omitted initial full read, stale execution, changed import/CrossTable ID, new source_operation_id, repeat CrossTable apply, stale A/B schema при правильной ширине, неверные category_fields/CSV и missing artifact.
