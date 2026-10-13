# Сегменты активности клиентов по давности покупки

Импорт CSV → сегмент по давности покупки → группировка → сортировка → экспорт.

Имена файла пакета и файла результата задаёт harness; при оценке они не учитываются.

## Назначение

Границы 90 и 180 дней входят в сегмент, а не уходят в следующий.

## Сценарий

| Узел | Компонент | Настройка |
|:-----|:----------|:----------|
| Импорт клиентов — dataset.csv | Текстовый файл | загруженная копия `dataset.csv`, разделитель `,`, первая строка — заголовок |
| Сегментация клиентов | Калькулятор | `IF(days_since_last_purchase <= 90, "active", IF(days_since_last_purchase <= 180, "at_risk", "churned"))` |
| Показатели по сегментам | Группировка | ключ — сегмент; число клиентов, средние `total_spent`, `total_transactions` и `avg_order_value` |
| Порядок active, at_risk, churned | Сортировка | заданный порядок трёх сегментов |
| Итоговый CSV | Текстовый файл | разделитель `,`, заголовок из имён колонок; колонки `segment, customers, avg_total_spent, avg_transactions, avg_order_value` |

Связи: Импорт → Сегментация → Показатели по сегментам → Порядок → Итоговый CSV.

## Входные данные

`dataset.csv` — 600 клиентов, колонки `customer_id, registration_date, total_transactions, avg_order_value, days_since_last_purchase, total_spent, tenure_days, support_tickets, category_pref, is_active`; копия `analitic-tasks/task14-customer-value/data/dataset.csv` без изменений.

## Ожидаемый результат

3 строки: active 70 клиентов, at_risk 77, churned 453. active: `avg_total_spent` 5923.118571, `avg_transactions` 15.128571, `avg_order_value` 2791.233. Допуск ±0.01.
