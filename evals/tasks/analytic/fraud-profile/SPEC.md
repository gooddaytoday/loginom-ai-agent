# Сравнение обычных и мошеннических транзакций

Импорт CSV → группировка по `fraud` → сортировка → экспорт.

Имена файла пакета и файла результата задаёт harness; при оценке они не учитываются.

## Назначение

Две группы, обычные и мошеннические транзакции, с максимумом суммы. Этот кейс заменяет `feature-conversion`: свёртка восьми флагов за три попытки пакет не сохранила.

## Сценарий

| Узел | Компонент | Настройка |
|:-----|:----------|:----------|
| Импорт dataset.csv | Текстовый файл | загруженная копия `dataset.csv`, разделитель `,`, первая строка — заголовок; `fraud` и `account_age_days` — целые, `amount` — вещественное |
| Показатели по fraud | Группировка | ключ `fraud`; число транзакций, среднее и максимум `amount`, среднее `account_age_days` |
| fraud по возрастанию | Сортировка | `fraud` по возрастанию: сначала 0, затем 1 |
| Экспорт fraud profile CSV | Текстовый файл | разделитель `,`, заголовок из имён колонок; колонки `fraud, transactions, avg_amount, max_amount, avg_account_age_days` |

Связи: Импорт dataset.csv → Показатели по fraud → fraud по возрастанию → Экспорт fraud profile CSV.

## Входные данные

`dataset.csv` — 1000 транзакций, колонки `transaction_id, amount, transaction_type, account_age_days, num_transactions_today, merchant_category, is_foreign, hour_of_day, fraud`; копия `analitic-tasks/task28-fraud-detection/data/dataset.csv` без изменений.

## Ожидаемый результат

2 строки. `fraud` 0: `transactions` 922, `avg_amount` 65.923796, `max_amount` 6497.01, `avg_account_age_days` 1806.088937. `fraud` 1: `transactions` 78, `avg_amount` 167.709487, `max_amount` 1521.42, `avg_account_age_days` 1728.384615. Допуск ±0.01.
