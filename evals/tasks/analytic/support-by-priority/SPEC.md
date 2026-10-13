# Поддержка по приоритетам в заданном порядке

Импорт CSV → признак FCR и номер приоритета → группировка → сортировка по номеру → отбор шести колонок → экспорт.

Имена файла пакета и файла результата задаёт harness; при оценке они не учитываются.

## Назначение

Строки идут в порядке critical, high, medium, low. Номер порядка в файл не попадает.

## Сценарий

| Узел | Компонент | Настройка |
|:-----|:----------|:----------|
| Импорт обращений — dataset.csv | Текстовый файл | загруженная копия `dataset.csv`, разделитель `,`, первая строка — заголовок |
| FCR в процентах и порядок приоритетов | Калькулятор | `100 * first_contact_resolution`; `DecodeN(priority, "critical", 1, "high", 2, "medium", 3, "low", 4, 5)` |
| Показатели обращений по priority | Группировка | ключ `priority`; число обращений, средние времени ответа и решения, среднее признака FCR, средняя satisfaction, номер порядка |
| Порядок critical → high → medium → low | Сортировка | номер порядка по возрастанию |
| Итоговые 6 колонок без номера порядка | Параметры полей | в выход остаются `priority, tickets, avg_response_min, avg_resolution_hours, fcr_pct, avg_satisfaction` |
| Экспорт итогового CSV | Текстовый файл | разделитель `,`, заголовок из имён колонок |

Связи: Импорт → FCR и порядок → группировка → сортировка → шесть колонок → экспорт.

## Входные данные

`dataset.csv` — 400 обращений, колонки `ticket_id, department, priority, response_time_min, resolution_time_hours, satisfaction, first_contact_resolution, agent_experience_months, tickets_per_agent`; копия `analitic-tasks/task39-support-analytics/data/dataset.csv` без изменений.

## Ожидаемый результат

4 строки: critical, high, medium, low. critical: `tickets` 39, `avg_response_min` 26.923077, `avg_resolution_hours` 8.233333, `fcr_pct` 66.666667, `avg_satisfaction` 2.923077. Допуск ±0.01.
