## Исходные данные D1 — переиспользовать без копий

| Сценарий | CSV |
|---|---|
| s1-revenue | [sales.csv](../../../demo-2026-10-22/s1-revenue/data/sales.csv) |
| s2-customers | [customers.csv](../../../demo-2026-10-22/s2-customers/data/customers.csv) |
| s3-reconcile | [orders.csv](../../../demo-2026-10-22/s3-reconcile/data/orders.csv), [payments.csv](../../../demo-2026-10-22/s3-reconcile/data/payments.csv) |
| s4-branches | [north.csv](../../../demo-2026-10-22/s4-branches/data/north.csv), [south.csv](../../../demo-2026-10-22/s4-branches/data/south.csv), [central.csv](../../../demo-2026-10-22/s4-branches/data/central.csv) |
| s5-pivot | [sales.csv](../../../demo-2026-10-22/s5-pivot/data/sales.csv) |
| s6-abc | [products.csv](../../../demo-2026-10-22/s6-abc/data/products.csv) |

Для n1–n6 создать новые синтетические CSV в собственном `data/` каждой задачи:
UTF-8 без BOM, первая строка — заголовок, разделитель — запятая, десятичный
разделитель — точка, 6–20 строк данных в каждом файле, без персональных данных.
Не копировать бизнес-вопросы и комбинации исходных демо-сценариев.
Правила D1: [README](../../../demo-2026-10-22/README.md).
