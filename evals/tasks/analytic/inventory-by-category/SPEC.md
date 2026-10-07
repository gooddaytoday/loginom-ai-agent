# Оборачиваемость и маржа запасов по категориям

Импорт CSV → группировка по категории → две доли из сумм → состав колонок → сортировка по марже → экспорт.

Имена файла пакета и файла результата задаёт harness; при оценке они не учитываются.

## Назначение

Оборачиваемость и маржа считаются из сумм категории, а не из средних отношений по товарам. Этот кейс заменяет `sector-allocation`: взвешенная доходность за три попытки пакет не сохранила.

## Сценарий

| Узел | Компонент | Настройка |
|:-----|:----------|:----------|
| Импорт товаров | Текстовый файл | загруженная копия `dataset.csv`, разделитель `,`, первая строка — заголовок |
| Итоги по категориям | Группировка | ключ `category`; число товаров, суммы `stock_level`, `demand_30d`, `selling_price` и `cost_price` |
| Оборачиваемость и маржа | Калькулятор | `source_demand / total_stock`; `(total_selling - total_cost) / total_selling * 100` |
| Колонки итогового CSV | Группировка | оставляет `category, products, total_stock, total_demand, turnover, margin_pct` |
| Маржа по убыванию | Сортировка | `margin_pct` по убыванию |
| Экспорт итогового CSV | Текстовый файл | разделитель `,`, заголовок из имён колонок |

Связи: Импорт товаров → Итоги по категориям → Оборачиваемость и маржа → Колонки итогового CSV → Маржа по убыванию → Экспорт итогового CSV.

## Входные данные

`dataset.csv` — 300 товаров, колонки `product_id, product_name, category, stock_level, reorder_point, lead_time_days, demand_30d, selling_price, cost_price, supplier, stockout_risk, excess_stock`; копия `analitic-tasks/task18-inventory/data/dataset.csv` без изменений.

## Ожидаемый результат

5 строк по убыванию `margin_pct`: Clothing, Tools, Food, Electronics, Books. Clothing: `products` 63, `total_stock` 142315, `total_demand` 6313, `turnover` 0.044359, `margin_pct` 34.547591. Books: `margin_pct` 10.214537. Допуск ±0.01.
