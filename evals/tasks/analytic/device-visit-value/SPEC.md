# Конверсия и выручка по устройствам

Импорт CSV → группировка → калькулятор → сортировка → экспорт.

Имена файла пакета и файла результата задаёт harness; при оценке они не учитываются.

## Назначение

`conversion_pct` — доля визитов с `converted = 1`. `revenue_per_visit` — сумма `revenue`, делённая на число визитов, а не на число конверсий. Обе суммы остаются в выгрузке.

## Сценарий

| Узел | Компонент | Настройка |
|:-----|:----------|:----------|
| Импорт dataset.csv | Текстовый файл | загруженная копия `dataset.csv`, разделитель `,`, первая строка — заголовок |
| Визиты, конверсии и revenue по device | Группировка | ключ `device`; число визитов, сумма `converted`, сумма `revenue` |
| conversion_pct и revenue_per_visit | Калькулятор | `conversions / visits * 100` и `total_revenue / visits`; число визитов, число конверсий и сумма выручки не скрываются |
| Убывание conversion_pct | Сортировка | `conversion_pct` по убыванию |
| Экспорт результата CSV | Текстовый файл | разделитель `,`, колонки `device`, `visits`, `conversions`, `conversion_pct`, `total_revenue`, `revenue_per_visit` |

Связи: Импорт dataset.csv → Визиты, конверсии и revenue по device → conversion_pct и revenue_per_visit → Убывание conversion_pct → Экспорт результата CSV.

## Входные данные

`dataset.csv` — 500 визитов, копия `analitic-tasks/task31-web-conversion/data/dataset.csv` без изменений.

## Ожидаемый результат

3 строки по убыванию конверсии, допуск ±0.01. Первая — desktop, `conversion_pct` 29.411765, `revenue_per_visit` 51.076209. Последняя — mobile. По сумме выручки первым был бы mobile.
