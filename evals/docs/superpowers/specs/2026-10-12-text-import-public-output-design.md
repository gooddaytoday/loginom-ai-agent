# Native checkpoint и public user-v1 output

Следующий подтверждённый блокер LAB-57 — equality native/public output.
Receipt Evaler SHA256 4db62756a66ec3fbfb3273f8e32dd725614d804699ad251dfe697d3487209026:
status/node/configuration/execution/cleanup совпадают; public output штатно
проецируется compactNodeResult из exact CLI 5cd74d8ee5d6125692d953eb327b4d4f833c27a1.
В реальных events/native journal отличаются только представления output:
private read proofs, freshness_basis/table_schema_id/filter_enabled,
schema.header_tid и workflow_return → workflow_returned. Samples совпадают.

Варианты: сравнение whole dict отвергает корректный API; игнорирование output
ослабляет связывание доказательств; точная user-v1 проекция сохраняет его.
Выбрана проекция по ключам compactNodeResult: public output/ports/schema/sample,
без изменения типов/значений/порядка/NULL/Decimal/identity/coverage/precision.
Повторить также штатное удаление display_text, только когда оно равно value,
и пересчёт sample_rows/sample_complete из фактической sample. До этого raw
typed_table проверяет исходные counts/completeness/precision, поэтому пересчёт
не скрывает противоречивую native таблицу. budgetUserPreview не воспроизводится:
изменённый бюджетом/усечённый public output не удовлетворяет обязательному full
data контракту и остаётся FAIL; нормализация не дописывает значения или Decimal.
Проверять всю проекцию на равенство public output; status/node/configuration/
execution/cleanup сравниваются по-прежнему. Для complete native output дополнительно
вызвать существующий typed_table до проекции: она не должна скрывать неполноту
или отсутствие exact-number proof. Явные native verified/cleanup_complete=false
не могут стать PASS после удаления приватных полей. Не обходить raw journal
hash/ownership/inventory gates; они остаются обязательными.

Изменения только evals/script/check-text-import.py и публичные regression tests
validateNodeAttempt. Legacy synthetic frames без private extras сохраняются.
Проверить штатную проекцию, schema/values/GUID/execution/precision/completeness
мутации и false private read flags. На доставленном real checkpoint отдельно
проверить binding и канонические typed tables; это не полный warm/cold ACCEPT.

Имя-input patch 7c463a35f уже перенесён Rich в partial 2c02eb9c5fde7eea2ff013ccd40c8a4417a1e9a7.
CLI/model/oracle/критерии не меняются. Reference txt-comma-utf8 — 1/3,
остальные — 0/3, admission — 3/3. Native capacity continuation — 1/1:
новый Rich запуск и смена модели этим исправлением не разрешаются. Готовую
поставку передать Evaler для offline проверки; capacity решение остаётся отдельно.
